import { isIP } from "node:net";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { ipAllowlist, samlConfigs, users, webhookEndpoints } from "../db/schema.js";
import { encryptField, isPublicUserId } from "../security/crypto.js";
import { detectPatternType } from "../security/ipAddress.js";
import { recordActivity } from "../observability/audit.js";
import { getSetting, getSettingBool, getSettingJson, setSetting } from "../services/settings.js";
import { adminProcedure, router } from "../trpc/trpc.js";

const emailSchema = z.object({
  transport: z.enum(["none", "smtp", "graph"]),
  smtp: z.object({ host: z.string().trim().max(255), port: z.number().int().min(1).max(65535), user: z.string().trim().max(255), password: z.string().max(512).optional(), from: z.string().trim().email().max(320), replyTo: z.string().trim().email().max(320).optional().or(z.literal("")), secure: z.boolean() }),
  graph: z.object({ tenantId: z.string().trim().max(128), clientId: z.string().trim().max(128), clientSecret: z.string().max(512).optional(), sender: z.string().trim().email().max(320) }),
});

const entraSchema = z.object({ enabled: z.boolean(), name: z.string().trim().min(2).max(120), entryPoint: z.string().trim().url().max(500), issuer: z.string().trim().min(2).max(255), certificate: z.string().trim().max(12000).optional(), autoProvision: z.boolean(), defaultRole: z.enum(["customer", "staff", "admin"]) });
const webhookSchema = z.object({ url: z.string().trim().url().max(500).refine((value) => new URL(value).protocol === "https:", "Webhook URLs must use HTTPS."), secret: z.string().max(256).optional(), enabled: z.boolean() });

function validIpPattern(value: string): boolean {
  const pattern = value.trim();
  if (isIP(pattern) !== 0) return true;
  if (pattern.includes("/")) {
    const [address, prefix] = pattern.split("/");
    return isIP(address ?? "") === 4 && /^\d{1,2}$/.test(prefix ?? "") && Number(prefix) >= 0 && Number(prefix) <= 32;
  }
  if (pattern.includes("-")) {
    const [start, end] = pattern.split("-").map((part) => part.trim());
    return isIP(start ?? "") === 4 && isIP(end ?? "") === 4;
  }
  return false;
}

async function savePhaseEndpoint(eventType: "P101" | "P201", input: z.infer<typeof webhookSchema>, userId: number) {
  const existing = (await db.select().from(webhookEndpoints).orderBy(desc(webhookEndpoints.createdAt))).find((endpoint) => Array.isArray(endpoint.events) && endpoint.events.includes(eventType));
  const name = eventType === "P101" ? "Phase I Start — P101" : "Phase II Start — P201";
  if (existing) {
    const patch: Record<string, unknown> = { name, url: input.url, events: [eventType], enabled: input.enabled };
    if (input.secret) patch.secretEnc = encryptField(input.secret, `webhook:${existing.id}`);
    await db.update(webhookEndpoints).set(patch).where(eq(webhookEndpoints.id, existing.id));
    return existing.id;
  }
  const result = await db.insert(webhookEndpoints).values({ name, url: input.url, events: [eventType], enabled: input.enabled, createdByUserId: userId, secretEnc: null });
  const id = Number((result as { insertId?: number }).insertId ?? 0);
  if (input.secret) await db.update(webhookEndpoints).set({ secretEnc: encryptField(input.secret, `webhook:${id}`) }).where(eq(webhookEndpoints.id, id));
  return id;
}

