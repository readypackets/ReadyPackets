/**
 * Order lifecycle service.
 *
 * The state machine is enforced here rather than in the UI. Two business gates
 * are non-negotiable: an order cannot leave Phase I until both the intake
 * submission and the MNDA acceptance exist, and it cannot be delivered until at
 * least one customer-visible deliverable is attached.
 */
import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  files,
  intakeSubmissions,
  mndaAcceptances,
  orderItems,
  orderAutomationRules,
  orderStatusHistory,
  webhookDeliveries,
  webhookEndpoints,
  orderShares,
  orders,
  phaseJobs,
  phaseKickoffConfigs,
  users,
} from "../db/schema.js";
import { decryptField, encryptField, generateOrderNumber } from "../security/crypto.js";
import { logger } from "../observability/logger.js";
import { recordActivity } from "../observability/audit.js";
import { priceSelection } from "./catalog.js";
import { fireAutomations } from "./emailAutomations.js";
import { queueFullOrderFolderProvisioning } from "./sharepoint.js";
import { queueTemplatedEmail } from "./email.js";
import { displayNameOf, getUserById } from "../db/users.js";
import { ORDER_TRANSITIONS, type OrderStatus } from "../../shared/domain.js";
import { insertedId } from "../db/result.js";

export class OrderStateError extends Error {}

export interface CreateOrderInput {
  userId: number;
  selections: { productId: number; quantity?: number }[];
  projectName?: string | null;
  integrityChoice?: string | null;
  canonVersion?: string | null;
  runMode?: string | null;
  releaseStatus?: string | null;
  orderScopeMode?: string | null;
  bundleScopeManifest?: string | null;
  actorUserId: number;
  actorRole: string;
  ipAddress?: string | null;
}

export async function createOrder(input: CreateOrderInput) {
  if (input.selections.length === 0) {
    throw new OrderStateError("Select at least one packet before placing an order.");
  }

  const quote = await priceSelection(input.selections);
  if (quote.lines.length === 0) {
    throw new OrderStateError("None of the selected packets are currently available.");
  }
  const packetGroups = new Set(quote.lines.map((line) => line.packetGroupId));
  if (packetGroups.size !== quote.lines.length) {
    throw new OrderStateError("Choose only one tier from each packet group.");
  }

  // Look up the customer's unique number to embed in the order ID.
  const customerRow = await db
    .select({ customerNumber: users.customerNumber })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  const customerNumber = customerRow[0]?.customerNumber ?? null;
  const orderNumber = generateOrderNumber(new Date(), customerNumber);
  const inserted = await db.insert(orders).values({
    orderNumber,
    userId: input.userId,
    projectNameEnc: encryptField(input.projectName ?? null, "order:pending"),
    status: "new",
    paymentStatus: quote.requiresCustomQuote ? "awaiting_invoice" : "unpaid",
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    bundleApplied: quote.bundleApplied,
    integrityChoice: input.integrityChoice ?? null,
    canonVersion: input.canonVersion ?? null,
    runMode: input.runMode ?? null,
    releaseStatus: input.releaseStatus ?? null,
    orderScopeMode: input.orderScopeMode ?? null,
    bundleScopeManifest: input.bundleScopeManifest ?? null,
  });

  const orderId = insertedId(inserted);

  // Re-encrypt the project name with the order id bound as AAD.
  if (input.projectName) {
    await db
      .update(orders)
      .set({ projectNameEnc: encryptField(input.projectName, `order:${orderId}`) })
      .where(eq(orders.id, orderId));
  }

  await db.insert(orderItems).values(
    quote.lines.map((line) => ({
      orderId,
      productId: line.productId,
      packetGroupId: line.packetGroupId,
      sku: line.sku,
      name: line.name,
      tier: line.tier,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
    })),
  );

  await db.insert(orderStatusHistory).values({
    orderId,
    fromStatus: null,
    toStatus: "new",
    actorUserId: input.actorUserId,
    reason: "Order created",
  });

  void recordActivity({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: "order.create",
    entityType: "order",
    entityId: orderId,
    summary: `Order ${orderNumber} created with ${quote.lines.length} packet(s)`,
    changes: {
      subtotalCents: quote.subtotalCents,
      discountCents: quote.discountCents,
      totalCents: quote.totalCents,
      bundleApplied: quote.bundleApplied,
    },
    ipAddress: input.ipAddress ?? null,
  });

  // Create the full SharePoint hierarchy asynchronously. This is non-blocking,
  // so an order remains valid even when Graph is not configured yet.
  void queueFullOrderFolderProvisioning(orderId).catch((error) =>
    logger.warn("sharepoint.full_order_provisioning.queue_failed", { orderId, error: String(error) }),
  );

  // Fire order.created automation triggers (non-fatal).
  void fireAutomations("order.created", { userId: input.userId });

  return { orderId, orderNumber, quote };
}

