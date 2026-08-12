import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { marketingCampaigns } from "../db/schema.js";
import { insertedId } from "../db/result.js";
import { recordActivity } from "../observability/audit.js";
import { adminProcedure, router } from "../trpc/trpc.js";

const campaignStatuses = ["draft", "active", "paused", "completed", "archived"] as const;
const campaignObjectives = ["awareness", "lead_generation", "conversion", "retention"] as const;
const campaignChannels = ["website", "email", "social", "referral", "partner", "other"] as const;

function isSafeDestination(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const campaignInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(3).max(180),
  objective: z.enum(campaignObjectives),
  channel: z.enum(campaignChannels),
  status: z.enum(campaignStatuses),
  audience: z.string().trim().max(255).optional(),
  headline: z.string().trim().max(255).optional(),
  message: z.string().trim().max(10_000).optional(),
  ctaLabel: z.string().trim().max(96).optional(),
  destinationUrl: z.string().trim().max(1024).refine(isSafeDestination, "Use a site-relative path or an HTTPS URL."),
  utmSource: z.string().trim().max(96).optional(),
  utmMedium: z.string().trim().max(96).optional(),
  utmCampaign: z.string().trim().max(128).optional(),
  utmContent: z.string().trim().max(128).optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
}).superRefine((input, ctx) => {
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Campaign end time must be later than the start time." });
  }
});

export const marketingRouter = router({
  list: adminProcedure.query(async () =>
    db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.updatedAt), desc(marketingCampaigns.id)),
  ),

  stats: adminProcedure.query(async () => {
    const rows = await db.select().from(marketingCampaigns);
    return {
      total: rows.length,
      active: rows.filter((row) => row.status === "active").length,
      clicks: rows.reduce((sum, row) => sum + row.clickCount, 0),
      conversions: rows.reduce((sum, row) => sum + row.conversionCount, 0),
    };
  }),

  upsert: adminProcedure.input(campaignInput).mutation(async ({ ctx, input }) => {
    const values = {
      name: input.name,
      objective: input.objective,
      channel: input.channel,
      status: input.status,
      audience: input.audience || null,
      headline: input.headline || null,
      message: input.message || null,
      ctaLabel: input.ctaLabel || null,
      destinationUrl: input.destinationUrl,
      utmSource: input.utmSource || null,
      utmMedium: input.utmMedium || null,
      utmCampaign: input.utmCampaign || null,
      utmContent: input.utmContent || null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      updatedByUserId: ctx.session.user.id,
    };
    if (input.id) {
      await db.update(marketingCampaigns).set(values).where(eq(marketingCampaigns.id, input.id));
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "marketing.campaign_updated", entityType: "marketing_campaign", entityId: input.id, summary: `Updated marketing campaign ${input.name}`, changes: { status: input.status, channel: input.channel }, ipAddress: ctx.clientIp });
      return { id: input.id };
    }
    const publicKey = randomBytes(12).toString("base64url");
    const result = await db.insert(marketingCampaigns).values({ ...values, publicKey, createdByUserId: ctx.session.user.id });
    const id = insertedId(result);
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "marketing.campaign_created", entityType: "marketing_campaign", entityId: id, summary: `Created marketing campaign ${input.name}`, changes: { status: input.status, channel: input.channel }, ipAddress: ctx.clientIp });
    return { id, publicKey };
  }),

  recordConversion: adminProcedure.input(z.object({ id: z.number().int().positive(), count: z.number().int().min(1).max(10_000).default(1) })).mutation(async ({ ctx, input }) => {
    const [campaign] = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, input.id)).limit(1);
    if (!campaign) throw new Error("Campaign not found.");
    await db.update(marketingCampaigns).set({ conversionCount: campaign.conversionCount + input.count, updatedByUserId: ctx.session.user.id }).where(eq(marketingCampaigns.id, input.id));
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "marketing.conversion_recorded", entityType: "marketing_campaign", entityId: input.id, summary: `Recorded ${input.count} campaign conversion${input.count === 1 ? "" : "s"}`, ipAddress: ctx.clientIp });
    return { ok: true as const };
  }),

  remove: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, input.id));
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "marketing.campaign_deleted", entityType: "marketing_campaign", entityId: input.id, severity: "warning", summary: `Deleted marketing campaign ${input.id}`, ipAddress: ctx.clientIp });
    return { ok: true as const };
  }),
});
