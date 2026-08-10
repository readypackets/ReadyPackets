/**
 * Support ticket router.
 *
 * Subjects and bodies are encrypted at rest. Internal staff notes live in the
 * same table but are filtered out of every customer response, so a note cannot
 * leak through an id-based fetch.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { ticketReplies, tickets } from "../db/schema.js";
import { decryptField, encryptField } from "../security/crypto.js";
import { recordActivity } from "../observability/audit.js";
import { queueTemplatedEmail, wrapHtmlBody } from "../services/email.js";
import { getUserById, displayNameOf } from "../db/users.js";
import { assertOrderAccess, OrderStateError } from "../services/orders.js";
import { protectedProcedure, router } from "../trpc/trpc.js";
import { TICKET_PRIORITIES } from "../../shared/domain.js";
import { insertedId } from "../db/result.js";

const TICKET_CATEGORIES = [
  "general",
  "order",
  "billing",
  "technical",
  "deliverable",
  "account",
] as const;

function ticketNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.floor(Math.random() * 46_656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `TK-${stamp}-${suffix}`;
}

export const ticketsRouter = router({
  categories: protectedProcedure.query(() => ({
    categories: TICKET_CATEGORIES,
    priorities: TICKET_PRIORITIES,
  })),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: tickets.id,
        ticketNumber: tickets.ticketNumber,
        subjectEnc: tickets.subjectEnc,
        category: tickets.category,
        status: tickets.status,
        priority: tickets.priority,
        orderId: tickets.orderId,
        lastReplyAt: tickets.lastReplyAt,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .where(eq(tickets.userId, ctx.session.user.id))
      .orderBy(desc(tickets.createdAt));

    return rows.map((row) => ({
      id: row.id,
      ticketNumber: row.ticketNumber,
      subject: decryptField(row.subjectEnc, `ticket:${row.id}`) ?? "",
      category: row.category,
      status: row.status,
      priority: row.priority,
      orderId: row.orderId,
      lastReplyAt: row.lastReplyAt,
      createdAt: row.createdAt,
    }));
  }),

  detail: protectedProcedure
    .input(z.object({ ticketId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const isStaff = ctx.session.user.role === "admin" || ctx.session.user.role === "staff";
      const conditions = [eq(tickets.id, input.ticketId)];
      if (!isStaff) conditions.push(eq(tickets.userId, ctx.session.user.id));

      const rows = await db
        .select()
        .from(tickets)
        .where(and(...conditions))
        .limit(1);
      const ticket = rows[0];
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found." });

      const replyConditions = [eq(ticketReplies.ticketId, input.ticketId)];
      if (!isStaff) replyConditions.push(eq(ticketReplies.internalOnly, false));

      const replyRows = await db
        .select()
        .from(ticketReplies)
        .where(and(...replyConditions))
        .orderBy(asc(ticketReplies.createdAt));

      const authorIds = [...new Set(replyRows.map((row) => row.authorUserId))];
      const authors = new Map<number, string>();
      for (const authorId of authorIds) {
        const user = await getUserById(authorId);
        if (user) {
          authors.set(
            authorId,
            user.role === "customer" ? displayNameOf(user) : "ReadyPackets Support",
          );
        }
      }

      return {
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: decryptField(ticket.subjectEnc, `ticket:${ticket.id}`) ?? "",
          category: ticket.category,
          status: ticket.status,
          priority: ticket.priority,
          orderId: ticket.orderId,
          createdAt: ticket.createdAt,
          resolvedAt: ticket.resolvedAt,
        },
        replies: replyRows.map((row) => ({
          id: row.id,
          body: decryptField(row.bodyEnc, `ticket_reply:${row.id}`) ?? "",
          author: authors.get(row.authorUserId) ?? "ReadyPackets",
          isStaffReply: row.authorUserId !== ticket.userId,
          internalOnly: row.internalOnly,
          createdAt: row.createdAt,
        })),
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        subject: z.string().trim().min(5).max(190),
        body: z.string().trim().min(20, "Please describe the issue in a little more detail.").max(10_000),
        category: z.enum(TICKET_CATEGORIES).default("general"),
        priority: z.enum(TICKET_PRIORITIES).default("normal"),
        orderId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.orderId !== undefined) {
        try {
          await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
        } catch (error) {
          if (error instanceof OrderStateError) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
          }
          throw error;
        }
      }

      const number = ticketNumber();
      const inserted = await db.insert(tickets).values({
        ticketNumber: number,
        userId: ctx.session.user.id,
        orderId: input.orderId ?? null,
        subjectEnc: encryptField(input.subject, "ticket:pending") ?? "",
        category: input.category,
        // Customer-selected urgency is advisory; staff set the real priority.
        priority: input.priority === "urgent" ? "high" : input.priority,
        lastReplyAt: new Date(),
      });
      const ticketId = insertedId(inserted);
      await db
        .update(tickets)
        .set({ subjectEnc: encryptField(input.subject, `ticket:${ticketId}`) ?? "" })
        .where(eq(tickets.id, ticketId));

      const replyInserted = await db.insert(ticketReplies).values({
        ticketId,
        authorUserId: ctx.session.user.id,
        bodyEnc: encryptField(input.body, "ticket_reply:pending") ?? "",
      });
      const replyId = insertedId(replyInserted);
      await db
        .update(ticketReplies)
        .set({ bodyEnc: encryptField(input.body, `ticket_reply:${replyId}`) ?? "" })
        .where(eq(ticketReplies.id, replyId));

      const user = await getUserById(ctx.session.user.id);
      if (user) {
        await queueTemplatedEmail({
          to: user.email,
          templateKey: "ticket_created",
          variables: { name: displayNameOf(user), ticketNumber: number, subject: input.subject },
          fallback: {
            subject: `Support ticket {{ticketNumber}} received`,
            html: wrapHtmlBody(
              "Support ticket received",
              `<h1 style="margin:0 0 12px 0;font-size:20px;">Ticket {{ticketNumber}}</h1>
               <p style="margin:0 0 12px 0;">Hello {{name}}, we have logged your request regarding "{{subject}}".</p>
               <p style="margin:0;">A member of the team will respond within one business day. You can follow the conversation in your portal.</p>`,
            ),
          },
        });
      }

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "ticket.create",
        entityType: "ticket",
        entityId: ticketId,
        summary: `Support ticket ${number} opened (${input.category})`,
        ipAddress: ctx.clientIp,
      });

      return { ok: true as const, ticketId, ticketNumber: number };
    }),

  reply: protectedProcedure
    .input(
      z.object({
        ticketId: z.number().int().positive(),
        body: z.string().trim().min(1).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isStaff = ctx.session.user.role === "admin" || ctx.session.user.role === "staff";
      const conditions = [eq(tickets.id, input.ticketId)];
      if (!isStaff) conditions.push(eq(tickets.userId, ctx.session.user.id));

      const rows = await db
        .select({ id: tickets.id, status: tickets.status })
        .from(tickets)
        .where(and(...conditions))
        .limit(1);
      const ticket = rows[0];
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found." });
      if (ticket.status === "closed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This ticket is closed. Open a new ticket to continue the conversation.",
        });
      }

      const inserted = await db.insert(ticketReplies).values({
        ticketId: input.ticketId,
        authorUserId: ctx.session.user.id,
        bodyEnc: encryptField(input.body, "ticket_reply:pending") ?? "",
      });
      const replyId = insertedId(inserted);
      await db
        .update(ticketReplies)
        .set({ bodyEnc: encryptField(input.body, `ticket_reply:${replyId}`) ?? "" })
        .where(eq(ticketReplies.id, replyId));

      await db
        .update(tickets)
        .set({
          lastReplyAt: new Date(),
          status: isStaff ? "answered" : "pending",
        })
        .where(eq(tickets.id, input.ticketId));

      return { ok: true as const, replyId };
    }),

  close: protectedProcedure
    .input(z.object({ ticketId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.id, input.ticketId), eq(tickets.userId, ctx.session.user.id)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found." });

      await db
        .update(tickets)
        .set({ status: "closed", resolvedAt: new Date() })
        .where(eq(tickets.id, input.ticketId));
      return { ok: true as const };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(tickets)
      .where(and(eq(tickets.userId, ctx.session.user.id), eq(tickets.status, "answered")));
    return Number(rows[0]?.total ?? 0);
  }),
});
