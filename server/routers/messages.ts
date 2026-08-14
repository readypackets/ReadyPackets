import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { orderMessageReceipts, orderNotes, orderShares, orders, users } from "../db/schema.js";
import { decryptField } from "../security/crypto.js";
import { markOrderMessageRead } from "../services/orderMessages.js";
import { assertOrderAccess, OrderStateError } from "../services/orders.js";
import { protectedProcedure, router } from "../trpc/trpc.js";

const messageListInput = z.object({
  unreadOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(250).default(100),
});

type MessageCenterRow = {
  id: number;
  orderId: number;
  orderNumber: string;
  projectNameEnc: string | null;
  authorUserId: number;
  authorRole: string | null;
  bodyEnc: string;
  visibility: string;
  createdAt: Date;
  receiptId: number | null;
  receiptReadAt: Date | null;
};

function customerOrderAccessSql(userId: number) {
  return sql`(${orders.userId} = ${userId} OR EXISTS (
    SELECT 1 FROM order_shares os
    WHERE os.order_id = ${orders.id}
      AND os.shared_with_user_id = ${userId}
      AND os.revoked_at IS NULL
  ))`;
}

async function listMessagesForSession(input: {
  userId: number;
  role: string;
  unreadOnly: boolean;
  limit: number;
}) {
  const isStaff = input.role === "admin" || input.role === "staff";
  const conditions = [isNull(orders.deletedAt)];
  if (!isStaff) conditions.push(customerOrderAccessSql(input.userId));
  if (!isStaff) conditions.push(eq(orderNotes.visibility, "shared"));

  const rows = await db
    .select({
      id: orderNotes.id,
      orderId: orderNotes.orderId,
      orderNumber: orders.orderNumber,
      projectNameEnc: orders.projectNameEnc,
      authorUserId: orderNotes.authorUserId,
      authorRole: users.role,
      bodyEnc: orderNotes.bodyEnc,
      visibility: orderNotes.visibility,
      createdAt: orderNotes.createdAt,
      receiptId: orderMessageReceipts.id,
      receiptReadAt: orderMessageReceipts.readAt,
    })
    .from(orderNotes)
    .innerJoin(orders, eq(orderNotes.orderId, orders.id))
    .leftJoin(users, eq(orderNotes.authorUserId, users.id))
    .leftJoin(
      orderMessageReceipts,
      and(eq(orderMessageReceipts.orderNoteId, orderNotes.id), eq(orderMessageReceipts.userId, input.userId)),
    )
    .where(and(...conditions))
    .orderBy(desc(orderNotes.createdAt))
    .limit(input.limit);

  const messages = (rows as MessageCenterRow[]).map((row) => {
    const unread = row.authorUserId !== input.userId && row.receiptId !== null && row.receiptReadAt === null;
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      projectName: decryptField(row.projectNameEnc, `order:${row.orderId}`) ?? "Untitled project",
      authorRole: row.authorRole ?? "team",
      body: decryptField(row.bodyEnc, `order_note:${row.id}`) ?? "",
      visibility: row.visibility,
      createdAt: row.createdAt,
      unread,
    };
  });
  const filtered = input.unreadOnly ? messages.filter((message) => message.unread) : messages;
  return { messages: filtered, unreadCount: messages.filter((message) => message.unread).length };
}

export const messagesRouter = router({
  list: protectedProcedure.input(messageListInput).query(async ({ ctx, input }) =>
    listMessagesForSession({
      userId: ctx.session.user.id,
      role: ctx.session.user.role,
      unreadOnly: input.unreadOnly,
      limit: input.limit,
    }),
  ),

  unread: protectedProcedure.query(async ({ ctx }) => {
    const result = await listMessagesForSession({
      userId: ctx.session.user.id,
      role: ctx.session.user.role,
      unreadOnly: true,
      limit: 250,
    });
    return { count: result.unreadCount, messages: result.messages };
  }),

  markRead: protectedProcedure
    .input(z.object({ noteId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select({ orderId: orderNotes.orderId, visibility: orderNotes.visibility })
        .from(orderNotes)
        .where(eq(orderNotes.id, input.noteId))
        .limit(1);
      const note = rows[0];
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
      try {
        await assertOrderAccess(note.orderId, ctx.session.user.id, ctx.session.user.role);
      } catch (error) {
        if (error instanceof OrderStateError) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
        throw error;
      }
      const isStaff = ctx.session.user.role === "admin" || ctx.session.user.role === "staff";
      if (!isStaff && note.visibility !== "shared") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
      }
      await markOrderMessageRead(input.noteId, ctx.session.user.id);
      return { ok: true as const };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(orderMessageReceipts)
      .set({ readAt: new Date() })
      .where(and(eq(orderMessageReceipts.userId, ctx.session.user.id), isNull(orderMessageReceipts.readAt)));
    return { ok: true as const };
  }),
});
