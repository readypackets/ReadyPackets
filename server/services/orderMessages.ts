import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { orderMessageReceipts, orderShares, orders, users } from "../db/schema.js";

/**
 * Creates recipient-local unread state without copying the encrypted message body.
 * Shared messages are delivered to the order owner, active delegates, and active
 * staff. Internal notes remain available to active staff only.
 */
export async function createOrderMessageReceipts(input: {
  orderId: number;
  orderNoteId: number;
  authorUserId: number;
  visibility: "shared" | "internal";
}): Promise<void> {
  const orderRows = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(and(eq(orders.id, input.orderId), isNull(orders.deletedAt)))
    .limit(1);
  const order = orderRows[0];
  if (!order) return;

  const staff = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ["admin", "staff"]), eq(users.status, "active"), isNull(users.deletedAt)));
  const recipientIds = new Set(staff.map((user) => user.id));

  if (input.visibility === "shared") {
    recipientIds.add(order.userId);
    const shares = await db
      .select({ userId: orderShares.sharedWithUserId })
      .from(orderShares)
      .innerJoin(users, eq(orderShares.sharedWithUserId, users.id))
      .where(and(eq(orderShares.orderId, input.orderId), isNull(orderShares.revokedAt), eq(users.status, "active"), isNull(users.deletedAt)));
    for (const share of shares) recipientIds.add(share.userId);
  }

  recipientIds.delete(input.authorUserId);
  const values = [...recipientIds].map((userId) => ({
    orderNoteId: input.orderNoteId,
    userId,
    readAt: null,
  }));
  if (values.length === 0) return;
  await db
    .insert(orderMessageReceipts)
    .values(values)
    .onDuplicateKeyUpdate({ set: { readAt: null } });
}

/** Marks an individual message as read for a single recipient. */
export async function markOrderMessageRead(orderNoteId: number, userId: number): Promise<void> {
  await db
    .insert(orderMessageReceipts)
    .values({ orderNoteId, userId, readAt: new Date() })
    .onDuplicateKeyUpdate({ set: { readAt: new Date() } });
}

