import { createHash, createHmac } from "node:crypto";
import type { Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { cookieConsentRecords } from "../db/schema.js";
import { randomToken } from "../security/crypto.js";
import { getSetting } from "./settings.js";

export const COOKIE_CONSENT_COOKIE = `${env.cookiePrefix}rp_cookie_consent`;
export const COOKIE_CONSENT_VERSION = "2026.08.19";
const COOKIE_CONSENT_TTL_DAYS = 180;

export type ConsentAction = "accepted_all" | "rejected_optional" | "saved_preferences";
export interface CookiePreferences {
  essential: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
}

export interface ConsentConfig {
  version: string;
  analyticsAvailable: boolean;
  marketingAvailable: boolean;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function evidenceHash(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHmac("sha256", env.emailIndexKey).update(value, "utf8").digest("hex");
}

export function normalizeCookiePreferences(input: Partial<CookiePreferences>, config: ConsentConfig): CookiePreferences {
  return {
    essential: true,
    preferences: input.preferences === true,
    analytics: config.analyticsAvailable && input.analytics === true,
    marketing: config.marketingAvailable && input.marketing === true,
  };
}

export async function getConsentConfig(): Promise<ConsentConfig> {
  const [version, analyticsEnabled, marketingEnabled] = await Promise.all([
    getSetting("privacy.cookie_consent_version"),
    getSetting("privacy.analytics_tracking_enabled"),
    getSetting("privacy.marketing_tracking_enabled"),
  ]);
  return {
    version: version?.trim() || COOKIE_CONSENT_VERSION,
    analyticsAvailable: analyticsEnabled === "true",
    marketingAvailable: marketingEnabled === "true",
  };
}

function setConsentCookie(res: Response, token: string): void {
  res.cookie(COOKIE_CONSENT_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function toPreferences(row: {
  preferencesAllowed: boolean;
  analyticsAllowed: boolean;
  marketingAllowed: boolean;
}): CookiePreferences {
  return {
    essential: true,
    preferences: row.preferencesAllowed,
    analytics: row.analyticsAllowed,
    marketing: row.marketingAllowed,
  };
}

export async function getCurrentCookieConsent(req: Request): Promise<{ preferences: CookiePreferences | null; version: string; config: ConsentConfig }> {
  const config = await getConsentConfig();
  const token = req.cookies?.[COOKIE_CONSENT_COOKIE] as string | undefined;
  if (!token || token.length > 256) return { preferences: null, version: config.version, config };
  const rows = await db
    .select({
      preferencesAllowed: cookieConsentRecords.preferencesAllowed,
      analyticsAllowed: cookieConsentRecords.analyticsAllowed,
      marketingAllowed: cookieConsentRecords.marketingAllowed,
      consentVersion: cookieConsentRecords.consentVersion,
    })
    .from(cookieConsentRecords)
    .where(and(eq(cookieConsentRecords.consentTokenHash, digest(token)), eq(cookieConsentRecords.consentVersion, config.version)))
    .orderBy(desc(cookieConsentRecords.createdAt))
    .limit(1);
  const row = rows[0];
  return { preferences: row ? toPreferences(row) : null, version: config.version, config };
}

export async function saveCookieConsent(
  req: Request,
  res: Response,
  input: Partial<CookiePreferences>,
  action: ConsentAction,
  userId: number | null,
): Promise<{ preferences: CookiePreferences; version: string }> {
  const config = await getConsentConfig();
  const preferences = normalizeCookiePreferences(input, config);
  const token = randomToken(32);
  await db.insert(cookieConsentRecords).values({
    consentTokenHash: digest(token),
    userId,
    consentVersion: config.version,
    preferencesAllowed: preferences.preferences,
    analyticsAllowed: preferences.analytics,
    marketingAllowed: preferences.marketing,
    action,
    ipHash: evidenceHash((res.locals.clientIp as string | undefined) ?? null),
    userAgentHash: evidenceHash(typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 512) : null),
  });
  setConsentCookie(res, token);
  return { preferences, version: config.version };
}

export async function getConsentOverview(): Promise<{ total: number; acceptedAll: number; essentialOnly: number; custom: number; analyticsEnabled: boolean; marketingEnabled: boolean; version: string }> {
  const config = await getConsentConfig();
  const rows = await db
    .select({ action: cookieConsentRecords.action })
    .from(cookieConsentRecords)
    .where(eq(cookieConsentRecords.consentVersion, config.version));
  return {
    total: rows.length,
    acceptedAll: rows.filter((row) => row.action === "accepted_all").length,
    essentialOnly: rows.filter((row) => row.action === "rejected_optional").length,
    custom: rows.filter((row) => row.action === "saved_preferences").length,
    analyticsEnabled: config.analyticsAvailable,
    marketingEnabled: config.marketingAvailable,
    version: config.version,
  };
}
