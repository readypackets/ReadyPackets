/**
 * Administrative security and system operations.
 *
 * This router exposes the controls that a self-hosted operator needs in order to
 * run the platform without shell access: rate limits, IP lists, feature flags,
 * settings, log review, alert handling, backups, and health.
 *
 * Secret settings are write-only through this API. A secret's value is never
 * returned, only whether it is present, so the admin panel cannot be used to
 * read credentials out of the database.
 */
import { TRPCError } from "@trpc/server";
import { notifyMaintenanceStart, notifyMaintenanceEnd } from "../services/maintenanceNotify.js";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import {
  activityLogs,
  apiKeys,
  backupLog,
  emailLog,
  emailQueue,
  featureFlags,
  ipAllowlist,
  ipBlacklist,
  rateLimitConfigs,
  samlConfigs,
  securityLogs,
  siteSettings,
  systemAlerts,
  userSessions,
  users,
} from "../db/schema.js";
import { hashToken, randomToken } from "../security/crypto.js";
import { displayNameOf, getUserById } from "../db/users.js";
import { recordActivity, recordSecurityEvent } from "../observability/audit.js";
import {
  DEFAULT_RATE_LIMITS,
  getAllFeatureFlags,
  invalidateSettingsCache,
  setFeatureFlag,
  setSetting,
} from "../services/settings.js";
import { blacklistIp, invalidateIpCaches } from "../security/ipBlacklist.js";
import { detectPatternType } from "../security/ipAddress.js";
import { countQueuedEmails, sendTestEmail } from "../services/email.js";
import { revokeAllUserSessions, revokeSession } from "../auth/session.js";
import { pingDatabase } from "../db/client.js";
import { adminProcedure, router } from "../trpc/trpc.js";
import { RATE_LIMIT_CATEGORIES } from "../../shared/domain.js";
import { affectedRows } from "../db/result.js";

const ipPatternSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(
    /^[0-9a-fA-F.:/-]+$/,
    "Enter a single address, a CIDR block such as 203.0.113.0/24, or a range such as 203.0.113.1-203.0.113.50.",
  );

