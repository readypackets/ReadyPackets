/**
 * IP blacklist gate — the first stage of the request pipeline.
 *
 * The blacklist is cached in process for ten seconds so that a blocked source
 * cannot force a database read per request, which would turn the control into an
 * amplification vector. Blocked responses carry no explanatory detail.
 */
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { ipAllowlist, ipBlacklist } from "../db/schema.js";
import { logger } from "../observability/logger.js";
import { recordSecurityEvent } from "../observability/audit.js";
import { ipMatchesPattern, resolveClientIp } from "./ipAddress.js";
import { affectedRows } from "../db/result.js";

const CACHE_TTL_MS = 10_000;

interface BlacklistEntry {
  id: number;
  pattern: string;
}

interface AllowlistEntry {
  pattern: string;
  scope: string;
}

let blacklistCache: { entries: BlacklistEntry[]; loadedAt: number } | null = null;
let allowlistCache: { entries: AllowlistEntry[]; loadedAt: number } | null = null;

export function invalidateIpCaches(): void {
  blacklistCache = null;
  allowlistCache = null;
}

async function loadBlacklist(): Promise<BlacklistEntry[]> {
  if (blacklistCache && Date.now() - blacklistCache.loadedAt < CACHE_TTL_MS) {
    return blacklistCache.entries;
  }
  let entries: BlacklistEntry[] = [];
  try {
    entries = await db
      .select({ id: ipBlacklist.id, pattern: ipBlacklist.pattern })
      .from(ipBlacklist)
      .where(or(isNull(ipBlacklist.expiresAt), gt(ipBlacklist.expiresAt, new Date())));
  } catch (error) {
    logger.error("Failed to load IP blacklist", { error });
    entries = blacklistCache?.entries ?? [];
  }
  blacklistCache = { entries, loadedAt: Date.now() };
  return entries;
}

async function loadAllowlist(): Promise<AllowlistEntry[]> {
  if (allowlistCache && Date.now() - allowlistCache.loadedAt < CACHE_TTL_MS) {
    return allowlistCache.entries;
  }
  let entries: AllowlistEntry[] = [];
  try {
    entries = await db
      .select({ pattern: ipAllowlist.pattern, scope: ipAllowlist.scope })
      .from(ipAllowlist);
  } catch (error) {
    logger.error("Failed to load IP allowlist", { error });
    entries = allowlistCache?.entries ?? [];
  }
  allowlistCache = { entries, loadedAt: Date.now() };
  return entries;
}

export async function isIpAllowlisted(address: string, scope: string): Promise<boolean> {
  const entries = await loadAllowlist();
  return entries.some(
    (entry) =>
      (entry.scope === scope || entry.scope === "all") &&
      ipMatchesPattern(address, entry.pattern),
  );
}

/** Add or extend a blacklist entry. Used by the rate limiter and by admins. */
export async function blacklistIp(options: {
  pattern: string;
  reason: string;
  source?: string;
  expiresAt?: Date | null;
  createdByUserId?: number | null;
}): Promise<void> {
  await db
    .insert(ipBlacklist)
    .values({
      pattern: options.pattern,
      patternType: options.pattern.includes("/")
        ? "cidr"
        : options.pattern.includes("-")
          ? "range"
          : "single",
      reason: options.reason.slice(0, 255),
      source: options.source ?? "automatic",
      expiresAt: options.expiresAt ?? null,
      createdByUserId: options.createdByUserId ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        reason: options.reason.slice(0, 255),
        expiresAt: options.expiresAt ?? null,
      },
    });
  invalidateIpCaches();
}

export function ipBlacklistMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const address = resolveClientIp(req);
    res.locals.clientIp = address;

    // Health checks originate from the host itself and must never be blocked.
    if (req.path === "/api/health" && (address === "127.0.0.1" || address === "::1")) {
      next();
      return;
    }

    try {
      const entries = await loadBlacklist();
      const match = entries.find((entry) => ipMatchesPattern(address, entry.pattern));
      if (match) {
        void db
          .update(ipBlacklist)
          .set({ hitCount: sql`${ipBlacklist.hitCount} + 1`, lastHitAt: new Date() })
          .where(eq(ipBlacklist.id, match.id))
          .catch(() => undefined);
        void recordSecurityEvent({
          eventType: "ip.blocked",
          outcome: "blocked",
          severity: "warning",
          message: `Blocked request from blacklisted address matching ${match.pattern}`,
          ipAddress: address,
          userAgent: req.headers["user-agent"]?.slice(0, 255) ?? null,
          metadata: { path: req.path, method: req.method },
        });
        res.status(403).type("text/plain").send("Forbidden");
        return;
      }
    } catch (error) {
      // Fail open on an infrastructure fault; the alternative is a self-inflicted outage.
      logger.error("IP blacklist check failed", { error });
    }
    next();
  };
}

/** Purge expired blacklist rows. Invoked by the scheduler. */
export async function purgeExpiredBlacklistEntries(): Promise<number> {
  const result = await db
    .delete(ipBlacklist)
    .where(and(sql`${ipBlacklist.expiresAt} IS NOT NULL`, sql`${ipBlacklist.expiresAt} < NOW()`));
  invalidateIpCaches();
  return affectedRows(result);
}
