/**
 * Stripe router — checkout, coupon validation, and admin finance operations.
 *
 * The webhook endpoint is registered as a raw Express route in app.ts
 * (before body-parser) so the raw buffer is available for signature verification.
 */
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  coupons,
  orders,
  orderItems,
  payouts,
  referrals,
  refunds,
} from "../db/schema.js";
import { env } from "../config/env.js";
import {
  createCheckoutSession,
  initiateRefund,
  listPayments,
  validateCoupon,
} from "../services/stripe.js";
import { protectedProcedure, adminProcedure, staffProcedure, router } from "../trpc/trpc.js";
import { getUserById } from "../db/users.js";
import { TRPCError } from "@trpc/server";

export const stripeRouter = router({
  // -------------------------------------------------------------------------
  // Customer: validate a coupon code before checkout
  // -------------------------------------------------------------------------
  validateCoupon: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1).max(48),
        orderTotalCents: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      return validateCoupon(input.code, input.orderTotalCents);
    }),

  // -------------------------------------------------------------------------
  // Customer: create a Stripe checkout session for an order
  // -------------------------------------------------------------------------
  createCheckout: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        couponCode: z.string().max(48).optional(),
        referralCode: z.string().max(48).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!env.stripe.enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Online payment is not currently enabled. Please contact support.",
        });
      }

      // Verify the order belongs to this user and is in a payable state.
      const orderRows = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.userId, ctx.session!.user.id)
          )
        )
        .limit(1);

      if (orderRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      }

      const order = orderRows[0]!;

      if (order.paymentStatus === "paid") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This order has already been paid.",
        });
      }

      if (order.paymentStatus === "processing") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A checkout session is already in progress for this order.",
        });
      }

      // Build line items from order items.
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, input.orderId));

      if (items.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Order has no items.",
        });
      }

      const lineItems = items.map((item) => ({
        name: item.name,
        amountCents: item.unitPriceCents,
        quantity: item.quantity,
      }));

      const result = await createCheckoutSession({
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: ctx.session!.user.id,
        userEmail: (await getUserById(ctx.session!.user.id))?.email ?? "",
        lineItems,
        totalCents: order.totalCents,
        couponCode: input.couponCode,
        referralCode: input.referralCode,
        successUrl: `${env.appUrl}/portal/orders/${order.id}?payment=success`,
        cancelUrl: `${env.appUrl}/portal/orders/${order.id}?payment=cancelled`,
      });

      return result;
    }),

  // -------------------------------------------------------------------------
  // Customer: check payment status for an order
  // -------------------------------------------------------------------------
  paymentStatus: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const orderRows = await db
        .select({ paymentStatus: orders.paymentStatus, totalCents: orders.totalCents })
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.userId, ctx.session!.user.id)
          )
        )
        .limit(1);

      if (orderRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      }

      return orderRows[0]!;
    }),

  // -------------------------------------------------------------------------
  // Admin: list all payments
  // -------------------------------------------------------------------------
  payments: staffProcedure
    .input(z.object({ page: z.number().int().min(1).default(1) }))
    .query(async ({ input }) => {
      return listPayments(input.page, 50);
    }),

  // -------------------------------------------------------------------------
  // Admin: list coupons
  // -------------------------------------------------------------------------
  coupons: staffProcedure.query(async () => {
    return db.select().from(coupons).orderBy(desc(coupons.createdAt));
  }),

  // -------------------------------------------------------------------------
  // Admin: create or update a coupon
  // -------------------------------------------------------------------------
  upsertCoupon: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        code: z.string().min(1).max(48).toUpperCase(),
        description: z.string().max(255).optional(),
        discountType: z.enum(["percent", "fixed"]),
        discountValue: z.number().int().positive(),
        maxRedemptions: z.number().int().positive().optional().nullable(),
        startsAt: z.string().datetime().optional().nullable(),
        expiresAt: z.string().datetime().optional().nullable(),
        active: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const data = {
        code: input.code,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        maxRedemptions: input.maxRedemptions ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        active: input.active,
      };

      if (input.id) {
        await db.update(coupons).set(data).where(eq(coupons.id, input.id));
        return { id: input.id };
      } else {
        const result = await db.insert(coupons).values({ ...data, redemptionCount: 0 });
        return { id: (result[0] as any).insertId as number };
      }
    }),

  // -------------------------------------------------------------------------
  // Admin: toggle coupon active state
  // -------------------------------------------------------------------------
  setCouponActive: adminProcedure
    .input(z.object({ id: z.number().int().positive(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.update(coupons).set({ active: input.active }).where(eq(coupons.id, input.id));
    }),

  // -------------------------------------------------------------------------
  // Admin: list referrals
  // -------------------------------------------------------------------------
  referrals: staffProcedure
    .input(z.object({ page: z.number().int().min(1).default(1) }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * 50;
      const rows = await db
        .select()
        .from(referrals)
        .orderBy(desc(referrals.createdAt))
        .limit(50)
        .offset(offset);

      const countResult = await db
        .select({ total: sql<number>`count(*)` })
        .from(referrals);

      return { rows, total: Number(countResult[0]?.total ?? 0) };
    }),

  // -------------------------------------------------------------------------
  // Admin: list payouts
  // -------------------------------------------------------------------------
  payouts: staffProcedure
    .input(z.object({ page: z.number().int().min(1).default(1) }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * 50;
      const rows = await db
        .select()
        .from(payouts)
        .orderBy(desc(payouts.createdAt))
        .limit(50)
        .offset(offset);

      const countResult = await db
        .select({ total: sql<number>`count(*)` })
        .from(payouts);

      return { rows, total: Number(countResult[0]?.total ?? 0) };
    }),

  // -------------------------------------------------------------------------
  // Admin: process a payout
  // -------------------------------------------------------------------------
  processPayout: adminProcedure
    .input(
      z.object({
        payoutId: z.number().int().positive(),
        status: z.enum(["completed", "rejected"]),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await db
        .update(payouts)
        .set({
          status: input.status,
          processedAt: new Date(),
        })
        .where(eq(payouts.id, input.payoutId));
    }),

  // -------------------------------------------------------------------------
  // Admin: list refunds
  // -------------------------------------------------------------------------
  refunds: staffProcedure
    .input(z.object({ page: z.number().int().min(1).default(1) }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * 50;
      const rows = await db
        .select()
        .from(refunds)
        .orderBy(desc(refunds.createdAt))
        .limit(50)
        .offset(offset);

      const countResult = await db
        .select({ total: sql<number>`count(*)` })
        .from(refunds);

      return { rows, total: Number(countResult[0]?.total ?? 0) };
    }),

  // -------------------------------------------------------------------------
  // Admin: initiate a Stripe refund
  // -------------------------------------------------------------------------
  initiateRefund: adminProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        amountCents: z.number().int().positive(),
        reason: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return initiateRefund(input.orderId, input.amountCents, input.reason, ctx.session!.user.id);
    }),

  // -------------------------------------------------------------------------
  // Admin: Stripe configuration status
  // -------------------------------------------------------------------------
  config: adminProcedure.query(() => {
    return {
      enabled: env.stripe.enabled,
      publishableKey: env.stripe.publishableKey ?? null,
      webhookConfigured: Boolean(env.stripe.webhookSecret),
    };
  }),
});