/** Apply active admin-configured order actions for a lifecycle event. */
export async function applyOrderAutomationRules(
  orderId: number,
  triggerType: "order_status" | "payment_status" | "intake_submitted" | "phase_started",
  triggerValue?: string,
): Promise<void> {
  const rules = await db
    .select()
    .from(orderAutomationRules)
    .where(and(eq(orderAutomationRules.isActive, true), eq(orderAutomationRules.triggerType, triggerType)))
    .orderBy(orderAutomationRules.sortOrder);

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;
  const customer = await getUserById(order.userId);
  const projectName = order.projectNameEnc ? decryptField(order.projectNameEnc, `order:${order.id}`) : null;
  const variables = {
    name: customer ? displayNameOf(customer) : "Customer",
    email: customer?.email ?? "",
    orderNumber: order.orderNumber,
    orderId: order.id,
    projectName: projectName ?? "",
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    automationEvent: triggerType,
    automationValue: triggerValue ?? "",
  };

  for (const rule of rules) {
    if (rule.triggerValue && rule.triggerValue !== (triggerValue ?? null)) continue;
    if (rule.actionType === "set_completion_percent" && rule.completionPercent !== null) {
      await db
        .update(orders)
        .set({ completionPercent: Math.max(0, Math.min(100, rule.completionPercent)) })
        .where(eq(orders.id, orderId));
      void recordActivity({
        actorUserId: null,
        actorRole: "system",
        action: "order.automation_applied",
        entityType: "order",
        entityId: orderId,
        summary: `Order automation \"${rule.name}\" set completion to ${rule.completionPercent}%`,
        changes: { ruleId: rule.id, triggerType, triggerValue: triggerValue ?? null, completionPercent: rule.completionPercent },
      });
    } else if (rule.actionType === "send_email" && rule.emailTemplateKey && customer?.email) {
      await queueTemplatedEmail({ to: customer.email, templateKey: rule.emailTemplateKey, variables });
      void recordActivity({
        actorUserId: null,
        actorRole: "system",
        action: "order.automation_email_queued",
        entityType: "order",
        entityId: orderId,
        summary: `Order automation \"${rule.name}\" queued email template ${rule.emailTemplateKey}`,
        changes: { ruleId: rule.id, triggerType, triggerValue: triggerValue ?? null, templateKey: rule.emailTemplateKey },
      });
    } else if (rule.actionType === "send_webhook" && rule.webhookEndpointId) {
      const [endpoint] = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.id, rule.webhookEndpointId), eq(webhookEndpoints.enabled, true))).limit(1);
      if (!endpoint) {
        logger.warn("order.automation.webhook_endpoint_unavailable", { orderId, ruleId: rule.id, endpointId: rule.webhookEndpointId });
        continue;
      }
      await db.insert(webhookDeliveries).values({
        endpointId: endpoint.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: customer ? displayNameOf(customer) : null,
        eventType: `order.${triggerType}`,
        payload: { orderId: order.id, orderNumber: order.orderNumber, customerId: order.userId, projectName, status: order.status, paymentStatus: order.paymentStatus, triggerType, triggerValue: triggerValue ?? null, ruleId: rule.id, occurredAt: new Date().toISOString() },
        status: "pending",
        attempts: 0,
      });
      void recordActivity({
        actorUserId: null,
        actorRole: "system",
        action: "order.automation_webhook_queued",
        entityType: "order",
        entityId: orderId,
        summary: `Order automation \"${rule.name}\" queued webhook endpoint ${endpoint.id}`,
        changes: { ruleId: rule.id, triggerType, triggerValue: triggerValue ?? null, endpointId: endpoint.id },
      });
    }
  }
}

export interface TransitionInput {
  orderId: number;
  to: OrderStatus;
  actorUserId: number;
  actorRole: string;
  reason?: string;
  ipAddress?: string | null;
}

