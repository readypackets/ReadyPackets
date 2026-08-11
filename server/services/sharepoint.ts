/**
 * Microsoft Graph / SharePoint integration service.
 *
 * Handles:
 *   - Folder structure creation for each order phase
 *   - Placeholder file attachment (stub documents for each deliverable)
 *   - Webhook notification dispatch on phase transitions
 *   - Phase job queue processing (retry with back-off)
 *
 * All Graph calls are gated behind env.graph.enabled so the application is
 * fully functional without Azure credentials configured. When disabled, phase
 * kickoffs still run but skip the Graph steps.
 *
 * Authentication uses the client-credentials flow (app-only), which is the
 * correct model for a server-side service acting on behalf of the organisation
 * rather than on behalf of an individual user.
 */
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  files,
  orders,
  phaseJobs,
  phaseKickoffConfigs,
  webhookDeliveries,
  webhookEndpoints,
} from "../db/schema.js";
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";
import { recordActivity } from "../observability/audit.js";
import { insertedId } from "../db/result.js";
import { decryptField } from "../security/crypto.js";
import type { OrderStatus } from "../../shared/domain.js";

// ---------------------------------------------------------------------------
// Graph client (lazy-initialised)
// ---------------------------------------------------------------------------

interface GraphTokenCache {
  token: string;
  expiresAt: number;
}

let _tokenCache: GraphTokenCache | null = null;

async function getGraphToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token;
  }

  const { tenantId, clientId, clientSecret } = env.graph;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials are not fully configured.");
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph token request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  _tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return _tokenCache.token;
}

