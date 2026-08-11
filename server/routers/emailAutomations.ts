/**
 * Email automations router.
 * Admin CRUD for event-triggered email automation rules.
 */
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { emailAutomations } from "../db/schema.js";
import { recordActivity } from "../observability/audit.js";
import { adminProcedure, router } from "../trpc/trpc.js";
import { AUTOMATION_EVENTS } from "../services/emailAutomations.js";

export const emailAutomationsRouter = router({
  list: adminProcedure.query(async () =>
    db.select().from(emailAutomations).orderBy(desc(emailAutomations.createdAt)),
  ),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(190),
        description: z.string().trim().max(500).optional(),
        triggerEvent: z.enum(AUTOMATION_EVENTS as [string, ...string[]]),
        templateKey: z.string().trim().min(1).max(64),
        delayMinutes: z.number().int().min(0).max(10_080).default(0),
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(emailAutomations).values({
        name: input.name,
        description: input.description ?? null,
        triggerEvent: input.triggerEvent,
        templateKey: input.templateKey,
        delayMinutes: input.delayMinutes,
        enabled: input.enabled,
      });
      const id = (result as unknown as [{ insertId: number }])[0]?.insertId ?? 0;
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "email_automation.create",
        entityType: "email_automation",
        entityId: id,
        summary: `Created email automation: ${input.name}`,
        ipAddress: ctx.clientIp,
      });
      return { id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(190).optional(),
        description: z.string().trim().max(500).optional(),
        triggerEvent: z.enum(AUTOMATION_EVENTS as [string, ...string[]]).optional(),
        templateKey: z.string().trim().min(1).max(64).optional(),
        delayMinutes: z.number().int().min(0).max(10_080).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      if (fields.name !== undefined) updateData.name = fields.name;
      if (fields.description !== undefined) updateData.description = fields.description;
      if (fields.triggerEvent !== undefined) updateData.triggerEvent = fields.triggerEvent;
      if (fields.templateKey !== undefined) updateData.templateKey = fields.templateKey;
      if (fields.delayMinutes !== undefined) updateData.delayMinutes = fields.delayMinutes;
      if (fields.enabled !== undefined) updateData.enabled = fields.enabled;

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update." });
      }

      await db
        .update(emailAutomations)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set(updateData as any)
        .where(eq(emailAutomations.id, id));

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "email_automation.update",
        entityType: "email_automation",
        entityId: id,
        summary: `Updated email automation #${id}`,
        changes: updateData,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(emailAutomations).where(eq(emailAutomations.id, input.id));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "email_automation.delete",
        entityType: "email_automation",
        entityId: input.id,
        summary: `Deleted email automation #${input.id}`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),
});