async function assertPhaseOneComplete(orderId: number): Promise<void> {
  const intake = await db
    .select({ submittedAt: intakeSubmissions.submittedAt })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.orderId, orderId))
    .limit(1);
  if (!intake[0]?.submittedAt) {
    throw new OrderStateError(
      "Phase I cannot close until the intake form has been submitted.",
    );
  }
  const mnda = await db
    .select({ id: mndaAcceptances.id })
    .from(mndaAcceptances)
    .where(eq(mndaAcceptances.orderId, orderId))
    .limit(1);
  if (!mnda[0]) {
    throw new OrderStateError(
      "Phase I cannot close until the mutual NDA has been signed.",
    );
  }
}

async function assertDeliverablePresent(orderId: number): Promise<void> {
  const rows = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(files)
    .where(
      and(
        eq(files.orderId, orderId),
        eq(files.visibleToCustomer, true),
        eq(files.isPlaceholder, false),
        isNull(files.deletedAt),
      ),
    );
  if (Number(rows[0]?.total ?? 0) === 0) {
    throw new OrderStateError(
      "An order cannot be marked delivered until at least one customer-visible deliverable is attached.",
    );
  }
}

export async function transitionOrder(input: TransitionInput) {
  const rows = await db
    .select({ id: orders.id, status: orders.status, orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.id, input.orderId), isNull(orders.deletedAt)))
    .limit(1);
  const order = rows[0];
  if (!order) throw new OrderStateError("Order not found.");

  const from = order.status as OrderStatus;
  if (from === input.to) return { changed: false as const };

  const allowed = ORDER_TRANSITIONS[from] ?? [];
  if (!allowed.includes(input.to)) {
    throw new OrderStateError(
      `An order in state "${from}" cannot move to "${input.to}".`,
    );
  }

  if (from === "phase_1_intake" && input.to === "phase_2_synthesis") {
    await assertPhaseOneComplete(input.orderId);
  }
  if (input.to === "delivered") {
    await assertDeliverablePresent(input.orderId);
  }

  const patch: Partial<typeof orders.$inferInsert> = { status: input.to };
  if (input.to === "delivered") {
    patch.deliveredAt = new Date();
    patch.completionPercent = 100;
  }
  if (input.to === "closed") patch.closedAt = new Date();

  await db.update(orders).set(patch).where(eq(orders.id, input.orderId));

  await db.insert(orderStatusHistory).values({
    orderId: input.orderId,
    fromStatus: from,
    toStatus: input.to,
    actorUserId: input.actorUserId,
    reason: input.reason?.slice(0, 255) ?? null,
  });

  void recordActivity({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: "order.transition",
    entityType: "order",
    entityId: input.orderId,
    summary: `Order ${order.orderNumber} moved from ${from} to ${input.to}`,
    changes: { from, to: input.to, reason: input.reason ?? null },
    ipAddress: input.ipAddress ?? null,
  });

  await enqueuePhaseJobs(input.orderId, input.to);
  await applyOrderAutomationRules(input.orderId, "order_status", input.to);

  // Fire email automation triggers based on the new order state.
  const orderRow = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  const userId = orderRow[0]?.userId;
  if (userId) {
    if (input.to === "delivered") {
      void fireAutomations("order.delivered", { userId });
    } else if (input.to === "closed") {
      void fireAutomations("order.closed", { userId });
    } else {
      void fireAutomations("order.phase_changed", { userId });
    }
  }

  return { changed: true as const, from, to: input.to };
}

/** Queue the automation jobs configured for a phase, if that phase is enabled. */
export async function enqueuePhaseJobs(orderId: number, phase: OrderStatus): Promise<void> {
  const configs = await db
    .select()
    .from(phaseKickoffConfigs)
    .where(and(eq(phaseKickoffConfigs.phase, phase), eq(phaseKickoffConfigs.enabled, true)))
    .limit(1);
  const config = configs[0];
  if (!config) return;

  const jobs: { jobType: string }[] = [];
  if (config.createFolders) jobs.push({ jobType: "create_folders" });
  if (config.attachPlaceholders) jobs.push({ jobType: "attach_placeholders" });
  if (config.notifyCustomer) jobs.push({ jobType: "notify_customer" });
  if (config.notifyWebhooks) jobs.push({ jobType: "dispatch_webhooks" });
  if (jobs.length === 0) return;

  await db.insert(phaseJobs).values(
    jobs.map((job) => ({ orderId, phase, jobType: job.jobType })),
  );
  logger.info("Queued phase kickoff jobs", { orderId, phase, count: jobs.length });
}

export interface OrderSummary {
  id: number;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  projectName: string | null;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  bundleApplied: boolean;
  completionPercent: number;
  createdAt: Date;
  deliveredAt: Date | null;
  dueAt: Date | null;
  itemCount: number;
}

