/**
 * Administrative operations: orders, customers, catalogue, content, moderation.
 *
 * Every mutation writes an activity record with a before/after diff, so the
 * admin panel is auditable rather than merely powerful. Destructive operations
 * are soft deletes wherever a record has legal or financial significance.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, inArray, isNull, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  changelogEntries,
  contactMessages,
  emailTemplates,
  files,
  forumPosts,
  forumTopics,
  homeContentBlocks,
  intakeAnswers,
  intakeSubmissions,
  orderNotes,
  orderQuestionTemplates,
  orderQuestions,
  orderAnswers,
  orderAnswerHistory,
  orderItems,
  orderAutomationRules,
  orders,
  packetGroups,
  policyAcceptances,
  policyDocuments,
  policyVersions,
  productFeatures,
  products,
  registrationFields,
  reviews,
  ticketReplies,
  tickets,
  users,
} from "../db/schema.js";
import { decryptField, encryptField, hashPassword, randomToken } from "../security/crypto.js";
import {
  createUser,
  decryptUser,
  displayNameOf,
  getUserById,
  listUsers,
  searchUsers,
  setAdminNotes,
  setUserRole,
  setUserStatus,
  softDeleteUser,
  restoreUser,
} from "../db/users.js";
import { recordActivity, recordSecurityEvent } from "../observability/audit.js";
import { revokeAllUserSessions } from "../auth/session.js";
import {
  OrderStateError,
  createOrder,
  applyOrderAutomationRules,
  getOrderStats,
  transitionOrder,
} from "../services/orders.js";
import { getCatalog } from "../services/catalog.js";
import { queueTemplatedEmail, wrapHtmlBody } from "../services/email.js";
import { adminProcedure, staffProcedure, router } from "../trpc/trpc.js";
import { ORDER_STATUSES, PRODUCT_TIERS, USER_ROLES } from "../../shared/domain.js";
import { insertedId } from "../db/result.js";

function toTrpcError(error: unknown): never {
  if (error instanceof OrderStateError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const adminRouter = router({
  /* ---------------------------------------------------------------- */
  /* Dashboard                                                         */
  /* ---------------------------------------------------------------- */

  dashboard: staffProcedure.query(async () => {
    const [orderStats, customerCount, openTickets, pendingReviews, newMessages] =
      await Promise.all([
        getOrderStats(),
        db
          .select({ total: count() })
          .from(users)
          .where(and(eq(users.role, "customer"), isNull(users.deletedAt))),
        db
          .select({ total: count() })
          .from(tickets)
          .where(sql`${tickets.status} IN ('open','pending')`),
        db.select({ total: count() }).from(reviews).where(eq(reviews.status, "pending")),
        db.select({ total: count() }).from(contactMessages).where(eq(contactMessages.status, "new")),
      ]);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [signupTrend, orderTrend, revenueTrend] = await Promise.all([
      db
        .select({ day: sql<string>`DATE(${users.createdAt})`, total: count() })
        .from(users)
        .where(and(gte(users.createdAt, since), isNull(users.deletedAt)))
        .groupBy(sql`DATE(${users.createdAt})`)
        .orderBy(sql`DATE(${users.createdAt})`),
      db
        .select({ day: sql<string>`DATE(${orders.createdAt})`, total: count() })
        .from(orders)
        .where(and(gte(orders.createdAt, since), isNull(orders.deletedAt)))
        .groupBy(sql`DATE(${orders.createdAt})`)
        .orderBy(sql`DATE(${orders.createdAt})`),
      db
        .select({
          day: sql<string>`DATE(${orders.createdAt})`,
          revenue: sql<number>`COALESCE(SUM(${orders.totalCents}), 0)`,
        })
        .from(orders)
        .where(and(
          gte(orders.createdAt, since),
          isNull(orders.deletedAt),
          inArray(orders.paymentStatus, ["paid", "partially_refunded"]),
        ))
        .groupBy(sql`DATE(${orders.createdAt})`)
        .orderBy(sql`DATE(${orders.createdAt})`),
    ]);

    return {
      orders: orderStats,
      customers: Number(customerCount[0]?.total ?? 0),
      openTickets: Number(openTickets[0]?.total ?? 0),
      pendingReviews: Number(pendingReviews[0]?.total ?? 0),
      newMessages: Number(newMessages[0]?.total ?? 0),
      signupTrend: signupTrend.map((row) => ({ day: row.day, total: Number(row.total) })),
      orderTrend: orderTrend.map((row) => ({ day: row.day, total: Number(row.total) })),
      revenueTrend: revenueTrend.map((row) => ({ day: row.day, revenueCents: Number(row.revenue) })),
    };
  }),

  /* ---------------------------------------------------------------- */
  /* Orders                                                            */
  /* ---------------------------------------------------------------- */

  orders: staffProcedure
    .input(
      z
        .object({
          status: z.preprocess(
            (value) => (value === "" || value === "all" || value == null ? undefined : value),
            z.enum(ORDER_STATUSES).optional(),
          ),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions = [isNull(orders.deletedAt)];
      if (input?.status) conditions.push(eq(orders.status, input.status));

      const rows = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          userId: orders.userId,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          totalCents: orders.totalCents,
          bundleApplied: orders.bundleApplied,
          completionPercent: orders.completionPercent,
          createdAt: orders.createdAt,
          dueAt: orders.dueAt,
          projectNameEnc: orders.projectNameEnc,
        })
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      const customerNames = new Map<number, string>();
      for (const userId of new Set(rows.map((row) => row.userId))) {
        const user = await getUserById(userId);
        customerNames.set(userId, user ? displayNameOf(user) : "Deleted customer");
      }

      return rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        customer: customerNames.get(row.userId) ?? "Unknown",
        userId: row.userId,
        status: row.status,
        paymentStatus: row.paymentStatus,
        totalCents: row.totalCents,
        bundleApplied: row.bundleApplied,
        completionPercent: row.completionPercent,
        projectName: decryptField(row.projectNameEnc, `order:${row.id}`),
        createdAt: row.createdAt,
        dueAt: row.dueAt,
      }));
    }),

  /** Create an order on behalf of a customer (admin/staff initiated). */
  createOrderForCustomer: staffProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        selections: z
          .array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).default(1) }))
          .min(1),
        projectName: z.string().trim().max(200).optional(),
        integrityChoice: z.string().trim().max(60).optional(),
        canonVersion: z.string().trim().max(128).optional(),
        runMode: z.string().trim().max(32).optional(),
        releaseStatus: z.string().trim().max(128).optional(),
        orderScopeMode: z.string().trim().max(64).optional(),
        bundleScopeManifest: z.string().max(10000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createOrder({
          userId: input.userId,
          selections: input.selections,
          projectName: input.projectName ?? null,
          integrityChoice: input.integrityChoice ?? null,
          canonVersion: input.canonVersion ?? null,
          runMode: input.runMode ?? null,
          releaseStatus: input.releaseStatus ?? null,
          orderScopeMode: input.orderScopeMode ?? null,
          bundleScopeManifest: input.bundleScopeManifest ?? null,
          actorUserId: ctx.session.user.id,
          actorRole: ctx.session.user.role,
          ipAddress: ctx.clientIp,
        });
        void recordActivity({
          actorUserId: ctx.session.user.id,
          actorRole: ctx.session.user.role,
          action: "order.admin_created",
          entityType: "order",
          entityId: result.orderId,
          summary: `Admin created order ${result.orderNumber} for user ${input.userId}`,
          ipAddress: ctx.clientIp,
        });
        return result;
      } catch (error) {
        toTrpcError(error);
      }
    }),

  orderDetail: staffProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const rows = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      const order = rows[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });

      const customer = await getUserById(order.userId);
      const notes = await db
        .select()
        .from(orderNotes)
        .where(eq(orderNotes.orderId, input.orderId))
        .orderBy(desc(orderNotes.createdAt));
      const questions = await db
        .select()
        .from(orderQuestions)
        .where(eq(orderQuestions.orderId, input.orderId))
        .orderBy(asc(orderQuestions.sortOrder));
      const attachments = await db
        .select({
          id: files.id,
          originalName: files.originalName,
          sizeBytes: files.sizeBytes,
          category: files.category,
          visibleToCustomer: files.visibleToCustomer,
          isPlaceholder: files.isPlaceholder,
          version: files.version,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(and(eq(files.orderId, input.orderId), isNull(files.deletedAt)))
        .orderBy(desc(files.createdAt));

      const lineItems = await db
        .select({ productId: orderItems.productId, quantity: orderItems.quantity, productName: products.name })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, input.orderId));

      const submission = await db
        .select()
        .from(intakeSubmissions)
        .where(eq(intakeSubmissions.orderId, input.orderId))
        .limit(1);
      let intake: Record<string, string | null> | null = null;
      if (submission[0]) {
        const answers = await db
          .select()
          .from(intakeAnswers)
          .where(eq(intakeAnswers.submissionId, submission[0].id));
        intake = Object.fromEntries(
          answers.map((row) => [
            row.questionKey,
            decryptField(row.answerEnc, `intake:${submission[0]!.id}:${row.questionKey}`),
          ]),
        );
      }

      return {
        order: {
          ...order,
          projectName: decryptField(order.projectNameEnc, `order:${order.id}`),
          internalNotesText: decryptField(order.internalNotesEnc, `order_internal:${order.id}`),
        },
        customer: customer
          ? {
              id: customer.id,
              name: displayNameOf(customer),
              email: customer.email,
              company: customer.company,
              phone: customer.phone,
              customerNumber: customer.customerNumber,
            }
          : null,
        notes: notes.map((note) => ({
          id: note.id,
          body: decryptField(note.bodyEnc, `order_note:${note.id}`) ?? "",
          visibility: note.visibility,
          createdAt: note.createdAt,
        })),
        questions: questions.map((question) => ({
          id: question.id,
          question: decryptField(question.questionEnc, `order_question:${question.id}`) ?? "",
          required: question.required,
          status: question.status,
        })),
        attachments,
        lineItems,
        intakeSubmission: submission[0]
          ? {
              status: submission[0].status,
              submittedAt: submission[0].submittedAt,
              desiredOutcomes: submission[0].desiredOutcomes,
              integrityChoice: submission[0].integrityChoice,
              answers: intake,
            }
          : null,
      };
    }),

  transitionOrder: staffProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        to: z.enum(ORDER_STATUSES),
        reason: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await transitionOrder({
          orderId: input.orderId,
          to: input.to,
          actorUserId: ctx.session.user.id,
          actorRole: ctx.session.user.role,
          reason: input.reason,
          ipAddress: ctx.clientIp,
        });
      } catch (error) {
        toTrpcError(error);
      }
    }),

  updateOrder: staffProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        completionPercent: z.number().int().min(0).max(100).optional(),
        dueAt: z.string().datetime().nullable().optional(),
        internalNotes: z.string().max(20_000).nullable().optional(),
        paymentStatus: z
          .enum(["unpaid", "awaiting_invoice", "processing", "paid", "partially_refunded", "refunded", "failed"])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Partial<typeof orders.$inferInsert> = {};
      if (input.completionPercent !== undefined) patch.completionPercent = input.completionPercent;
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
      if (input.paymentStatus !== undefined) patch.paymentStatus = input.paymentStatus;
      if (input.internalNotes !== undefined) {
        patch.internalNotesEnc = encryptField(
          input.internalNotes,
          `order_internal:${input.orderId}`,
        );
      }
      if (Object.keys(patch).length === 0) return { ok: true as const };

      await db.update(orders).set(patch).where(eq(orders.id, input.orderId));
      if (input.paymentStatus !== undefined) {
        await applyOrderAutomationRules(input.orderId, "payment_status", input.paymentStatus);
      }
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "order.update",
        entityType: "order",
        entityId: input.orderId,
        summary: "Staff updated order details",
        changes: { fields: Object.keys(patch) },
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  addOrderNote: staffProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        body: z.string().trim().min(1).max(10_000),
        visibility: z.enum(["internal", "shared"]).default("internal"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inserted = await db.insert(orderNotes).values({
        orderId: input.orderId,
        authorUserId: ctx.session.user.id,
        bodyEnc: encryptField(input.body, "order_note:pending") ?? "",
        visibility: input.visibility,
      });
      const noteId = insertedId(inserted);
      await db
        .update(orderNotes)
        .set({ bodyEnc: encryptField(input.body, `order_note:${noteId}`) ?? "" })
        .where(eq(orderNotes.id, noteId));
      return { ok: true as const, noteId };
    }),

  addOrderQuestion: staffProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        question: z.string().trim().min(5).max(2000),
        required: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inserted = await db.insert(orderQuestions).values({
        orderId: input.orderId,
        askedByUserId: ctx.session.user.id,
        questionEnc: encryptField(input.question, "order_question:pending") ?? "",
        required: input.required,
      });
      const questionId = insertedId(inserted);
      await db
        .update(orderQuestions)
        .set({
          questionEnc: encryptField(input.question, `order_question:${questionId}`) ?? "",
        })
        .where(eq(orderQuestions.id, questionId));

      const orderRow = await db
        .select({ userId: orders.userId, orderNumber: orders.orderNumber })
        .from(orders)
        .where(eq(orders.id, input.orderId))
        .limit(1);
      if (orderRow[0]) {
        const customer = await getUserById(orderRow[0].userId);
        if (customer) {
          await queueTemplatedEmail({
            to: customer.email,
            templateKey: "order_question_raised",
            variables: {
              name: displayNameOf(customer),
              orderNumber: orderRow[0].orderNumber,
            },
            fallback: {
              subject: "A question about your ReadyPackets order {{orderNumber}}",
              html: wrapHtmlBody(
                "We have a question",
                `<p style="margin:0 0 12px 0;">Hello {{name}}, our analysts have raised a clarification question on order {{orderNumber}}.</p>
                 <p style="margin:0;">Sign in to your portal to answer it; the work continues as soon as we hear from you.</p>`,
              ),
            },
          });
        }
      }

      return { ok: true as const, questionId };
    }),

  /* Phase 1 question template bank and administrator answer workflow. */
  questionTemplates: staffProcedure
    .input(z.object({ phase: z.string().trim().max(16).optional(), includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      const conditions = [] as ReturnType<typeof eq>[];
      if (input?.phase) conditions.push(eq(orderQuestionTemplates.phase, input.phase));
      if (!input?.includeInactive) conditions.push(eq(orderQuestionTemplates.isActive, true));
      return db.select().from(orderQuestionTemplates).where(conditions.length ? and(...conditions) : undefined).orderBy(orderQuestionTemplates.sortOrder, orderQuestionTemplates.id);
    }),

  upsertQuestionTemplate: staffProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(2).max(190),
      question: z.string().trim().min(5).max(2_000),
      phase: z.enum(["phase_1", "phase_2"]).default("phase_1"),
      required: z.boolean().default(true),
      sortOrder: z.number().int().min(0).default(0),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const values = { name: input.name, question: input.question, phase: input.phase, required: input.required, sortOrder: input.sortOrder, isActive: input.isActive };
      if (input.id) { await db.update(orderQuestionTemplates).set(values).where(eq(orderQuestionTemplates.id, input.id)); return { id: input.id }; }
      const result = await db.insert(orderQuestionTemplates).values({ ...values, createdByUserId: ctx.session.user.id });
      return { id: insertedId(result) };
    }),

  applyQuestionTemplate: staffProcedure
    .input(z.object({ orderId: z.number().int().positive(), templateId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const template = (await db.select().from(orderQuestionTemplates).where(and(eq(orderQuestionTemplates.id, input.templateId), eq(orderQuestionTemplates.isActive, true))).limit(1))[0];
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Question template not found." });
      const inserted = await db.insert(orderQuestions).values({ orderId: input.orderId, askedByUserId: ctx.session.user.id, questionEnc: encryptField(template.question, "order_question:pending") ?? "", required: template.required, sortOrder: template.sortOrder });
      const questionId = insertedId(inserted);
      await db.update(orderQuestions).set({ questionEnc: encryptField(template.question, `order_question:${questionId}`) ?? "" }).where(eq(orderQuestions.id, questionId));
      return { ok: true as const, questionId };
    }),

  answerOrderQuestionAsAdmin: staffProcedure
    .input(z.object({ questionId: z.number().int().positive(), body: z.string().trim().min(1).max(10_000) }))
    .mutation(async ({ ctx, input }) => {
      const question = (await db.select({ id: orderQuestions.id, orderId: orderQuestions.orderId }).from(orderQuestions).where(eq(orderQuestions.id, input.questionId)).limit(1))[0];
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found." });
      const existing = (await db.select().from(orderAnswers).where(eq(orderAnswers.questionId, input.questionId)).limit(1))[0];
      if (existing) {
        await db.insert(orderAnswerHistory).values({ answerId: existing.id, previousAnswerEnc: existing.answerEnc, version: existing.version, changedByUserId: ctx.session.user.id });
        await db.update(orderAnswers).set({ answerEnc: encryptField(input.body, `order_answer:${existing.id}`) ?? "", version: existing.version + 1, answeredByUserId: ctx.session.user.id }).where(eq(orderAnswers.id, existing.id));
      } else {
        const result = await db.insert(orderAnswers).values({ questionId: input.questionId, orderId: question.orderId, answeredByUserId: ctx.session.user.id, answerEnc: encryptField(input.body, "order_answer:pending") ?? "" });
        const answerId = insertedId(result);
        await db.update(orderAnswers).set({ answerEnc: encryptField(input.body, `order_answer:${answerId}`) ?? "" }).where(eq(orderAnswers.id, answerId));
      }
      await db.update(orderQuestions).set({ status: "answered" }).where(eq(orderQuestions.id, input.questionId));
      return { ok: true as const };
    }),

  bulkSoftDeleteOrders: adminProcedure
    .input(z.object({ orderIds: z.array(z.number().int().positive()).min(1).max(200), confirmation: z.literal("MOVE_TO_TRASH") }))
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.orderIds)];
      const now = new Date();
      await db.update(orders).set({ deletedAt: now }).where(inArray(orders.id, ids));
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "order.bulk_soft_delete", entityType: "order", entityId: 0, severity: "warning", summary: `Administrator moved ${ids.length} order(s) to trash`, ipAddress: ctx.clientIp });
      return { ok: true as const, count: ids.length };
    }),

  softDeleteOrder: adminProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        reason: z.string().trim().min(5).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(orders)
        .set({ deletedAt: new Date() })
        .where(eq(orders.id, input.orderId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "order.soft_delete",
        entityType: "order",
        entityId: input.orderId,
        severity: "warning",
        summary: `Order soft-deleted: ${input.reason}`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Customers                                                         */
  /* ---------------------------------------------------------------- */

  customers: staffProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(190).optional(),
          role: z.preprocess(
            (value) => (value === "" || value === "all" || value == null ? undefined : value),
            z.enum(USER_ROLES).optional(),
          ),
          status: z.preprocess(
            (value) => (value === "" || value === "all" || value == null ? undefined : value),
            z.string().trim().max(24).optional(),
          ),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const list = input?.search
        ? await searchUsers(input.search, input.limit ?? 50)
        : await listUsers({
            role: input?.role,
            status: input?.status,
            limit: input?.limit ?? 50,
            offset: input?.offset ?? 0,
          });

      return list.map((user) => ({
        id: user.id,
        name: displayNameOf(user),
        email: user.email,
        company: user.company,
        phone: user.phone,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        mfaEnabled: user.mfaEnabled,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      }));
    }),

  customerDetail: staffProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const rows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      const user = decryptUser(row);

      const orderRows = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          totalCents: orders.totalCents,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(and(eq(orders.userId, input.userId), isNull(orders.deletedAt)))
        .orderBy(desc(orders.createdAt));

      const ticketRows = await db
        .select({
          id: tickets.id,
          ticketNumber: tickets.ticketNumber,
          status: tickets.status,
          createdAt: tickets.createdAt,
        })
        .from(tickets)
        .where(eq(tickets.userId, input.userId))
        .orderBy(desc(tickets.createdAt));

      return {
        user: {
          id: user.id,
          name: displayNameOf(user),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          company: user.company,
          phone: user.phone,
          address: user.address,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
          mfaEnabled: user.mfaEnabled,
          loginMethod: user.loginMethod,
          timezone: user.timezone,
          notes: user.notes,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        },
        orders: orderRows,
        tickets: ticketRows,
        lifetimeValueCents: orderRows.reduce((sum, order) => sum + order.totalCents, 0),
      };
    }),

  setCustomerNotes: staffProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        notes: z.string().max(20_000).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await setAdminNotes(input.userId, input.notes);
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "customer.notes_updated",
        entityType: "user",
        entityId: input.userId,
        summary: "Staff updated internal customer notes",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  setCustomerStatus: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        status: z.enum(["active", "suspended", "deactivated"]),
        reason: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change the status of your own account.",
        });
      }
      await setUserStatus(input.userId, input.status);
      if (input.status !== "active") {
        await revokeAllUserSessions(input.userId, `status_${input.status}`);
      }
      void recordSecurityEvent({
        eventType: "settings.changed",
        severity: "notice",
        message: `Account status set to ${input.status}`,
        userId: input.userId,
        ipAddress: ctx.clientIp,
        metadata: { actorUserId: ctx.session.user.id, reason: input.reason ?? null },
      });
      return { ok: true as const };
    }),

  setCustomerRole: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        role: z.enum(USER_ROLES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own role.",
        });
      }
      await setUserRole(input.userId, input.role);
      // A role change alters privileges, so existing sessions must not persist.
      await revokeAllUserSessions(input.userId, "role_changed");
      void recordSecurityEvent({
        eventType: "settings.changed",
        severity: "warning",
        message: `Account role changed to ${input.role}`,
        userId: input.userId,
        ipAddress: ctx.clientIp,
        metadata: { actorUserId: ctx.session.user.id },
      });
      return { ok: true as const };
    }),

  createStaffAccount: adminProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().max(254),
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80),
        role: z.enum(["staff", "admin"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // A random initial password with a forced change avoids emailing a usable secret.
      const temporary = `${randomToken(9)}Aa1!`;
      const user = await createUser({
        email: input.email,
        passwordHash: await hashPassword(temporary),
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        emailVerified: true,
        mustChangePassword: true,
      });

      void recordSecurityEvent({
        eventType: "settings.changed",
        severity: "warning",
        message: `New ${input.role} account created`,
        userId: user.id,
        ipAddress: ctx.clientIp,
        metadata: { actorUserId: ctx.session.user.id },
      });

      return { ok: true as const, userId: user.id, temporaryPassword: temporary };
    }),

  softDeleteCustomer: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account." });
      }
      await softDeleteUser(input.userId);
      await revokeAllUserSessions(input.userId, "account_deleted");
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "customer.soft_delete",
        entityType: "user",
        entityId: input.userId,
        severity: "warning",
        summary: "Administrator soft-deleted a customer account",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  forceCustomerOnboarding: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(users).set({ onboardingCompletedAt: null, onboardingForcedAt: new Date() }).where(eq(users.id, input.userId));
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "customer.force_onboarding", entityType: "user", entityId: input.userId, summary: "Administrator required customer to view onboarding again", ipAddress: ctx.clientIp });
      return { ok: true as const };
    }),

  forceAllCustomerOnboarding: adminProcedure.mutation(async ({ ctx }) => {
    const result = await db.update(users).set({ onboardingCompletedAt: null, onboardingForcedAt: new Date() }).where(and(eq(users.role, "customer"), eq(users.status, "active"), isNull(users.deletedAt)));
    const count = Number((result as { affectedRows?: number }).affectedRows ?? 0);
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "customer.force_onboarding_all", entityType: "user", entityId: 0, summary: `Administrator required ${count} customers to view onboarding again`, ipAddress: ctx.clientIp });
    return { ok: true as const, count };
  }),

  bulkSoftDeleteCustomers: adminProcedure
    .input(z.object({ userIds: z.array(z.number().int().positive()).min(1).max(200), confirmation: z.literal("MOVE_TO_TRASH") }))
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.userIds)].filter((id) => id !== ctx.session.user.id);
      if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot move your own account to trash." });
      for (const userId of ids) { await softDeleteUser(userId); await revokeAllUserSessions(userId, "account_deleted"); }
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "customer.bulk_soft_delete", entityType: "user", entityId: 0, severity: "warning", summary: `Administrator moved ${ids.length} customer account(s) to trash`, ipAddress: ctx.clientIp });
      return { ok: true as const, count: ids.length };
    }),

  restoreCustomer: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await restoreUser(input.userId);
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "customer.restore",
        entityType: "user",
        entityId: input.userId,
        summary: "Administrator restored a customer account",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Catalogue                                                         */
  /* ---------------------------------------------------------------- */

  catalog: staffProcedure.query(async () => getCatalog({ includeUnlisted: true })),

  upsertPacketGroup: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(96),
        groupNumber: z.number().int().min(1).max(99),
        name: z.string().trim().min(2).max(190),
        category: z.string().trim().min(2).max(120),
        summary: z.string().trim().max(2000).optional(),
        icon: z.string().trim().max(48).default("Layers"),
        listed: z.boolean().default(true),
        sortOrder: z.number().int().min(0).max(999).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        await db
          .update(packetGroups)
          .set({
            slug: input.slug,
            groupNumber: input.groupNumber,
            name: input.name,
            category: input.category,
            summary: input.summary ?? null,
            icon: input.icon,
            listed: input.listed,
            sortOrder: input.sortOrder,
          })
          .where(eq(packetGroups.id, input.id));
        void recordActivity({
          actorUserId: ctx.session.user.id,
          actorRole: "admin",
          action: "catalog.group_update",
          entityType: "packet_group",
          entityId: input.id,
          summary: `Packet group "${input.name}" updated`,
          ipAddress: ctx.clientIp,
        });
        return { ok: true as const, id: input.id };
      }

      const inserted = await db.insert(packetGroups).values({
        slug: input.slug,
        groupNumber: input.groupNumber,
        name: input.name,
        category: input.category,
        summary: input.summary ?? null,
        icon: input.icon,
        listed: input.listed,
        sortOrder: input.sortOrder,
      });
      const id = insertedId(inserted);
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "catalog.group_create",
        entityType: "packet_group",
        entityId: id,
        summary: `Packet group "${input.name}" created`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const, id };
    }),

  upsertProduct: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        packetGroupId: z.number().int().positive(),
        sku: z.string().trim().regex(/^[A-Za-z0-9._-]+$/).max(64),
        name: z.string().trim().min(2).max(190),
        tier: z.enum(PRODUCT_TIERS),
        /** Price in whole dollars; converted to integer cents for storage. */
        priceDollars: z.number().min(0).max(1_000_000).nullable(),
        customPricing: z.boolean().default(false),
        deliveryEstimate: z.string().trim().min(2).max(96),
        outcome: z.string().trim().max(4000).optional(),
        description: z.string().trim().max(8000).optional(),
        listed: z.boolean().default(true),
        active: z.boolean().default(true),
        sortOrder: z.number().int().min(0).max(999).default(0),
        features: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(255),
              detail: z.string().trim().max(2000).optional(),
              inheritedFromTier: z.string().trim().max(24).optional(),
            }),
          )
          .max(60)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const priceCents =
        input.priceDollars === null ? null : Math.round(input.priceDollars * 100);

      const payload = {
        packetGroupId: input.packetGroupId,
        sku: input.sku,
        name: input.name,
        tier: input.tier,
        priceCents,
        customPricing: input.customPricing || priceCents === null,
        deliveryEstimate: input.deliveryEstimate,
        outcome: input.outcome ?? null,
        description: input.description ?? null,
        listed: input.listed,
        active: input.active,
        sortOrder: input.sortOrder,
      };

      let productId = input.id ?? 0;
      if (input.id) {
        await db.update(products).set(payload).where(eq(products.id, input.id));
      } else {
        const inserted = await db.insert(products).values(payload);
        productId = insertedId(inserted);
      }

      if (input.features) {
        await db.delete(productFeatures).where(eq(productFeatures.productId, productId));
        if (input.features.length > 0) {
          await db.insert(productFeatures).values(
            input.features.map((feature, index) => ({
              productId,
              label: feature.label,
              detail: feature.detail ?? null,
              inheritedFromTier: feature.inheritedFromTier ?? null,
              sortOrder: index,
            })),
          );
        }
      }

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: input.id ? "catalog.product_update" : "catalog.product_create",
        entityType: "product",
        entityId: productId,
        summary: `Product "${input.name}" ${input.id ? "updated" : "created"}`,
        changes: { priceCents, listed: input.listed, active: input.active },
        ipAddress: ctx.clientIp,
      });

      return { ok: true as const, id: productId };
    }),

  setProductActive: adminProcedure
    .input(z.object({ productId: z.number().int().positive(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(products)
        .set({ active: input.active })
        .where(eq(products.id, input.productId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "catalog.product_toggle",
        entityType: "product",
        entityId: input.productId,
        summary: `Product ${input.active ? "activated" : "deactivated"}`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Moderation and content                                            */
  /* ---------------------------------------------------------------- */

  pendingReviews: staffProcedure.query(async () => {
    const rows = await db
      .select()
      .from(reviews)
      .where(sql`${reviews.status} IN ('pending','flagged')`)
      .orderBy(asc(reviews.createdAt));

    const names = new Map<number, string>();
    for (const userId of new Set(rows.map((row) => row.userId))) {
      const user = await getUserById(userId);
      names.set(userId, user ? displayNameOf(user) : "Unknown");
    }

    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      displayName: row.displayName,
      author: names.get(row.userId) ?? "Unknown",
      orderId: row.orderId,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }),

  moderateReview: staffProcedure
    .input(
      z.object({
        reviewId: z.number().int().positive(),
        decision: z.enum(["approved", "rejected", "flagged"]),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(reviews)
        .set({
          status: input.decision,
          moderatedByUserId: ctx.session.user.id,
          moderationNote: input.note ?? null,
          publishedAt: input.decision === "approved" ? new Date() : null,
        })
        .where(eq(reviews.id, input.reviewId));

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "review.moderate",
        entityType: "review",
        entityId: input.reviewId,
        summary: `Review ${input.decision}`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  moderateForumTopic: staffProcedure
    .input(
      z.object({
        topicId: z.number().int().positive(),
        action: z.enum(["pin", "unpin", "lock", "unlock", "delete", "restore"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Partial<typeof forumTopics.$inferInsert> = {};
      if (input.action === "pin") patch.pinned = true;
      if (input.action === "unpin") patch.pinned = false;
      if (input.action === "lock") patch.locked = true;
      if (input.action === "unlock") patch.locked = false;
      if (input.action === "delete") patch.deletedAt = new Date();
      if (input.action === "restore") patch.deletedAt = null;

      await db.update(forumTopics).set(patch).where(eq(forumTopics.id, input.topicId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "forum.moderate_topic",
        entityType: "forum_topic",
        entityId: input.topicId,
        summary: `Forum topic ${input.action}`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  deleteForumPost: staffProcedure
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(forumPosts)
        .set({ deletedAt: new Date() })
        .where(eq(forumPosts.id, input.postId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "forum.delete_post",
        entityType: "forum_post",
        entityId: input.postId,
        summary: "Forum reply removed by moderator",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  contactMessages: staffProcedure
    .input(
      z
        .object({
          status: z.enum(["new", "in_progress", "closed"]).optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions = input?.status ? [eq(contactMessages.status, input.status)] : [];
      const rows = await db
        .select()
        .from(contactMessages)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(contactMessages.createdAt))
        .limit(input?.limit ?? 50);

      return rows.map((row) => ({
        id: row.id,
        name: decryptField(row.nameEnc, "contact") ?? "",
        email: decryptField(row.emailEnc, "contact") ?? "",
        company: decryptField(row.companyEnc, "contact"),
        topic: row.topic,
        message: decryptField(row.messageEnc, "contact") ?? "",
        status: row.status,
        createdAt: row.createdAt,
      }));
    }),

  setContactStatus: staffProcedure
    .input(
      z.object({
        messageId: z.number().int().positive(),
        status: z.enum(["new", "in_progress", "closed"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(contactMessages)
        .set({ status: input.status, handledByUserId: ctx.session.user.id })
        .where(eq(contactMessages.id, input.messageId));
      return { ok: true as const };
    }),

  tickets: staffProcedure
    .input(
      z
        .object({
          status: z.string().trim().max(16).optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions = input?.status ? [eq(tickets.status, input.status)] : [];
      const rows = await db
        .select()
        .from(tickets)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(tickets.createdAt))
        .limit(input?.limit ?? 50);

      const names = new Map<number, string>();
      for (const userId of new Set(rows.map((row) => row.userId))) {
        const user = await getUserById(userId);
        names.set(userId, user ? displayNameOf(user) : "Unknown");
      }

      return rows.map((row) => ({
        id: row.id,
        ticketNumber: row.ticketNumber,
        subject: decryptField(row.subjectEnc, `ticket:${row.id}`) ?? "",
        customer: names.get(row.userId) ?? "Unknown",
        category: row.category,
        status: row.status,
        priority: row.priority,
        createdAt: row.createdAt,
        lastReplyAt: row.lastReplyAt,
      }));
    }),

  updateTicket: staffProcedure
    .input(
      z.object({
        ticketId: z.number().int().positive(),
        status: z.enum(["open", "pending", "answered", "resolved", "closed"]).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        assignedToUserId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const patch: Partial<typeof tickets.$inferInsert> = {};
      if (input.status) {
        patch.status = input.status;
        if (input.status === "resolved" || input.status === "closed") {
          patch.resolvedAt = new Date();
        }
      }
      if (input.priority) patch.priority = input.priority;
      if (input.assignedToUserId !== undefined) patch.assignedToUserId = input.assignedToUserId;
      if (Object.keys(patch).length === 0) return { ok: true as const };
      await db.update(tickets).set(patch).where(eq(tickets.id, input.ticketId));
      return { ok: true as const };
    }),

  addInternalTicketNote: staffProcedure
    .input(
      z.object({
        ticketId: z.number().int().positive(),
        body: z.string().trim().min(1).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inserted = await db.insert(ticketReplies).values({
        ticketId: input.ticketId,
        authorUserId: ctx.session.user.id,
        bodyEnc: encryptField(input.body, "ticket_reply:pending") ?? "",
        internalOnly: true,
      });
      const replyId = insertedId(inserted);
      await db
        .update(ticketReplies)
        .set({ bodyEnc: encryptField(input.body, `ticket_reply:${replyId}`) ?? "" })
        .where(eq(ticketReplies.id, replyId));
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Site content                                                      */
  /* ---------------------------------------------------------------- */

  homeContent: adminProcedure.query(async () =>
    db.select().from(homeContentBlocks).orderBy(asc(homeContentBlocks.sortOrder)),
  ),

  updateHomeBlock: adminProcedure
    .input(
      z.object({
        blockKey: z.string().trim().max(64),
        heading: z.string().trim().max(190).nullable().optional(),
        subheading: z.string().trim().max(255).nullable().optional(),
        body: z.string().max(8000).nullable().optional(),
        linkLabel: z.string().trim().max(96).nullable().optional(),
        linkHref: z.string().trim().max(255).nullable().optional(),
        enabled: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { blockKey, ...rest } = input;
      const patch = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(patch).length === 0) return { ok: true as const };
      await db
        .update(homeContentBlocks)
        .set(patch as Partial<typeof homeContentBlocks.$inferInsert>)
        .where(eq(homeContentBlocks.blockKey, blockKey));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "cms.update_block",
        entityType: "home_content_block",
        entityId: blockKey,
        summary: `Home content block "${blockKey}" updated`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  changelog: adminProcedure.query(async () =>
    db.select().from(changelogEntries).orderBy(desc(changelogEntries.releasedAt)),
  ),

  createChangelogEntry: adminProcedure
    .input(
      z.object({
        version: z.string().trim().min(1).max(32),
        title: z.string().trim().min(3).max(190),
        bodyMarkdown: z.string().trim().min(10).max(20_000),
        entryType: z.enum(["feature", "improvement", "fix", "security"]).default("improvement"),
        isPublic: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inserted = await db.insert(changelogEntries).values({
        version: input.version,
        title: input.title,
        bodyMarkdown: input.bodyMarkdown,
        entryType: input.entryType,
        isPublic: input.isPublic,
        createdByUserId: ctx.session.user.id,
      });
      return {
        ok: true as const,
        id: insertedId(inserted),
      };
    }),

  policies: adminProcedure.query(async () => {
    const documents = await db.select().from(policyDocuments).orderBy(asc(policyDocuments.id));
    const versions = await db
      .select()
      .from(policyVersions)
      .orderBy(desc(policyVersions.id));
    return documents.map((document) => ({
      ...document,
      versions: versions.filter((version) => version.policyId === document.id),
    }));
  }),

  publishPolicyVersion: adminProcedure
    .input(
      z.object({
        policyId: z.number().int().positive(),
        version: z.string().trim().min(1).max(24),
        effectiveDate: z.string().trim().min(4).max(32),
        bodyMarkdown: z.string().trim().min(50).max(200_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Publishing a new version supersedes the previous one atomically enough:
      // older versions stay readable for the acceptance audit trail.
      await db
        .update(policyVersions)
        .set({ published: false })
        .where(eq(policyVersions.policyId, input.policyId));
      const inserted = await db.insert(policyVersions).values({
        policyId: input.policyId,
        version: input.version,
        effectiveDate: input.effectiveDate,
        bodyMarkdown: input.bodyMarkdown,
        published: true,
        createdByUserId: ctx.session.user.id,
      });
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "policy.publish",
        entityType: "policy_version",
        entityId: insertedId(inserted),
        severity: "notice",
        summary: `Policy version ${input.version} published`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  emailTemplates: adminProcedure.query(async () =>
    db.select().from(emailTemplates).orderBy(asc(emailTemplates.templateKey)),
  ),

  updateEmailTemplate: adminProcedure
    .input(
      z.object({
        templateKey: z.string().trim().max(64),
        subject: z.string().trim().min(3).max(255),
        bodyHtml: z.string().trim().min(10).max(100_000),
        bodyText: z.string().max(50_000).nullable().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(emailTemplates)
        .set({
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          bodyText: input.bodyText ?? null,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        })
        .where(eq(emailTemplates.templateKey, input.templateKey));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "email.template_update",
        entityType: "email_template",
        entityId: input.templateKey,
        summary: `Email template "${input.templateKey}" updated`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  registrationFields: adminProcedure.query(async () =>
    db.select().from(registrationFields).orderBy(asc(registrationFields.sortOrder)),
  ),

  upsertRegistrationField: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        fieldKey: z.string().trim().regex(/^[a-z0-9_]+$/).max(64),
        label: z.string().trim().min(2).max(190),
        helpText: z.string().trim().max(255).optional(),
        fieldType: z.enum(["text", "textarea", "select", "checkbox", "tel", "url"]),
        options: z.array(z.string().trim().max(120)).max(40).optional(),
        required: z.boolean().default(false),
        enabled: z.boolean().default(true),
        sortOrder: z.number().int().min(0).max(999).default(0),
      }),
    )
    .mutation(async ({ input }) => {
      const payload = {
        fieldKey: input.fieldKey,
        label: input.label,
        helpText: input.helpText ?? null,
        fieldType: input.fieldType,
        options: input.options ?? null,
        required: input.required,
        enabled: input.enabled,
        sortOrder: input.sortOrder,
      };
      if (input.id) {
        await db.update(registrationFields).set(payload).where(eq(registrationFields.id, input.id));
        return { ok: true as const, id: input.id };
      }
      const inserted = await db.insert(registrationFields).values(payload);
      return {
        ok: true as const,
        id: insertedId(inserted),
      };
    }),

  /** CSV export of orders for finance reconciliation. */
  exportOrdersCsv: adminProcedure
    .input(
      z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [isNull(orders.deletedAt)];
      if (input?.from) conditions.push(gte(orders.createdAt, new Date(input.from)));
      if (input?.to) conditions.push(sql`${orders.createdAt} <= ${new Date(input.to)}`);

      const rows = await db
        .select({
          orderNumber: orders.orderNumber,
          userId: orders.userId,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          subtotalCents: orders.subtotalCents,
          discountCents: orders.discountCents,
          totalCents: orders.totalCents,
          bundleApplied: orders.bundleApplied,
          createdAt: orders.createdAt,
          deliveredAt: orders.deliveredAt,
        })
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(10_000);

      const header = [
        "order_number",
        "customer_id",
        "status",
        "payment_status",
        "subtotal_usd",
        "discount_usd",
        "total_usd",
        "bundle_applied",
        "created_at",
        "delivered_at",
      ].join(",");

      const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const lines = rows.map((row) =>
        [
          escape(row.orderNumber),
          row.userId,
          escape(row.status),
          escape(row.paymentStatus),
          (row.subtotalCents / 100).toFixed(2),
          (row.discountCents / 100).toFixed(2),
          (row.totalCents / 100).toFixed(2),
          row.bundleApplied ? "yes" : "no",
          escape(row.createdAt.toISOString()),
          escape(row.deliveredAt?.toISOString() ?? ""),
        ].join(","),
      );

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "orders.export_csv",
        severity: "notice",
        summary: `Exported ${rows.length} orders to CSV`,
        ipAddress: ctx.clientIp,
      });

      return { filename: `readypackets-orders-${Date.now()}.csv`, csv: [header, ...lines].join("\n") };
    }),

  /** Directory of staff accounts, for ticket assignment menus. */
  staffDirectory: staffProcedure.query(async () => {
    const rows = await db
      .select()
      .from(users)
      .where(and(sql`${users.role} IN ('admin','staff')`, isNull(users.deletedAt)));
    return rows.map((row) => {
      const user = decryptUser(row);
      return { id: user.id, name: displayNameOf(user), role: user.role };
    });
  }),

  searchCustomerByEmail: staffProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email() }))
    .query(async ({ input }) => {
      const found = await searchUsers(input.email, 1);
      const user = found[0];
      return user ? { id: user.id, name: displayNameOf(user), email: user.email } : null;
    }),

  /**
   * Admin: manually generate a new temporary password for a customer.
   * The user's sessions are revoked and mustChangePassword is set.
   */
  adminResetPassword: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      const temporary = `${randomToken(9)}Aa1!`;
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(temporary), mustChangePassword: true })
        .where(eq(users.id, input.userId));
      await revokeAllUserSessions(input.userId, "admin_password_reset");
      void recordSecurityEvent({
        eventType: "settings.changed",
        severity: "warning",
        message: `Admin manually reset password for user ${input.userId}`,
        userId: ctx.session.user.id,
        ipAddress: ctx.clientIp,
        metadata: { targetUserId: input.userId },
      });
      return { ok: true as const, temporaryPassword: temporary };
    }),

  /**
   * Admin: send a password-reset link to the user's email address.
   */
  adminSendPasswordResetLink: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      if (user.loginMethod !== "local") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User does not use password login." });
      }
      const { env } = await import("../config/env.js");
      const { hashToken } = await import("../security/crypto.js");
      const { passwordResetTokens } = await import("../db/schema.js");
      const token = randomToken(32);
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        requestIp: ctx.clientIp.slice(0, 64),
      });
      const { env: envCfg } = await import("../config/env.js");
      const link = `${envCfg.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await queueTemplatedEmail({
        to: user.email,
        templateKey: "password_reset",
        variables: { name: displayNameOf(user), link, expiry: "24 hours" },
        fallback: {
          subject: "Reset your ReadyPackets password",
          html: wrapHtmlBody(
            "Reset your password",
            `<h1 style="margin:0 0 12px 0;font-size:20px;">Password reset requested</h1>
             <p style="margin:0 0 12px 0;">Hello ${displayNameOf(user)}, an administrator has initiated a password reset for your account.</p>
             <a href="${link}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">Choose a new password</a>
             <p style="margin:12px 0 0;font-size:13px;">This link expires in 24 hours and can be used once.</p>`,
          ),
          text: `Reset your password: ${link}`,
        },
      });
      void recordSecurityEvent({
        eventType: "settings.changed",
        severity: "notice",
        message: `Admin sent password reset link to user ${input.userId}`,
        userId: ctx.session.user.id,
        ipAddress: ctx.clientIp,
        metadata: { targetUserId: input.userId },
      });
      return { ok: true as const };
    }),

  /** Manually mark a customer's email as verified (bypasses the email link). */
  adminVerifyEmail: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, input.userId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "customer.verify_email",
        entityType: "user",
        entityId: input.userId,
        summary: "Administrator manually verified customer email address",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /** Validate an account for access: activate it and mark its email address verified. */
  adminValidateAccount: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(users)
        .set({ emailVerified: true, status: "active", lockedUntil: null, failedLoginCount: 0 })
        .where(eq(users.id, input.userId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "customer.account_validated",
        entityType: "user",
        entityId: input.userId,
        summary: "Administrator validated the customer account and email address",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ---------------------------------------------------------------- */
  /* Configurable order automation                                     */
  /* ---------------------------------------------------------------- */

  orderAutomationRules: adminProcedure.query(async () =>
    db.select().from(orderAutomationRules).orderBy(orderAutomationRules.sortOrder, orderAutomationRules.id),
  ),

  upsertOrderAutomationRule: adminProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(2).max(190),
      triggerType: z.enum(["order_status", "payment_status", "intake_submitted", "phase_started"]),
      triggerValue: z.string().trim().max(64).optional(),
      completionPercent: z.number().int().min(0).max(100),
      isActive: z.boolean().default(true),
      sortOrder: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const values = {
        name: input.name,
        triggerType: input.triggerType,
        triggerValue: input.triggerValue || null,
        actionType: "set_completion_percent",
        completionPercent: input.completionPercent,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      };
      if (input.id) {
        await db.update(orderAutomationRules).set(values).where(eq(orderAutomationRules.id, input.id));
        return { id: input.id };
      }
      const result = await db.insert(orderAutomationRules).values({ ...values, createdByUserId: ctx.session.user.id });
      return { id: insertedId(result) };
    }),

  deleteOrderAutomationRule: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.delete(orderAutomationRules).where(eq(orderAutomationRules.id, input.id));
      return { ok: true as const };
    }),

  /** Create a new policy document (slug + title). Versions are added via publishPolicyVersion. */
  createPolicyDocument: adminProcedure
    .input(
      z.object({
        slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only."),
        title: z.string().trim().min(1).max(190),
        requiresAcceptance: z.boolean().default(true),
        publicRoute: z.string().trim().max(96).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inserted = await db.insert(policyDocuments).values({
        slug: input.slug,
        title: input.title,
        requiresAcceptance: input.requiresAcceptance,
        publicRoute: input.publicRoute ?? null,
      });
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "policy.create",
        entityType: "policy_document",
        entityId: insertedId(inserted),
        summary: `Policy document "${input.title}" created`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const, id: insertedId(inserted) };
    }),

  /** Change whether customers must accept the currently published policy version. */
  updatePolicyRequirement: adminProcedure
    .input(z.object({ policyId: z.number().int().positive(), requiresAcceptance: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(policyDocuments)
        .set({ requiresAcceptance: input.requiresAcceptance })
        .where(eq(policyDocuments.id, input.policyId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "policy.requirement_updated",
        entityType: "policy_document",
        entityId: input.policyId,
        summary: input.requiresAcceptance
          ? "Administrator marked policy acceptance as required"
          : "Administrator marked policy acceptance as optional",
        changes: { requiresAcceptance: input.requiresAcceptance },
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /** List all policy acceptances for a user. */
  policyAcceptances: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: policyAcceptances.id,
          policyVersionId: policyAcceptances.policyVersionId,
          acceptedAt: policyAcceptances.acceptedAt,
          ipAddress: policyAcceptances.ipAddress,
          version: policyVersions.version,
          effectiveDate: policyVersions.effectiveDate,
          policyTitle: policyDocuments.title,
          policySlug: policyDocuments.slug,
        })
        .from(policyAcceptances)
        .innerJoin(policyVersions, eq(policyAcceptances.policyVersionId, policyVersions.id))
        .innerJoin(policyDocuments, eq(policyVersions.policyId, policyDocuments.id))
        .where(eq(policyAcceptances.userId, input.userId))
        .orderBy(desc(policyAcceptances.acceptedAt));
      return rows;
    }),

  /** Domain-level signup analytics; no addresses are exposed. */
  signupDomains: adminProcedure.query(async () => {
    const rows = await db
      .select({ domain: users.emailDomain, total: count() })
      .from(users)
      .where(and(isNull(users.deletedAt), like(users.emailDomain, "%.%")))
      .groupBy(users.emailDomain)
      .orderBy(desc(count()))
      .limit(25);
    return rows.map((row) => ({ domain: row.domain, total: Number(row.total) }));
  }),
});