export const platformSetupRouter = router({
  status: adminProcedure.query(async () => {
    const [emailTransport, stripeSecret, stripeWebhook, setupCompletedAt, loginWhitelistEnabled, loginWhitelist, saml, endpoints] = await Promise.all([
      getSetting("email.transport"), getSetting("stripe.secret_key"), getSetting("stripe.webhook_secret"), getSetting("platform.setup_completed_at"), getSettingBool("access.login_whitelist_enabled", false), getSettingJson<string[]>("access.login_whitelist_public_ids", []), db.select({ enabled: samlConfigs.enabled, name: samlConfigs.name }).from(samlConfigs).orderBy(desc(samlConfigs.updatedAt)).limit(1), db.select({ events: webhookEndpoints.events, enabled: webhookEndpoints.enabled }).from(webhookEndpoints),
    ]);
    const eventTypes = new Set(endpoints.filter((endpoint) => endpoint.enabled && Array.isArray(endpoint.events)).flatMap((endpoint) => endpoint.events as string[]));
    return { completedAt: setupCompletedAt, emailTransport: emailTransport ?? "none", stripeReady: Boolean(stripeSecret && stripeWebhook), entraEnabled: Boolean(saml[0]?.enabled), p101Configured: eventTypes.has("P101"), p201Configured: eventTypes.has("P201"), loginWhitelistEnabled, loginWhitelist };
  }),

  saveEmail: adminProcedure.input(emailSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    await setSetting("email.transport", input.transport, { category: "email", userId });
    if (input.transport === "smtp") {
      await Promise.all([
        setSetting("email.smtp_host", input.smtp.host, { category: "email", userId }), setSetting("email.smtp_port", String(input.smtp.port), { category: "email", userId }), setSetting("email.smtp_user", input.smtp.user, { category: "email", userId }), setSetting("email.smtp_from", input.smtp.from, { category: "email", userId }), setSetting("email.smtp_reply_to", input.smtp.replyTo || null, { category: "email", userId }), setSetting("email.smtp_secure", String(input.smtp.secure), { category: "email", userId }),
      ]);
      if (input.smtp.password !== undefined) await setSetting("email.smtp_pass", input.smtp.password || null, { category: "email", isSecret: true, userId });
    }
    if (input.transport === "graph") {
      await Promise.all([
        setSetting("email.graph_tenant_id", input.graph.tenantId, { category: "email", userId }), setSetting("email.graph_client_id", input.graph.clientId, { category: "email", userId }), setSetting("email.graph_email_sender", input.graph.sender, { category: "email", userId }),
      ]);
      if (input.graph.clientSecret !== undefined) await setSetting("email.graph_client_secret", input.graph.clientSecret || null, { category: "email", isSecret: true, userId });
    }
    void recordActivity({ actorUserId: userId, actorRole: "admin", action: "platform_setup.email_saved", entityType: "site_setting", entityId: 0, summary: `Platform setup saved ${input.transport} email configuration`, ipAddress: ctx.clientIp });
    return { ok: true as const };
  }),

  saveStripe: adminProcedure.input(z.object({ secretKey: z.string().trim().optional(), publishableKey: z.string().trim().optional(), webhookSecret: z.string().trim().optional() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    if (input.secretKey !== undefined) await setSetting("stripe.secret_key", input.secretKey || null, { category: "payments", isSecret: true, userId });
    if (input.publishableKey !== undefined) await setSetting("stripe.publishable_key", input.publishableKey || null, { category: "payments", userId });
    if (input.webhookSecret !== undefined) await setSetting("stripe.webhook_secret", input.webhookSecret || null, { category: "payments", isSecret: true, userId });
    void recordActivity({ actorUserId: userId, actorRole: "admin", action: "platform_setup.stripe_saved", entityType: "site_setting", entityId: 0, summary: "Platform setup saved Stripe configuration", ipAddress: ctx.clientIp });
    return { ok: true as const };
  }),

  saveEntra: adminProcedure.input(entraSchema).mutation(async ({ ctx, input }) => {
    const existing = (await db.select().from(samlConfigs).orderBy(desc(samlConfigs.updatedAt)).limit(1))[0];
    if (!input.certificate && !existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Paste the Entra Base64 certificate before saving the first configuration." });
    const data = { name: input.name, enabled: input.enabled, entryPoint: input.entryPoint, issuer: input.issuer, idpCertificate: input.certificate || existing!.idpCertificate, signatureAlgorithm: "sha256", autoProvision: input.autoProvision, defaultRole: input.defaultRole };
    if (existing) await db.update(samlConfigs).set(data).where(eq(samlConfigs.id, existing.id));
    else await db.insert(samlConfigs).values(data);
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "platform_setup.entra_saved", entityType: "saml_config", entityId: existing?.id ?? 0, summary: `Platform setup saved Microsoft Entra ID configuration (${input.enabled ? "enabled" : "disabled"})`, ipAddress: ctx.clientIp });
    return { ok: true as const };
  }),

  savePhaseWebhooks: adminProcedure.input(z.object({ p101: webhookSchema.optional(), p201: webhookSchema.optional() })).mutation(async ({ ctx, input }) => {
    if (!input.p101 && !input.p201) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure at least one phase-start webhook." });
    const ids = await Promise.all([input.p101 ? savePhaseEndpoint("P101", input.p101, ctx.session.user.id) : null, input.p201 ? savePhaseEndpoint("P201", input.p201, ctx.session.user.id) : null]);
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "platform_setup.phase_webhooks_saved", entityType: "webhook_endpoint", entityId: ids.find((id) => id !== null) ?? 0, summary: "Platform setup saved phase-start webhook configuration", ipAddress: ctx.clientIp });
    return { ok: true as const, ids };
  }),

  saveAccess: adminProcedure.input(z.object({ ipPatterns: z.array(z.string().trim().min(3).max(64)).max(25), loginWhitelistEnabled: z.boolean(), loginWhitelistPublicIds: z.array(z.string().trim().refine(isPublicUserId, "Enter IDs in the form RPYY-XXXXXXXX.")).max(200) })).mutation(async ({ ctx, input }) => {
    for (const pattern of input.ipPatterns) if (!validIpPattern(pattern)) throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid IP allowlist entry: ${pattern}` });
    const ids = [...new Set(input.loginWhitelistPublicIds.map((value) => value.toUpperCase()))];
    if (input.loginWhitelistEnabled && ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one public customer ID before enabling the login whitelist." });
    const matched = ids.length ? await db.select({ publicId: users.publicId }).from(users).where(inArray(users.publicId, ids)) : [];
    if (matched.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more public customer IDs do not match an existing account." });
    for (const pattern of input.ipPatterns) {
      await db.insert(ipAllowlist).values({ pattern, patternType: detectPatternType(pattern), scope: "all", note: "Added by platform setup wizard", createdByUserId: ctx.session.user.id }).onDuplicateKeyUpdate({ set: { scope: "all", note: "Added by platform setup wizard" } });
    }
    await Promise.all([setSetting("access.login_whitelist_enabled", String(input.loginWhitelistEnabled), { category: "security", userId: ctx.session.user.id }), setSetting("access.login_whitelist_public_ids", JSON.stringify(ids), { category: "security", valueType: "json", userId: ctx.session.user.id })]);
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "platform_setup.access_saved", entityType: "site_setting", entityId: 0, summary: `Platform setup saved ${input.ipPatterns.length} IP allowlist entry(ies) and ${ids.length} login-whitelisted account(s)`, ipAddress: ctx.clientIp });
    return { ok: true as const };
  }),

  complete: adminProcedure.mutation(async ({ ctx }) => {
    const now = new Date().toISOString();
    await setSetting("platform.setup_completed_at", now, { category: "platform", userId: ctx.session.user.id });
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "platform_setup.completed", entityType: "site_setting", entityId: 0, summary: "Administrator marked the first-run platform setup wizard complete", ipAddress: ctx.clientIp });
    return { completedAt: now };
  }),
});
