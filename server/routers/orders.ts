/**
 * Customer-facing order router.
 *
 * Every procedure resolves ownership through {@link assertOrderAccess} before
 * touching order data, and a caller who is not entitled to an order receives
 * "not found" rather than "forbidden", so ids cannot be probed.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  files,
  orderAnswers,
  orderAnswerHistory,
  orderNotes,
  orderQuestions,
  orders,
} from "../db/schema.js";
import { decryptField, encryptField } from "../security/crypto.js";
import { recordActivity } from "../observability/audit.js";
import {
  OrderStateError,
  assertOrderAccess,
  createOrder,
  getOrderDetail,
  listOrdersForUser,
} from "../services/orders.js";
import { priceSelection } from "../services/catalog.js";
import { protectedProcedure, publicProcedure, router } from "../trpc/trpc.js";
import { insertedId } from "../db/result.js";

function toTrpcError(error: unknown): never {
  if (error instanceof OrderStateError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

const selectionSchema = z
  .array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(10).default(1),
    }),
  )
  .min(1, "Select at least one packet.")
  .max(40);

export const ordersRouter = router({
  /** Live quote for the configurator; safe to call anonymously. */
  quote: publicProcedure
    .input(z.object({ selections: selectionSchema }))
    .query(async ({ input }) => priceSelection(input.selections)),

  list: protectedProcedure.query(async ({ ctx }) =>
    listOrdersForUser(ctx.session.user.id),
  ),

  detail: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try {
        await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
        const detail = await getOrderDetail(input.orderId);

        const deliverables = await db
          .select({
            id: files.id,
            originalName: files.originalName,
            sizeBytes: files.sizeBytes,
            extension: files.extension,
            category: files.category,
            isPlaceholder: files.isPlaceholder,
            version: files.version,
            createdAt: files.createdAt,
          })
          .from(files)
          .where(
            and(
              eq(files.orderId, input.orderId),
              eq(files.visibleToCustomer, true),
              isNull(files.deletedAt),
            ),
          )
          .orderBy(desc(files.createdAt));

        // Customers see shared notes only; internal notes never leave the admin panel.
        const notes = await db
          .select({
            id: orderNotes.id,
            bodyEnc: orderNotes.bodyEnc,
            createdAt: orderNotes.createdAt,
          })
          .from(orderNotes)
          .where(
            and(eq(orderNotes.orderId, input.orderId), eq(orderNotes.visibility, "shared")),
          )
          .orderBy(desc(orderNotes.createdAt));

        return {
          order: {
            id: detail.order.id,
            orderNumber: detail.order.orderNumber,
            status: detail.order.status,
            paymentStatus: detail.order.paymentStatus,
            projectName: detail.order.projectName,
            subtotalCents: detail.order.subtotalCents,
            discountCents: detail.order.discountCents,
            totalCents: detail.order.totalCents,
            bundleApplied: detail.order.bundleApplied,
            completionPercent: detail.order.completionPercent,
            integrityChoice: detail.order.integrityChoice,
            createdAt: detail.order.createdAt,
            dueAt: detail.order.dueAt,
            deliveredAt: detail.order.deliveredAt,
          },
          items: detail.items.map((item) => ({
            id: item.id,
            sku: item.sku,
            name: item.name,
            tier: item.tier,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents,
          })),
          history: detail.history.map((entry) => ({
            id: entry.id,
            fromStatus: entry.fromStatus,
            toStatus: entry.toStatus,
            reason: entry.reason,
            createdAt: entry.createdAt,
          })),
          deliverables,
          notes: notes.map((note) => ({
            id: note.id,
            body: decryptField(note.bodyEnc, `order_note:${note.id}`) ?? "",
            createdAt: note.createdAt,
          })),
        };
      } catch (error) {
        toTrpcError(error);
      }
    }),

  create: protectedProcedure
    .input(
      z.object({
        selections: selectionSchema,
        projectName: z.string().trim().max(190).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createOrder({
          userId: ctx.session.user.id,
          selections: input.selections,
          projectName: input.projectName ?? null,
          actorUserId: ctx.session.user.id,
          actorRole: ctx.session.user.role,
          ipAddress: ctx.clientIp,
        });
        return {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          totalCents: result.quote.totalCents,
          requiresCustomQuote: result.quote.requiresCustomQuote,
        };
      } catch (error) {
        toTrpcError(error);
      }
    }),

  /* ---------------------------------------------------------------- */
  /* Clarification questions raised by the analyst team               */
  /* ---------------------------------------------------------------- */

  questions: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try {
        await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
        const questions = await db
          .select()
          .from(orderQuestions)
          .where(eq(orderQuestions.orderId, input.orderId))
          .orderBy(asc(orderQuestions.sortOrder), asc(orderQuestions.id));

        const answers = await db
          .select()
          .from(orderAnswers)
          .where(eq(orderAnswers.orderId, input.orderId));
        const answerByQuestion = new Map(answers.map((row) => [row.questionId, row]));

        return questions.map((question) => {
          const answer = answerByQuestion.get(question.id);
          return {
            id: question.id,
            question: decryptField(question.questionEnc, `order_question:${question.id}`) ?? "",
            required: question.required,
            status: question.status,
            answer: answer
              ? {
                  id: answer.id,
                  body: decryptField(answer.answerEnc, `order_answer:${answer.id}`) ?? "",
                  version: answer.version,
                  updatedAt: answer.updatedAt,
                }
              : null,
          };
        });
      } catch (error) {
        toTrpcError(error);
      }
    }),

  answerQuestion: protectedProcedure
    .input(
      z.object({
        questionId: z.number().int().positive(),
        body: z.string().trim().min(1).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select({ id: orderQuestions.id, orderId: orderQuestions.orderId })
        .from(orderQuestions)
        .where(eq(orderQuestions.id, input.questionId))
        .limit(1);
      const question = rows[0];
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found." });

      try {
        await assertOrderAccess(question.orderId, ctx.session.user.id, ctx.session.user.role);
      } catch (error) {
        toTrpcError(error);
      }

      const existing = await db
        .select()
        .from(orderAnswers)
        .where(eq(orderAnswers.questionId, input.questionId))
        .limit(1);
      const previous = existing[0];

      if (previous) {
        // Edits are versioned rather than overwritten, so the trail is complete.
        await db.insert(orderAnswerHistory).values({
          answerId: previous.id,
          previousAnswerEnc: previous.answerEnc,
          version: previous.version,
          changedByUserId: ctx.session.user.id,
        });
        await db
          .update(orderAnswers)
          .set({
            answerEnc: encryptField(input.body, `order_answer:${previous.id}`) ?? "",
            version: previous.version + 1,
            answeredByUserId: ctx.session.user.id,
          })
          .where(eq(orderAnswers.id, previous.id));
      } else {
        const inserted = await db.insert(orderAnswers).values({
          questionId: input.questionId,
          orderId: question.orderId,
          answeredByUserId: ctx.session.user.id,
          answerEnc: encryptField(input.body, "order_answer:pending") ?? "",
        });
        const answerId = insertedId(inserted);
        await db
          .update(orderAnswers)
          .set({ answerEnc: encryptField(input.body, `order_answer:${answerId}`) ?? "" })
          .where(eq(orderAnswers.id, answerId));
      }

      await db
        .update(orderQuestions)
        .set({ status: "answered" })
        .where(eq(orderQuestions.id, input.questionId));

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "order.answer_question",
        entityType: "order",
        entityId: question.orderId,
        summary: `Customer answered clarification question ${input.questionId}`,
        ipAddress: ctx.clientIp,
      });

      return { ok: true as const };
    }),

  /** Cancellation is a request, not an action: staff confirm and handle refunds. */
  requestCancellation: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        reason: z.string().trim().min(10).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
      } catch (error) {
        toTrpcError(error);
      }

      const inserted = await db.insert(orderNotes).values({
        orderId: input.orderId,
        authorUserId: ctx.session.user.id,
        bodyEnc: encryptField(`Cancellation requested: ${input.reason}`, "order_note:pending") ?? "",
        visibility: "shared",
      });
      const noteId = insertedId(inserted);
      await db
        .update(orderNotes)
        .set({
          bodyEnc:
            encryptField(`Cancellation requested: ${input.reason}`, `order_note:${noteId}`) ?? "",
        })
        .where(eq(orderNotes.id, noteId));

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "order.cancellation_requested",
        entityType: "order",
        entityId: input.orderId,
        severity: "notice",
        summary: "Customer requested cancellation",
        ipAddress: ctx.clientIp,
      });

      return { ok: true as const };
    }),

  addNote: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        body: z.string().trim().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
      } catch (error) {
        toTrpcError(error);
      }
      const inserted = await db.insert(orderNotes).values({
        orderId: input.orderId,
        authorUserId: ctx.session.user.id,
        bodyEnc: encryptField(input.body, "order_note:pending") ?? "",
        visibility: "shared",
      });
      const noteId = insertedId(inserted);
      await db
        .update(orderNotes)
        .set({ bodyEnc: encryptField(input.body, `order_note:${noteId}`) ?? "" })
        .where(eq(orderNotes.id, noteId));
      return { ok: true as const, noteId };
    }),

  /** Dashboard counters for the portal landing page. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ status: orders.status, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(and(eq(orders.userId, ctx.session.user.id), isNull(orders.deletedAt)));

    const active = rows.filter(
      (row) => !["delivered", "closed", "cancelled", "refunded"].includes(row.status),
    ).length;
    const delivered = rows.filter((row) => row.status === "delivered" || row.status === "closed")
      .length;
    const awaitingPayment = rows.filter(
      (row) => row.paymentStatus === "unpaid" || row.paymentStatus === "awaiting_invoice",
    ).length;

    return { total: rows.length, active, delivered, awaitingPayment };
  }),
});
