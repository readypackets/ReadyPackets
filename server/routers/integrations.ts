/**
 * Integrations router — webhooks, SharePoint, email automations, and phase kickoff config.
 *
 * All procedures require at least staff access; destructive operations require admin.
 */
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  phaseJobs,
  phaseKickoffConfigs,
  webhookDeliveries,
  webhookEndpoints,
} from "../db/schema.js";
import { adminProcedure, staffProcedure, router } from "../trpc/trpc.js";
import { TRPCError } from "@trpc/server";
import { encryptField, decryptField } from "../security/crypto.js";
import { env } from "../config/env.js";

export const integrationsRouter = router({
  // =========================================================================
  // Webhook endpoints
  // =========================================================================

  webhookEndpoints: staffProcedure.query(async () => {
    return db
      .select({
        id: webhookEndpoints.id,
        name: webhookEndpoints.name,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        enabled: webhookEndpoints.enabled,
        createdAt: webhookEndpoints.createdAt,
      })
      .from(webhookEndpoints)
      .orderBy(desc(webhookEndpoints.createdAt));
  }),

  upsertWebhookEndpoint: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().min(1).max(120),
        url: z.string().url().max(500),
        events: z.array(z.string()).default(["*"]),
        secret: z.string().max(256).optional(),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const secretEnc = input.secret
        ? encryptField(input.secret, `webhook:${input.id ?? "new"}`)
        : null;

      if (input.id) {
        const updateData: Record<string, unknown> = {
          name: input.name,
          url: input.url,
          events: input.events,
          enabled: input.enabled,
        };
        if (input.secret !== undefined) {
          updateData.secretEnc = secretEnc;
        }
        await db
          .update(webhookEndpoints)
          .set(updateData)
          .where(eq(webhookEndpoints.id, input.id));

        // Re-encrypt the secret with the correct row id as AAD if it was just set.
        if (input.secret) {
          await db
            .update(webhookEndpoints)
            .set({ secretEnc: encryptField(input.secret, `webhook:${input.id}`) })
            .where(eq(webhookEndpoints.id, input.id));
        }

        return { id: input.id };
      } else {
        const result = await db.insert(webhookEndpoints).values({
          name: input.name,
          url: input.url,
          events: input.events,
          secretEnc: null, // set after insert with correct AAD
          enabled: input.enabled,
        });
        const newId = (result[0] as any).insertId as number;

        if (input.secret) {
          await db
            .update(webhookEndpoints)
            .set({ secretEnc: encryptField(input.secret, `webhook:${newId}`) })
            .where(eq(webhookEndpoints.id, newId));
        }

        return { id: newId };
      }
    }),

  deleteWebhookEndpoint: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db
        .delete(webhookEndpoints)
        .where(eq(webhookEndpoints.id, input.id));
    }),

  webhookDeliveries: staffProcedure
    .input(
      z.object({
        endpointId: z.number().int().positive().optional(),
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
      })
    )
    .query(async ({ input }) => {
      const offset = (input.page - 1) * 50;
      const conditions = [];
      if (input.endpointId) conditions.push(eq(webhookDeliveries.endpointId, input.endpointId));
      if (input.status) conditions.push(eq(webhookDeliveries.status, input.status));

      const rows = await db
        .select()
        .from(webhookDeliveries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(50)
        .offset(offset);

      const countResult = await db
        .select({ total: sql<number>`count(*)` })
        .from(webhookDeliveries)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return { rows, total: Number(countResult[0]?.total ?? 0) };
    }),

  retryWebhookDelivery: adminProcedure
    .input(z.object({ deliveryId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db
        .update(webhookDeliveries)
        .set({ status: "pending", runAfter: new Date(), lastError: null })
        .where(eq(webhookDeliveries.id, input.deliveryId));
    }),

  // =========================================================================
  // Phase kickoff configuration
  // =========================================================================

  phaseKickoffConfigs: staffProcedure.query(async () => {
    return db
      .select()
      .from(phaseKickoffConfigs)
      .orderBy(phaseKickoffConfigs.phase);
  }),

  upsertPhaseKickoffConfig: adminProcedure
    .input(
      z.object({
        phase: z.string().min(1).max(32),
        createFolders: z.boolean(),
        folderTemplate: z.array(z.string()).optional().nullable(),
        attachPlaceholders: z.boolean(),
        notifyCustomer: z.boolean(),
        notifyWebhooks: z.boolean(),
        emailTemplateKey: z.string().max(64).optional().nullable(),
        completionPercent: z.number().int().min(0).max(100).default(0),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const data = {
        createFolders: input.createFolders,
        folderTemplate: input.folderTemplate ?? null,
        attachPlaceholders: input.attachPlaceholders,
        notifyCustomer: input.notifyCustomer,
        notifyWebhooks: input.notifyWebhooks,
        emailTemplateKey: input.emailTemplateKey ?? null,
        completionPercent: input.completionPercent,
        enabled: input.enabled,
      };

      // Upsert by phase.
      const existing = await db
        .select({ id: phaseKickoffConfigs.id })
        .from(phaseKickoffConfigs)
        .where(eq(phaseKickoffConfigs.phase, input.phase))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(phaseKickoffConfigs)
          .set(data)
          .where(eq(phaseKickoffConfigs.phase, input.phase));
      } else {
        await db.insert(phaseKickoffConfigs).values({ ...data, phase: input.phase });
      }
    }),

  // =========================================================================
  // Phase jobs (monitoring)
  // =========================================================================

  phaseJobs: staffProcedure
    .input(
      z.object({
        orderId: z.number().int().positive().optional(),
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
      })
    )
    .query(async ({ input }) => {
      const offset = (input.page - 1) * 50;
      const conditions = [];
      if (input.orderId) conditions.push(eq(phaseJobs.orderId, input.orderId));
      if (input.status) conditions.push(eq(phaseJobs.status, input.status));

      const rows = await db
        .select()
        .from(phaseJobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(phaseJobs.createdAt))
        .limit(50)
        .offset(offset);

      const countResult = await db
        .select({ total: sql<number>`count(*)` })
        .from(phaseJobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return { rows, total: Number(countResult[0]?.total ?? 0) };
    }),

  retryPhaseJob: adminProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db
        .update(phaseJobs)
        .set({ status: "pending", runAfter: new Date(), lastError: null })
        .where(eq(phaseJobs.id, input.jobId));
    }),

  // =========================================================================
  // SharePoint / Graph configuration status
  // =========================================================================

  graphConfig: adminProcedure.query(() => {
    return {
      enabled: env.graph.enabled,
      tenantId: env.graph.tenantId ? `...${env.graph.tenantId.slice(-8)}` : null,
      clientId: env.graph.clientId ? `...${env.graph.clientId.slice(-8)}` : null,
      siteId: env.graph.siteId ?? null,
      driveId: env.graph.driveId ?? null,
      rootFolderPath: env.graph.rootFolderPath,
    };
  }),

  // =========================================================================
  // Test webhook delivery (sends a test ping to an endpoint)
  // =========================================================================

  testWebhookEndpoint: adminProcedure
    .input(z.object({ endpointId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, input.endpointId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook endpoint not found." });
      }

      const endpoint = rows[0]!;
      const payload = {
        event: "test.ping",
        timestamp: new Date().toISOString(),
        message: "This is a test delivery from ReadyPackets Portal.",
      };

      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-ReadyPackets-Event": "test.ping",
      };

      if (endpoint.secretEnc) {
        const secret = decryptField(endpoint.secretEnc, `webhook:${endpoint.id}`);
        if (secret) {
          const { createHmac } = await import("node:crypto");
          const sig = createHmac("sha256", secret).update(body).digest("hex");
          headers["X-ReadyPackets-Signature"] = `sha256=${sig}`;
        }
      }

      try {
        const response = await fetch(endpoint.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });

        return {
          success: response.ok,
          statusCode: response.status,
          message: response.ok
            ? "Test delivery succeeded."
            : `Endpoint returned HTTP ${response.status}.`,
        };
      } catch (err) {
        return {
          success: false,
          statusCode: null,
          message: err instanceof Error ? err.message : "Request failed.",
        };
      }
    }),
});