export const adminSecurityRouter = router({
  /* ---------------------------------------------------------------- */
  /* Rate limiting                                                     */
  /* ---------------------------------------------------------------- */

  rateLimits: adminProcedure.query(async () => {
    const rows = await db.select().from(rateLimitConfigs);
    const stored = new Map(rows.map((row) => [row.category, row]));
    return RATE_LIMIT_CATEGORIES.map((category) => {
      const row = stored.get(category);
      const fallback = DEFAULT_RATE_LIMITS[category];
      return {
        category,
        label: row?.label ?? fallback.label,
        windowSeconds: row?.windowSeconds ?? fallback.windowSeconds,
        maxRequests: row?.maxRequests ?? fallback.maxRequests,
        enabled: row?.enabled ?? fallback.enabled,
        penaltyEnabled: row?.penaltyEnabled ?? fallback.penaltyEnabled,
      };
    });
  }),

  updateRateLimit: adminProcedure
    .input(
      z.object({
        category: z.enum(RATE_LIMIT_CATEGORIES),
        windowSeconds: z.number().int().min(10).max(86_400),
        maxRequests: z.number().int().min(1).max(100_000),
        enabled: z.boolean(),
        penaltyEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(rateLimitConfigs)
        .values({
          category: input.category,
          label: DEFAULT_RATE_LIMITS[input.category].label,
          windowSeconds: input.windowSeconds,
          maxRequests: input.maxRequests,
          enabled: input.enabled,
          penaltyEnabled: input.penaltyEnabled,
        })
        .onDuplicateKeyUpdate({
          set: {
            windowSeconds: input.windowSeconds,
            maxRequests: input.maxRequests,
            enabled: input.enabled,
            penaltyEnabled: input.penaltyEnabled,
          },
        });
      invalidateSettingsCache();

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "security.rate_limit_update",
        entityType: "rate_limit",
        entityId: input.category,
        severity: "notice",
        summary: `Rate limit for ${input.category} set to ${input.maxRequests} per ${input.windowSeconds}s`,
        changes: { ...input },
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* IP lists                                                          */
  /* ---------------------------------------------------------------- */

  blacklist: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(200) }).optional())
    .query(async ({ input }) =>
      db
        .select()
        .from(ipBlacklist)
        .orderBy(desc(ipBlacklist.createdAt))
        .limit(input?.limit ?? 200),
    ),

  addToBlacklist: adminProcedure
    .input(
      z.object({
        pattern: ipPatternSchema,
        reason: z.string().trim().min(3).max(255),
        expiresInHours: z.number().int().min(1).max(8_760).nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Refuse to lock the operator out of their own session.
      if (input.pattern === ctx.clientIp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That is your current address. Blocking it would end your own session.",
        });
      }
      await blacklistIp({
        pattern: input.pattern,
        reason: input.reason,
        source: "manual",
        expiresAt:
          input.expiresInHours === null
            ? null
            : new Date(Date.now() + input.expiresInHours * 3_600_000),
        createdByUserId: ctx.session.user.id,
      });
      void recordSecurityEvent({
        eventType: "ip.blocked",
        severity: "notice",
        message: `Administrator blacklisted ${input.pattern}`,
        userId: ctx.session.user.id,
        ipAddress: ctx.clientIp,
        metadata: { pattern: input.pattern, reason: input.reason },
      });
      return { ok: true as const };
    }),

  removeFromBlacklist: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(ipBlacklist).where(eq(ipBlacklist.id, input.id));
      invalidateIpCaches();
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "security.blacklist_remove",
        entityType: "ip_blacklist",
        entityId: input.id,
        summary: "Blacklist entry removed",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  allowlist: adminProcedure.query(async () =>
    db.select().from(ipAllowlist).orderBy(desc(ipAllowlist.createdAt)).limit(200),
  ),

  addToAllowlist: adminProcedure
    .input(
      z.object({
        pattern: ipPatternSchema,
        scope: z.enum(["admin", "maintenance", "all"]).default("admin"),
        note: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(ipAllowlist)
        .values({
          pattern: input.pattern,
          patternType: detectPatternType(input.pattern),
          scope: input.scope,
          note: input.note ?? null,
          createdByUserId: ctx.session.user.id,
        })
        .onDuplicateKeyUpdate({ set: { scope: input.scope, note: input.note ?? null } });
      invalidateIpCaches();
      return { ok: true as const };
    }),

  removeFromAllowlist: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.delete(ipAllowlist).where(eq(ipAllowlist.id, input.id));
      invalidateIpCaches();
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Logs                                                              */
  /* ---------------------------------------------------------------- */

  securityLogs: adminProcedure
    .input(
      z
        .object({
          severity: z.enum(["debug", "info", "notice", "warning", "error", "critical"]).optional(),
          eventType: z.string().trim().max(64).optional(),
          limit: z.number().int().min(1).max(500).default(100),
          offset: z.number().int().min(0).max(50_000).default(0),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.severity) conditions.push(eq(securityLogs.severity, input.severity));
      if (input?.eventType) conditions.push(eq(securityLogs.eventType, input.eventType));

      const rows = await db
        .select()
        .from(securityLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(securityLogs.createdAt))
        .limit(input?.limit ?? 100)
        .offset(input?.offset ?? 0);

      return rows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        severity: row.severity,
        outcome: row.outcome,
        message: row.message,
        userId: row.userId,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        metadata: row.metadata,
        createdAt: row.createdAt,
      }));
    }),

  activityLogs: adminProcedure
    .input(
      z
        .object({
          action: z.string().trim().max(96).optional(),
          entityType: z.string().trim().max(48).optional(),
          limit: z.number().int().min(1).max(500).default(100),
          offset: z.number().int().min(0).max(50_000).default(0),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.action) conditions.push(eq(activityLogs.action, input.action));
      if (input?.entityType) conditions.push(eq(activityLogs.entityType, input.entityType));

      const rows = await db
        .select()
        .from(activityLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(activityLogs.createdAt))
        .limit(input?.limit ?? 100)
        .offset(input?.offset ?? 0);

      const names = new Map<number, string>();
      for (const actorId of new Set(rows.map((row) => row.actorUserId).filter(Boolean))) {
        const user = await getUserById(actorId as number);
        names.set(actorId as number, user ? displayNameOf(user) : "Deleted user");
      }

      return rows.map((row) => ({
        id: row.id,
        actor: row.actorUserId ? names.get(row.actorUserId) ?? "Unknown" : "System",
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        severity: row.severity,
        summary: row.summary,
        changes: row.changes,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt,
      }));
    }),

  emailLog: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ input }) =>
      db
        .select({
          id: emailLog.id,
          templateKey: emailLog.templateKey,
          subject: emailLog.subject,
          status: emailLog.status,
          detail: emailLog.detail,
          createdAt: emailLog.createdAt,
        })
        .from(emailLog)
        .orderBy(desc(emailLog.createdAt))
        .limit(input?.limit ?? 100),
    ),

  /** Aggregated failed-login pressure by source address. */
  loginPressure: adminProcedure.query(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        ipAddress: securityLogs.ipAddress,
        total: count(),
      })
      .from(securityLogs)
      .where(
        and(
          eq(securityLogs.eventType, "login.failure"),
          gte(securityLogs.createdAt, since),
        ),
      )
      .groupBy(securityLogs.ipAddress)
      .orderBy(desc(count()))
      .limit(25);
    return rows.map((row) => ({ ipAddress: row.ipAddress, failures: Number(row.total) }));
  }),

  /* ---------------------------------------------------------------- */
  /* Alerts                                                            */
  /* ---------------------------------------------------------------- */

  alerts: adminProcedure
    .input(z.object({ includeResolved: z.boolean().default(false) }).optional())
    .query(async ({ input }) =>
      db
        .select()
        .from(systemAlerts)
        .where(input?.includeResolved ? undefined : isNull(systemAlerts.resolvedAt))
        .orderBy(desc(systemAlerts.lastSeenAt))
        .limit(200),
    ),

  acknowledgeAlert: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(systemAlerts)
        .set({ acknowledgedByUserId: ctx.session.user.id, acknowledgedAt: new Date() })
        .where(eq(systemAlerts.id, input.id));
      return { ok: true as const };
    }),

  resolveAlert: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db
        .update(systemAlerts)
        .set({ resolvedAt: new Date() })
        .where(eq(systemAlerts.id, input.id));
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Sessions                                                          */
  /* ---------------------------------------------------------------- */

  activeSessions: adminProcedure.query(async () => {
    const rows = await db
      .select({
        id: userSessions.id,
        userId: userSessions.userId,
        ipAddress: userSessions.ipAddress,
        userAgent: userSessions.userAgent,
        status: userSessions.status,
        mfaPending: userSessions.mfaPending,
        lastSeenAt: userSessions.lastSeenAt,
        expiresAt: userSessions.expiresAt,
        createdAt: userSessions.createdAt,
      })
      .from(userSessions)
      .where(and(eq(userSessions.status, "active"), sql`${userSessions.expiresAt} > NOW()`))
      .orderBy(desc(userSessions.lastSeenAt))
      .limit(300);

    const names = new Map<number, string>();
    for (const userId of new Set(rows.map((row) => row.userId))) {
      const user = await getUserById(userId);
      names.set(userId, user ? `${displayNameOf(user)} (${user.role})` : "Deleted user");
    }

    return rows.map((row) => ({ ...row, user: names.get(row.userId) ?? "Unknown" }));
  }),

  revokeUserSession: adminProcedure
    .input(z.object({ sessionId: z.string().length(64) }))
    .mutation(async ({ ctx, input }) => {
      await revokeSession(input.sessionId, "admin_revoked");
      void recordSecurityEvent({
        eventType: "session.revoked",
        severity: "notice",
        message: "Administrator revoked a session",
        userId: ctx.session.user.id,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  revokeAllSessionsForUser: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await revokeAllUserSessions(input.userId, "admin_revoked");
      void recordSecurityEvent({
        eventType: "session.revoked",
        severity: "warning",
        message: "Administrator revoked all sessions for an account",
        userId: input.userId,
        ipAddress: ctx.clientIp,
        metadata: { actorUserId: ctx.session.user.id },
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Settings and flags                                                */
  /* ---------------------------------------------------------------- */

  settings: adminProcedure.query(async () => {
    const rows = await db.select().from(siteSettings).orderBy(siteSettings.settingKey);
    return rows.map((row) => ({
      key: row.settingKey,
      // Secrets report presence only.
      value: row.isSecret ? null : row.settingValue,
      hasValue: row.isSecret ? Boolean(row.settingValue) : undefined,
      valueType: row.valueType,
      category: row.category,
      description: row.description,
            isSecret: row.isSecret,
      updatedAt: row.updatedAt,
    }));
  }),

  /** Get settings filtered by category (for targeted panels like launch countdown). */
  getSettings: adminProcedure
    .input(z.object({ category: z.string().trim().min(1).max(48) }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.category, input.category))
        .orderBy(siteSettings.settingKey);
      return rows.map((row) => ({
        key: row.settingKey,
        value: row.isSecret ? null : (row.settingValue ?? ""),
      }));
    }),

  updateSetting: adminProcedure
    .input(
      z.object({
        key: z.string().trim().min(2).max(96),
        value: z.string().max(20_000).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db
        .select({ isSecret: siteSettings.isSecret, category: siteSettings.category })
        .from(siteSettings)
        .where(eq(siteSettings.settingKey, input.key))
        .limit(1);

      await setSetting(input.key, input.value, {
        category: existing[0]?.category,
        isSecret: existing[0]?.isSecret,
        userId: ctx.session.user.id,
      });

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "settings.update",
        entityType: "site_setting",
        entityId: input.key,
        severity: "notice",
        summary: `Setting "${input.key}" updated`,
        // The value is deliberately omitted for secrets.
        changes: existing[0]?.isSecret ? { redacted: true } : { value: input.value },
        ipAddress: ctx.clientIp,
      });
      // Fire maintenance subscriber notifications when maintenance.enabled changes.
      if (input.key === "maintenance.enabled") {
        if (input.value === "true" || input.value === "1") {
          void notifyMaintenanceStart();
        } else {
          void notifyMaintenanceEnd();
        }
      }
      return { ok: true as const };
    }),

  featureFlags: adminProcedure.query(async () => {
    const rows = await db.select().from(featureFlags).orderBy(featureFlags.flagKey);
    const effective = await getAllFeatureFlags();
    return rows.map((row) => ({
      key: row.flagKey,
      name: row.name,
      description: row.description,
      enabled: effective[row.flagKey] ?? row.enabled,
      scheduledEnableAt: row.scheduledEnableAt,
      scheduledDisableAt: row.scheduledDisableAt,
      updatedAt: row.updatedAt,
    }));
  }),

  setFeatureFlag: adminProcedure
    .input(z.object({ key: z.string().trim().max(64), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setFeatureFlag(input.key, input.enabled, ctx.session.user.id);
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "settings.feature_flag",
        entityType: "feature_flag",
        entityId: input.key,
        severity: "notice",
        summary: `Feature "${input.key}" ${input.enabled ? "enabled" : "disabled"}`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* SAML                                                              */
  /* ---------------------------------------------------------------- */

  samlConfig: adminProcedure.query(async () => {
    const rows = await db.select().from(samlConfigs).limit(1);
    const config = rows[0];
    if (!config) return null;
    return {
      id: config.id,
      name: config.name,
      enabled: config.enabled,
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      // The certificate is long and sensitive; only its fingerprint is surfaced.
      certificatePresent: config.idpCertificate.length > 0,
      signatureAlgorithm: config.signatureAlgorithm,
      attributeMapping: config.attributeMapping,
      defaultRole: config.defaultRole,
      autoProvision: config.autoProvision,
      acsUrl: `${env.appUrl}/api/saml/acs`,
      metadataUrl: `${env.appUrl}/api/saml/metadata`,
    };
  }),

  upsertSamlConfig: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        enabled: z.boolean(),
        entryPoint: z.string().trim().url().max(500),
        issuer: z.string().trim().min(2).max(255),
        idpCertificate: z.string().trim().min(100).max(20_000),
        signatureAlgorithm: z.enum(["sha256", "sha512"]).default("sha256"),
        defaultRole: z.enum(["customer", "staff"]).default("customer"),
        autoProvision: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.select({ id: samlConfigs.id }).from(samlConfigs).limit(1);
      if (existing[0]) {
        await db.update(samlConfigs).set(input).where(eq(samlConfigs.id, existing[0].id));
      } else {
        await db.insert(samlConfigs).values(input);
      }
      void recordSecurityEvent({
        eventType: "settings.changed",
        severity: "warning",
        message: `SAML single sign-on configuration ${input.enabled ? "enabled" : "updated"}`,
        userId: ctx.session.user.id,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* API keys                                                          */
  /* ---------------------------------------------------------------- */

  apiKeys: adminProcedure.query(async () =>
    db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt)),
  ),

  createApiKey: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        scopes: z.array(z.string().trim().max(48)).max(20).default([]),
        expiresInDays: z.number().int().min(1).max(3_650).nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const secret = randomToken(32);
      const prefix = `rp_${secret.slice(0, 8)}`;
      const fullKey = `${prefix}.${secret}`;

      await db.insert(apiKeys).values({
        name: input.name,
        keyPrefix: prefix,
        keyHash: hashToken(fullKey),
        scopes: input.scopes,
        createdByUserId: ctx.session.user.id,
        expiresAt:
          input.expiresInDays === null
            ? null
            : new Date(Date.now() + input.expiresInDays * 86_400_000),
      });

      void recordSecurityEvent({
        eventType: "apikey.created",
        severity: "warning",
        message: `API key "${input.name}" created`,
        userId: ctx.session.user.id,
        ipAddress: ctx.clientIp,
      });

      // The plaintext key is returned exactly once.
      return { ok: true as const, apiKey: fullKey };
    }),

  revokeApiKey: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, input.id));
      void recordSecurityEvent({
        eventType: "apikey.revoked",
        severity: "notice",
        message: "API key revoked",
        userId: ctx.session.user.id,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Health, email and backups                                         */
  /* ---------------------------------------------------------------- */

  health: adminProcedure.query(async () => {
    const databaseOk = await pingDatabase();
    const queue = await countQueuedEmails();
    const [alertRows, sessionRows, userRows] = await Promise.all([
      db
        .select({ total: count() })
        .from(systemAlerts)
        .where(isNull(systemAlerts.resolvedAt)),
      db
        .select({ total: count() })
        .from(userSessions)
        .where(and(eq(userSessions.status, "active"), sql`${userSessions.expiresAt} > NOW()`)),
      db.select({ total: count() }).from(users).where(isNull(users.deletedAt)),
    ]);

    const memory = process.memoryUsage();
    return {
      database: databaseOk,
      smtpConfigured: env.smtp.enabled,
      graphEmailConfigured: env.graph.emailEnabled,
      emailTransport: env.graph.emailEnabled ? "graph" : env.smtp.enabled ? "smtp" : "none",
      // Note: graphEmailConfigured may also be true if set via admin panel (DB settings).
      stripeConfigured: env.stripe.enabled,
      storageDriver: env.storage.driver,
      emailQueue: queue,
      openAlerts: Number(alertRows[0]?.total ?? 0),
      activeSessions: Number(sessionRows[0]?.total ?? 0),
      users: Number(userRows[0]?.total ?? 0),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: {
        rss: Math.round(memory.rss / 1_048_576),
        heapUsed: Math.round(memory.heapUsed / 1_048_576),
      },
      nodeVersion: process.version,
      environment: env.nodeEnv,
    };
  }),

  validateGraphEmail: adminProcedure.mutation(async ({ ctx }) => {
    const { validateGraphConfiguration } = await import("../services/emailGraph.js");
    const result = await validateGraphConfiguration();
    void recordActivity({
      actorUserId: ctx.session.user.id,
      actorRole: "admin",
      action: result.valid ? "email.graph_validated" : "email.graph_validation_failed",
      summary: result.valid ? "Microsoft Graph access token acquired successfully" : `Microsoft Graph validation failed: ${result.error ?? "unknown error"}`,
      ipAddress: ctx.clientIp,
    });
    if (!result.valid) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: result.error ?? "Microsoft Graph validation failed." });
    }
    return { ok: true as const, sender: result.sender, expiresAt: result.expiresAt };
  }),

  sendTestEmail: adminProcedure
    .input(z.object({ to: z.string().trim().toLowerCase().email().max(254) }))
    .mutation(async ({ ctx, input }) => {
      const { isEmailEnabled } = await import("../services/email.js");
      if (!(await isEmailEnabled())) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No email transport configured. Set SMTP_HOST or GRAPH_EMAIL_SENDER.",
        });
      }
      try {
        await sendTestEmail(input.to);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Email delivery failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        });
      }
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "email.test_sent",
        summary: "Administrator sent an outbound email test message",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /** Return current email transport config from DB settings (for admin panel status display). */
  getEmailConfig: adminProcedure.query(async () => {
    const { getSetting } = await import("../services/settings.js");
    const [tenantId, clientId, clientSecret, emailSender, smtpHost] = await Promise.all([
      getSetting("email.graph_tenant_id"),
      getSetting("email.graph_client_id"),
      getSetting("email.graph_client_secret"),
      getSetting("email.graph_email_sender"),
      getSetting("email.smtp_host"),
    ]);
    const graphConfigured = Boolean(tenantId && clientId && clientSecret && emailSender);
    const smtpConfigured = Boolean(smtpHost) || env.smtp.enabled;
    return {
      transport: graphConfigured ? "graph" : smtpConfigured ? "smtp" : "none",
      graphConfigured,
      smtpConfigured,
      graphTenantId: tenantId ?? env.graph.tenantId ?? "",
      graphClientId: clientId ?? env.graph.clientId ?? "",
      graphEmailSender: emailSender ?? env.graph.emailSender ?? "",
    };
  }),

  retryFailedEmails: adminProcedure.mutation(async () => {
    const result = await db
      .update(emailQueue)
      .set({ status: "pending", attempts: 0, runAfter: new Date() })
      .where(eq(emailQueue.status, "failed"));
    return {
      ok: true as const,
      requeued: affectedRows(result),
    };
  }),

  backups: adminProcedure.query(async () =>
    db.select().from(backupLog).orderBy(desc(backupLog.startedAt)).limit(50),
  ),

  /** Purge log rows older than the retention window. */
  pruneLogs: adminProcedure
    .input(z.object({ retentionDays: z.number().int().min(7).max(3_650).default(365) }))
    .mutation(async ({ ctx, input }) => {
      const cutoff = new Date(Date.now() - input.retentionDays * 86_400_000);
      const securityResult = await db
        .delete(securityLogs)
        .where(sql`${securityLogs.createdAt} < ${cutoff}`);
      const activityResult = await db
        .delete(activityLogs)
        .where(sql`${activityLogs.createdAt} < ${cutoff}`);
      const emailResult = await db
        .delete(emailLog)
        .where(sql`${emailLog.createdAt} < ${cutoff}`);



      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "logs.prune",
        severity: "notice",
        summary: `Pruned log rows older than ${input.retentionDays} days`,
        ipAddress: ctx.clientIp,
      });

      return {
        ok: true as const,
        securityLogs: affectedRows(securityResult),
        activityLogs: affectedRows(activityResult),
        emailLog: affectedRows(emailResult),
      };
    }),
});