async function graphRequest(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<unknown> {
  const token = await getGraphToken();
  const url = path.startsWith("https://")
    ? path
    : `https://graph.microsoft.com/v1.0${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API ${method} ${path} failed (${response.status}): ${text.slice(0, 400)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// ---------------------------------------------------------------------------
// Folder operations
// ---------------------------------------------------------------------------

/**
 * Ensure a folder exists at the given path under the configured drive root.
 * Creates all intermediate folders if they do not exist.
 * Returns the folder's item ID.
 */
async function ensureFolder(folderPath: string): Promise<string> {
  const { siteId, driveId } = env.graph;
  if (!siteId || !driveId) {
    throw new Error("GRAPH_SHAREPOINT_SITE_ID and GRAPH_SHAREPOINT_DRIVE_ID must be set.");
  }

  const segments = folderPath.split("/").filter(Boolean);
  let parentId = "root";

  for (const segment of segments) {
    // Try to get the folder first.
    try {
      const existing = (await graphRequest(
        "GET",
        `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(segment)}`
      )) as { id: string };
      parentId = existing.id;
    } catch {
      // Folder does not exist — create it.
      const created = (await graphRequest(
        "POST",
        `/drives/${driveId}/items/${parentId}/children`,
        {
          name: segment,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }
      )) as { id: string };
      parentId = created.id;
    }
  }

  return parentId;
}

/**
 * Upload a small placeholder file to a SharePoint folder.
 * Returns the uploaded file's item ID.
 */
async function uploadPlaceholder(
  folderId: string,
  fileName: string,
  content: string
): Promise<string> {
  const { driveId } = env.graph;
  if (!driveId) throw new Error("GRAPH_SHAREPOINT_DRIVE_ID must be set.");

  const token = await getGraphToken();
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body: content,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Placeholder upload failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

// ---------------------------------------------------------------------------
// Phase kickoff automation
// ---------------------------------------------------------------------------

/**
 * Default folder templates for each phase.
 * Operators can override these via the admin panel (phaseKickoffConfigs.folderTemplate).
 */
const DEFAULT_FOLDER_TEMPLATES: Record<string, string[]> = {
  phase_1_intake: ["01-Intake", "02-Documents", "03-Correspondence"],
  phase_2_synthesis: ["01-Research", "02-Analysis", "03-Drafts"],
  in_production: ["01-Production", "02-Review", "03-Final"],
  delivered: ["01-Deliverables", "02-Archive"],
};

const DEFAULT_PLACEHOLDERS: Record<string, string[]> = {
  phase_1_intake: ["INTAKE_CHECKLIST.txt", "DOCUMENTS_REQUIRED.txt"],
  phase_2_synthesis: ["SYNTHESIS_NOTES.txt", "ANALYSIS_TEMPLATE.txt"],
  in_production: ["PRODUCTION_BRIEF.txt"],
  delivered: ["DELIVERY_RECEIPT.txt"],
};

export async function runPhaseKickoff(
  orderId: number,
  phase: OrderStatus
): Promise<void> {
  // Load the kickoff config for this phase.
  const configRows = await db
    .select()
    .from(phaseKickoffConfigs)
    .where(and(eq(phaseKickoffConfigs.phase, phase), eq(phaseKickoffConfigs.enabled, true)))
    .limit(1);

  if (configRows.length === 0) {
    logger.debug("sharepoint.kickoff.no_config", { orderId, phase });
    return;
  }

  const config = configRows[0]!;

  // Auto-set order completion % if configured.
  if (config.completionPercent > 0) {
    await db
      .update(orders)
      .set({ completionPercent: config.completionPercent })
      .where(eq(orders.id, orderId));
    logger.info("sharepoint.kickoff.completion_set", { orderId, phase, completionPercent: config.completionPercent });
  }

  // Queue jobs for each automation step.
  const jobs: { jobType: string }[] = [];
  if (config.createFolders) jobs.push({ jobType: "create_folders" });
  if (config.attachPlaceholders) jobs.push({ jobType: "attach_placeholders" });
  if (config.notifyWebhooks) jobs.push({ jobType: "notify_webhooks" });
  if (config.notifyCustomer) jobs.push({ jobType: "notify_customer" });

  for (const job of jobs) {
    await db.insert(phaseJobs).values({
      orderId,
      phase,
      jobType: job.jobType,
      status: "pending",
      attempts: 0,
    });
  }

  logger.info("sharepoint.kickoff.queued", { orderId, phase, jobCount: jobs.length });
}

// ---------------------------------------------------------------------------
// Job processor (called by the scheduler)
// ---------------------------------------------------------------------------

export async function processPhaseJobs(): Promise<void> {
  const now = new Date();
  const pendingJobs = await db
    .select()
    .from(phaseJobs)
    .where(
      and(
        eq(phaseJobs.status, "pending"),
        lte(phaseJobs.runAfter, now),
        sql`${phaseJobs.attempts} < 5`
      )
    )
    .limit(20);

  for (const job of pendingJobs) {
    await processJob(job);
  }
}

async function processJob(job: {
  id: number;
  orderId: number;
  phase: string;
  jobType: string;
  attempts: number;
}): Promise<void> {
  // Mark as running.
  await db
    .update(phaseJobs)
    .set({ status: "running", attempts: job.attempts + 1 })
    .where(eq(phaseJobs.id, job.id));

  try {
    switch (job.jobType) {
      case "create_folders":
        await jobCreateFolders(job.orderId, job.phase);
        break;
      case "attach_placeholders":
        await jobAttachPlaceholders(job.orderId, job.phase);
        break;
      case "notify_webhooks":
        await jobNotifyWebhooks(job.orderId, job.phase);
        break;
      case "notify_customer":
        // Email notification is handled by the email service; just mark done.
        break;
      default:
        logger.warn("sharepoint.job.unknown_type", { jobType: job.jobType });
    }

    await db
      .update(phaseJobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(phaseJobs.id, job.id));

    logger.info("sharepoint.job.completed", {
      jobId: job.id,
      orderId: job.orderId,
      jobType: job.jobType,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const nextAttempt = job.attempts + 1;
    // Exponential back-off: 1 min, 5 min, 15 min, 1 hr, 4 hr.
    const backoffMinutes = [1, 5, 15, 60, 240][Math.min(nextAttempt - 1, 4)] ?? 240;
    const runAfter = new Date(Date.now() + backoffMinutes * 60_000);

    await db
      .update(phaseJobs)
      .set({
        status: nextAttempt >= 5 ? "failed" : "pending",
        lastError: errorMsg.slice(0, 500),
        runAfter,
      })
      .where(eq(phaseJobs.id, job.id));

    logger.warn("sharepoint.job.failed", {
      jobId: job.id,
      orderId: job.orderId,
      jobType: job.jobType,
      attempt: nextAttempt,
      error: errorMsg,
    });
  }
}

async function jobCreateFolders(orderId: number, phase: string): Promise<void> {
  if (!env.graph.enabled) {
    logger.debug("sharepoint.create_folders.skipped", { reason: "Graph not configured" });
    return;
  }

  const orderRows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (orderRows.length === 0) return;
  const orderNumber = orderRows[0]!.orderNumber;

  // Load the folder template from the config or fall back to defaults.
  const configRows = await db
    .select({ folderTemplate: phaseKickoffConfigs.folderTemplate })
    .from(phaseKickoffConfigs)
    .where(eq(phaseKickoffConfigs.phase, phase))
    .limit(1);

  const folderTemplate =
    (configRows[0]?.folderTemplate as string[] | null) ??
    DEFAULT_FOLDER_TEMPLATES[phase] ??
    [];

  const orderRoot = `${env.graph.rootFolderPath}/${orderNumber}/${phase}`;

  for (const subFolder of folderTemplate) {
    const folderPath = `${orderRoot}/${subFolder}`;
    await ensureFolder(folderPath);
    logger.debug("sharepoint.folder_created", { orderId, folderPath });
  }

  await recordActivity({
    actorUserId: null,
    action: "sharepoint.folders_created",
    entityType: "order",
    entityId: orderId,
    summary: `SharePoint folders created for order ${orderNumber} phase ${phase}`,
  });
}

async function jobAttachPlaceholders(orderId: number, phase: string): Promise<void> {
  if (!env.graph.enabled) {
    logger.debug("sharepoint.attach_placeholders.skipped", { reason: "Graph not configured" });
    return;
  }

  const orderRows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (orderRows.length === 0) return;
  const orderNumber = orderRows[0]!.orderNumber;

  const placeholders = DEFAULT_PLACEHOLDERS[phase] ?? [];
  const folderPath = `${env.graph.rootFolderPath}/${orderNumber}/${phase}/01-${phase === "phase_1_intake" ? "Intake" : phase === "phase_2_synthesis" ? "Research" : "Production"}`;

  let folderId: string;
  try {
    folderId = await ensureFolder(folderPath);
  } catch {
    // Folder may not exist yet if create_folders job hasn't run.
    folderId = await ensureFolder(`${env.graph.rootFolderPath}/${orderNumber}/${phase}`);
  }

  for (const fileName of placeholders) {
    const content = `ReadyPackets Portal — Placeholder\nOrder: ${orderNumber}\nPhase: ${phase}\nFile: ${fileName}\n\nThis file was automatically created as a placeholder.\nReplace with actual content when ready.\n`;
    const itemId = await uploadPlaceholder(folderId, fileName, content);

    // Record in the files table as a hidden placeholder.
    // storageKey encodes the SharePoint item ID so it can be resolved later.
    const { generateStorageKey } = await import("../security/crypto.js");
    const storageKey = generateStorageKey(`sp-${itemId}-${fileName}`);
    await db.insert(files).values({
      orderId,
      uploadedByUserId: 0, // system-created
      originalName: fileName,
      storageKey,
      detectedMime: "text/plain",
      extension: "txt",
      sizeBytes: Buffer.byteLength(content),
      sha256: "", // placeholder — no local file
      category: "deliverable",
      visibleToCustomer: false,
      isPlaceholder: true,
    });
  }

  logger.info("sharepoint.placeholders_attached", {
    orderId,
    phase,
    count: placeholders.length,
  });
}

// ---------------------------------------------------------------------------
// Webhook notifications
// ---------------------------------------------------------------------------

export async function jobNotifyWebhooks(orderId: number, phase: string): Promise<void> {
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (orderRows.length === 0) return;
  const order = orderRows[0]!;

  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.enabled, true));

  const payload = {
    event: "order.phase_changed",
    orderId,
    orderNumber: order.orderNumber,
    phase,
    timestamp: new Date().toISOString(),
  };

  for (const endpoint of endpoints) {
    const events = endpoint.events as string[] | null;
    if (events && !events.includes("order.phase_changed") && !events.includes("*")) {
      continue;
    }

    await db.insert(webhookDeliveries).values({
      endpointId: endpoint.id,
      eventType: "order.phase_changed",
      payload,
      status: "pending",
      attempts: 0,
    });
  }
}

/**
 * Deliver pending webhook notifications (called by the scheduler).
 */
export async function deliverWebhooks(): Promise<void> {
  const now = new Date();
  const pending = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.runAfter, now),
        sql`${webhookDeliveries.attempts} < 5`
      )
    )
    .limit(20);

  for (const delivery of pending) {
    await deliverWebhook(delivery);
  }
}

async function deliverWebhook(delivery: {
  id: number;
  endpointId: number;
  eventType: string;
  payload: unknown;
  attempts: number;
}): Promise<void> {
  const endpointRows = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, delivery.endpointId))
    .limit(1);

  if (endpointRows.length === 0) {
    await db
      .update(webhookDeliveries)
      .set({ status: "failed", lastError: "Endpoint not found" })
      .where(eq(webhookDeliveries.id, delivery.id));
    return;
  }

  const endpoint = endpointRows[0]!;
  const secret = endpoint.secretEnc
    ? decryptField(endpoint.secretEnc, `webhook:${endpoint.id}`)
    : null;

  const body = JSON.stringify(delivery.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-ReadyPackets-Event": delivery.eventType,
    "X-ReadyPackets-Delivery": String(delivery.id),
  };

  if (secret) {
    // HMAC-SHA256 signature for the receiver to verify.
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    headers["X-ReadyPackets-Signature"] = `sha256=${sig}`;
  }

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      await db
        .update(webhookDeliveries)
        .set({
          status: "delivered",
          responseCode: response.status,
          attempts: delivery.attempts + 1,
          deliveredAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const nextAttempt = delivery.attempts + 1;
    const backoffMinutes = [1, 5, 15, 60, 240][Math.min(nextAttempt - 1, 4)] ?? 240;
    const runAfter = new Date(Date.now() + backoffMinutes * 60_000);

    await db
      .update(webhookDeliveries)
      .set({
        status: nextAttempt >= 5 ? "failed" : "pending",
        responseCode: null,
        attempts: nextAttempt,
        lastError: errorMsg.slice(0, 500),
        runAfter,
      })
      .where(eq(webhookDeliveries.id, delivery.id));
  }
}