export async function listOrdersForUser(userId: number): Promise<OrderSummary[]> {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      projectNameEnc: orders.projectNameEnc,
      subtotalCents: orders.subtotalCents,
      discountCents: orders.discountCents,
      totalCents: orders.totalCents,
      bundleApplied: orders.bundleApplied,
      completionPercent: orders.completionPercent,
      createdAt: orders.createdAt,
      deliveredAt: orders.deliveredAt,
      dueAt: orders.dueAt,
    })
    .from(orders)
    .where(and(sql`(${orders.userId} = ${userId} OR EXISTS (SELECT 1 FROM order_shares os WHERE os.order_id = ${orders.id} AND os.shared_with_user_id = ${userId} AND os.revoked_at IS NULL))`, isNull(orders.deletedAt)))
    .orderBy(desc(orders.createdAt));

  if (rows.length === 0) return [];

  const counts = await db
    .select({ orderId: orderItems.orderId, total: count() })
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((row) => row.id)))
    .groupBy(orderItems.orderId);
  const countMap = new Map(counts.map((row) => [row.orderId, Number(row.total)]));

  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    paymentStatus: row.paymentStatus,
    projectName: decryptField(row.projectNameEnc, `order:${row.id}`),
    subtotalCents: row.subtotalCents,
    discountCents: row.discountCents,
    totalCents: row.totalCents,
    bundleApplied: row.bundleApplied,
    completionPercent: row.completionPercent,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
    dueAt: row.dueAt,
    itemCount: countMap.get(row.id) ?? 0,
  }));
}

/**
 * Ownership assertion used by every customer-facing order endpoint.
 * Returns the order id when the caller is the owner, a delegate, or staff.
 */
export async function assertOrderAccess(
  orderId: number,
  userId: number,
  role: string,
): Promise<void> {
  if (role === "admin" || role === "staff") {
    const exists = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!exists[0]) throw new OrderStateError("Order not found.");
    return;
  }

  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId), isNull(orders.deletedAt)))
    .limit(1);
  if (rows[0]) return;

  const shared = await db.execute(
    sql`SELECT id FROM order_shares WHERE order_id = ${orderId} AND shared_with_user_id = ${userId} AND revoked_at IS NULL LIMIT 1`,
  );
  const sharedRows = (shared as unknown as [unknown[]])[0];
  if (Array.isArray(sharedRows) && sharedRows.length > 0) return;

  // A missing order and a forbidden order are indistinguishable to the caller.
  throw new OrderStateError("Order not found.");
}

export async function getOrderDetail(orderId: number) {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
    .limit(1);
  const order = rows[0];
  if (!order) throw new OrderStateError("Order not found.");

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(desc(orderStatusHistory.createdAt));

  return {
    order: {
      ...order,
      projectName: decryptField(order.projectNameEnc, `order:${orderId}`),
      internalNotes: null as string | null,
    },
    items,
    history,
  };
}

export interface OrderStats {
  total: number;
  byStatus: Record<string, number>;
  revenueCents: number;
  last30DaysCount: number;
}

export async function getOrderStats(): Promise<OrderStats> {
  const statusRows = await db
    .select({ status: orders.status, total: count() })
    .from(orders)
    .where(isNull(orders.deletedAt))
    .groupBy(orders.status);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    byStatus[row.status] = Number(row.total);
    total += Number(row.total);
  }

  const revenueRows = await db
    .select({ revenue: sql<number>`COALESCE(SUM(${orders.totalCents}), 0)` })
    .from(orders)
    .where(and(isNull(orders.deletedAt), inArray(orders.paymentStatus, ["paid", "partially_refunded"])));

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentRows = await db
    .select({ total: count() })
    .from(orders)
    .where(and(isNull(orders.deletedAt), gte(orders.createdAt, since)));

  return {
    total,
    byStatus,
    revenueCents: Number(revenueRows[0]?.revenue ?? 0),
    last30DaysCount: Number(recentRows[0]?.total ?? 0),
  };
}

/** Permanently remove soft-deleted orders past the retention window. */
export async function purgeSoftDeletedOrders(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(sql`${orders.deletedAt} IS NOT NULL`, lte(orders.deletedAt, cutoff)))
    .limit(200);
  if (stale.length === 0) return 0;
  const ids = stale.map((row) => row.id);
  await db.delete(orderItems).where(inArray(orderItems.orderId, ids));
  await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, ids));
  await db.delete(orders).where(inArray(orders.id, ids));
  return ids.length;
}
