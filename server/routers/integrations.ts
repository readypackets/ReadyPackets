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
import { browseSharePointFolders, discoverSharePointConfig, runPhaseKickoff, resetGraphTokenCache, testSharePointConnection } from "../services/sharepoint.js";
import { getSetting, setSetting } from "../services/settings.js";
import { recordActivity } from "../observability/audit.js";
import { orders } from "../db/schema.js";

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

  /** Purpose-built configuration for the P101 and P201 phase-start webhooks. */
  phaseStartWebhookConfigs: staffProcedure.query(async () => {
    const endpoints = await db.select({
      id: webhookEndpoints.id,
      name: webhookEndpoints.name,
      url: webhookEndpoints.url,
      events: webhookEndpoints.events,
      enabled: webhookEndpoints.enabled,
      createdAt: webhookEndpoints.createdAt,
    }).from(webhookEndpoints).orderBy(desc(webhookEndpoints.createdAt));
    return (["P101", "P201"] as const).map((eventType) => {
      const endpoint = endpoints.find((candidate) => Array.isArray(candidate.events) && candidate.events.includes(eventType));
      return { eventType, endpoint: endpoint ?? null };
    });
  }),

  savePhaseStartWebhookConfig: adminProcedure
    .input(z.object({
      eventType: z.enum(["P101", "P201"]),
      url: z.string().trim().url().max(500).refine((value) => new URL(value).protocol === "https:", "Webhook URLs must use HTTPS."),
      secret: z.string().max(256).optional(),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = (await db.select().from(webhookEndpoints).orderBy(desc(webhookEndpoints.createdAt)))
        .find((candidate) => Array.isArray(candidate.events) && candidate.events.includes(input.eventType));
      const name = input.eventType === "P101" ? "Phase I Start — P101" : "Phase II Start — P201";
      if (existing) {
        const patch: Record<string, unknown> = { name, url: input.url, events: [input.eventType], enabled: input.enabled };
        if (input.secret) patch.secretEnc = encryptField(input.secret, `webhook:${existing.id}`);
        await db.update(webhookEndpoints).set(patch).where(eq(webhookEndpoints.id, existing.id));
        await recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "webhook.phase_endpoint_saved", entityType: "webhook_endpoint", entityId: existing.id, summary: `${input.eventType} webhook endpoint updated` });
        return { id: existing.id };
      }
      const insert = await db.insert(webhookEndpoints).values({ name, url: input.url, events: [input.eventType], enabled: input.enabled, secretEnc: null });
      const id = (insert[0] as { insertId: number }).insertId;
      if (input.secret) await db.update(webhookEndpoints).set({ secretEnc: encryptField(input.secret, `webhook:${id}`) }).where(eq(webhookEndpoints.id, id));
      await recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "webhook.phase_endpoint_saved", entityType: "webhook_endpoint", entityId: id, summary: `${input.eventType} webhook endpoint configured` });
      return { id };
    }),

  webhookDeliveries: staffProcedure
    .input(
      z.object({
        endpointId: z.number().int().positive().optional(),
        orderId: z.number().int().positive().optional(),
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
      })
    )
    .query(async ({ input }) => {
      const offset = (input.page - 1) * 50;
      const conditions = [];
      if (input.endpointId) conditions.push(eq(webhookDeliveries.endpointId, input.endpointId));
      if (input.orderId) conditions.push(eq(webhookDeliveries.orderId, input.orderId));
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
    .mutation(async ({ ctx, input }) => {
      const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, input.deliveryId)).limit(1);
      const delivery = rows[0];
      if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook delivery not found." });
      if (!(["pending", "failed", "stopped"] as const).includes(delivery.status as "pending" | "failed" | "stopped")) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only pending, failed, or stopped deliveries can be retried." });
      }
      await db.update(webhookDeliveries).set({
        status: "pending",
        runAfter: new Date(),
        attempts: delivery.status === "failed" ? 0 : delivery.attempts,
        lastError: null,
        responseCode: null,
        responseDetail: null,
      }).where(eq(webhookDeliveries.id, delivery.id));
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "webhook.retry_requested", entityType: "webhook_delivery", entityId: delivery.id, summary: `Webhook delivery ${delivery.id} queued for retry`, ipAddress: ctx.clientIp });
      return { ok: true as const };
    }),

  /** Stop a queued webhook before the scheduler makes its next delivery attempt. */
  stopWebhookDelivery: adminProcedure
    .input(z.object({ deliveryId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, input.deliveryId)).limit(1);
      const delivery = rows[0];
      if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook delivery not found." });
      if (delivery.status !== "pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only pending deliveries can be stopped." });
      await db.update(webhookDeliveries).set({ status: "stopped", lastError: "Stopped by administrator" }).where(eq(webhookDeliveries.id, delivery.id));
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "webhook.stopped", entityType: "webhook_delivery", entityId: delivery.id, severity: "warning", summary: `Stopped pending webhook delivery ${delivery.id}`, ipAddress: ctx.clientIp });
      return { ok: true as const };
    }),

  /** Create a fresh delivery row while retaining the original delivery history. */
  redeliverWebhook: adminProcedure
    .input(z.object({ deliveryId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, input.deliveryId)).limit(1);
      const delivery = rows[0];
      if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook delivery not found." });
      if (delivery.status === "pending") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This delivery is already pending. Retry it or stop it before creating a separate redelivery." });
      }
      const insert = await db.insert(webhookDeliveries).values({
        endpointId: delivery.endpointId,
        orderId: delivery.orderId,
        orderNumber: delivery.orderNumber,
        customerName: delivery.customerName,
        eventType: delivery.eventType,
        payload: delivery.payload,
        status: "pending",
        attempts: 0,
        runAfter: new Date(),
      });
      const id = (insert[0] as { insertId: number }).insertId;
      await recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "webhook.redelivered", entityType: "webhook_delivery", entityId: id, summary: `Redelivery created from webhook delivery ${delivery.id}` });
      return { id };
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

  manualPhaseKickoff: staffProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        phase: z.enum(["phase_1_intake", "phase_2_synthesis", "in_production", "delivered"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orderRows = await db
        .select({ id: orders.id, orderNumber: orders.orderNumber })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);
      if (!orderRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });

      const forceWebhook = input.phase === "phase_1_intake" || input.phase === "phase_2_synthesis";
      await runPhaseKickoff(input.orderId, input.phase as any, { forceWebhook });
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "order.phase_kickoff_manual",
        summary: `Manually kicked off ${input.phase} for order ${orderRows[0].orderNumber}${forceWebhook ? " and queued its phase-start webhook" : ""}`,
      });
      return { ok: true, webhookQueued: forceWebhook };
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

  graphConfig: adminProcedure.query(async () => {
    const tenantId = (await getSetting("sharepoint.tenant_id")) || env.graph.tenantId || null;
    const clientId = (await getSetting("sharepoint.client_id")) || env.graph.clientId || null;
    const siteId = (await getSetting("sharepoint.site_id")) || env.graph.siteId || null;
    const driveId = (await getSetting("sharepoint.drive_id")) || env.graph.driveId || null;
    const siteUrl = await getSetting("sharepoint.site_url");
    const rootFolderPath = (await getSetting("sharepoint.root_folder_path")) || env.graph.rootFolderPath;
    const hasSecret = Boolean((await getSetting("sharepoint.client_secret_enc")) || env.graph.clientSecret);
    return {
      enabled: Boolean(tenantId && clientId && hasSecret && siteId && driveId),
      tenantId: tenantId ? `...${tenantId.slice(-8)}` : null,
      clientId: clientId ? `...${clientId.slice(-8)}` : null,
      siteId,
      driveId,
      siteUrl,
      rootFolderPath,
      hasSecret,
    };
  }),

  discoverGraphConfig: adminProcedure
    .input(z.object({
      tenantId: z.string().trim().min(1).max(128),
      clientId: z.string().trim().min(1).max(128),
      clientSecret: z.string().max(512).optional(),
      siteUrl: z.string().trim().url().max(1024),
    }))
    .mutation(async ({ ctx, input }) => {
      const storedSecret = await getSetting("sharepoint.client_secret_enc");
      const clientSecret = input.clientSecret || (storedSecret ? decryptField(storedSecret, "sharepoint.client_secret") : null);
      if (!clientSecret) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Enter a client secret before discovery, or save one securely first." });
      try {
        const result = await discoverSharePointConfig({ tenantId: input.tenantId, clientId: input.clientId, clientSecret, siteUrl: input.siteUrl });
        void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "sharepoint.discovery_succeeded", entityType: "sharepoint", entityId: 0, summary: `Discovered SharePoint site ${result.siteName} and ${result.drives.length} document library/libraries`, ipAddress: ctx.clientIp });
        return result;
      } catch (error) {
        void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "sharepoint.discovery_failed", entityType: "sharepoint", entityId: 0, severity: "warning", summary: "SharePoint discovery failed", ipAddress: ctx.clientIp });
        const message = error instanceof Error ? error.message.slice(0, 500) : "SharePoint discovery failed.";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message });
      }
    }),

  browseGraphFolders: adminProcedure
    .input(z.object({ path: z.string().trim().max(240).optional() }))
    .query(async ({ ctx, input }) => {
      try {
        const result = await browseSharePointFolders(input.path ?? "");
        void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "sharepoint.root_folder_browsed", entityType: "sharepoint", entityId: 0, summary: `Browsed SharePoint folder ${result.currentPath || "/"}`, ipAddress: ctx.clientIp });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "Could not browse SharePoint folders.";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message });
      }
    }),

  testGraphConnection: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const result = await testSharePointConnection();
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "sharepoint.connection_test_succeeded", entityType: "sharepoint", entityId: 0, summary: `SharePoint connection test succeeded for ${result.siteName} / ${result.driveName}`, ipAddress: ctx.clientIp });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "SharePoint connection test failed.";
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "sharepoint.connection_test_failed", entityType: "sharepoint", entityId: 0, severity: "warning", summary: "SharePoint connection test failed", ipAddress: ctx.clientIp });
      throw new TRPCError({ code: "PRECONDITION_FAILED", message });
    }
  }),

  saveGraphConfig: adminProcedure
    .input(z.object({
      tenantId: z.string().trim().min(1).max(128),
      clientId: z.string().trim().min(1).max(128),
      clientSecret: z.string().max(512).optional(),
      siteId: z.string().trim().min(1).max(512),
      driveId: z.string().trim().min(1).max(512),
      siteUrl: z.string().trim().url().max(1024).optional().or(z.literal("")),
      rootFolderPath: z.string().trim().min(1).max(512),
    }))
    .mutation(async ({ ctx, input }) => {
      await setSetting("sharepoint.tenant_id", input.tenantId, { category: "sharepoint", userId: ctx.session.user.id });
      await setSetting("sharepoint.client_id", input.clientId, { category: "sharepoint", userId: ctx.session.user.id });
      await setSetting("sharepoint.site_id", input.siteId, { category: "sharepoint", userId: ctx.session.user.id });
      await setSetting("sharepoint.drive_id", input.driveId, { category: "sharepoint", userId: ctx.session.user.id });
      await setSetting("sharepoint.site_url", input.siteUrl || null, { category: "sharepoint", userId: ctx.session.user.id });
      await setSetting("sharepoint.root_folder_path", input.rootFolderPath, { category: "sharepoint", userId: ctx.session.user.id });
      if (input.clientSecret) {
        await setSetting(
          "sharepoint.client_secret_enc",
          encryptField(input.clientSecret, "sharepoint.client_secret"),
          { category: "sharepoint", isSecret: true, userId: ctx.session.user.id },
        );
      }
      resetGraphTokenCache();
      return { ok: true };
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
