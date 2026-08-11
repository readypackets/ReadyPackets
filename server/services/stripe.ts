/**
 * Stripe payment service.
 *
 * Handles checkout session creation, webhook event processing, coupon
 * validation, and refund initiation. All Stripe calls are gated behind
 * env.stripe.enabled so the application is fully functional without
 * Stripe credentials configured.
 *
 * Schema alignment notes:
 *   payments.provider        = "stripe"
 *   payments.providerReference = Stripe checkout session ID (later updated to payment intent ID)
 *   payments.methodSummary   = last4 / card brand summary
 *   payments.receivedAt      = timestamp when payment succeeded
 *   coupons.redemptionCount  = incremented on success
 *   coupons.maxRedemptions   = checked before allowing use
 *   referrals.referrerUserId = the referring user
 *   referrals.orderId        = the order that earned the referral
 *   referrals.rewardCents    = commission amount
 *   refunds.requestedByUserId = 0 for system-initiated (webhook) refunds
 */
import Stripe from "stripe";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  coupons,
  orders,
  payments,
  referrals,
  refunds,
} from "../db/schema.js";
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";
import { recordActivity, recordSecurityEvent } from "../observability/audit.js";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.stripe.enabled || !env.stripe.secretKey) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.");
  }
  if (!_stripe) {
    _stripe = new Stripe(env.stripe.secretKey, {
      apiVersion: "2026-07-29.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Coupon validation
// ---------------------------------------------------------------------------

export interface CouponResult {
  valid: boolean;
  couponId?: number;
  code?: string;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  discountCents?: number;
  message?: string;
}

export async function validateCoupon(
  code: string,
  orderTotalCents: number
): Promise<CouponResult> {
  const now = new Date();
  const rows = await db
    .select()
    .from(coupons)
    .where(
      and(
        eq(coupons.code, code.toUpperCase().trim()),
        eq(coupons.active, true),
        sql`(${coupons.expiresAt} IS NULL OR ${coupons.expiresAt} > ${now})`,
        sql`(${coupons.maxRedemptions} IS NULL OR ${coupons.redemptionCount} < ${coupons.maxRedemptions})`
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return { valid: false, message: "Coupon code not found or has expired." };
  }

  const coupon = rows[0]!;

  let discountCents = 0;
  if (coupon.discountType === "percent") {
    discountCents = Math.round((orderTotalCents * coupon.discountValue) / 100);
  } else {
    // fixed amount in cents
    discountCents = Math.min(coupon.discountValue, orderTotalCents);
  }

  return {
    valid: true,
    couponId: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType as "percent" | "fixed",
    discountValue: coupon.discountValue,
    discountCents,
  };
}

// ---------------------------------------------------------------------------
// Checkout session creation
// ---------------------------------------------------------------------------

export interface CheckoutInput {
  orderId: number;
  orderNumber: string;
  userId: number;
  userEmail: string;
  lineItems: { name: string; amountCents: number; quantity: number }[];
  totalCents: number;
  couponCode?: string;
  referralCode?: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(input: CheckoutInput) {
  const stripe = getStripe();

  let stripeCouponId: string | undefined;
  let couponDiscountCents = 0;
  let appliedCouponId: number | undefined;

  if (input.couponCode) {
    const couponResult = await validateCoupon(input.couponCode, input.totalCents);
    if (couponResult.valid && couponResult.couponId) {
      appliedCouponId = couponResult.couponId;
      couponDiscountCents = couponResult.discountCents ?? 0;

      // Create or retrieve a Stripe coupon matching our internal one.
      const stripeCouponName = `RP-${input.couponCode}`;
      const existingCoupons = await stripe.coupons.list({ limit: 100 });
      const existing = existingCoupons.data.find((c) => c.name === stripeCouponName);

      if (existing) {
        stripeCouponId = existing.id;
      } else {
        const created = await stripe.coupons.create(
          couponResult.discountType === "percent"
            ? {
                name: stripeCouponName,
                percent_off: couponResult.discountValue!,
                duration: "once",
              }
            : {
                name: stripeCouponName,
                amount_off: couponResult.discountValue!,
                currency: "usd",
                duration: "once",
              }
        );
        stripeCouponId = created.id;
      }
    }
  }

  // Resolve referral code to a referrer user id.
  let referrerId: number | undefined;
  if (input.referralCode) {
    const refRows = await db
      .select()
      .from(referrals)
      .where(eq(referrals.code, input.referralCode.toUpperCase().trim()))
      .limit(1);
    if (refRows.length > 0) referrerId = refRows[0]!.referrerUserId;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.userEmail,
    line_items: input.lineItems.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: { name: item.name },
        unit_amount: item.amountCents,
      },
      quantity: item.quantity,
    })),
    discounts: stripeCouponId ? [{ coupon: stripeCouponId }] : undefined,
    metadata: {
      orderId: String(input.orderId),
      orderNumber: input.orderNumber,
      userId: String(input.userId),
      couponId: appliedCouponId ? String(appliedCouponId) : "",
      referrerId: referrerId ? String(referrerId) : "",
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    payment_intent_data: {
      metadata: {
        orderId: String(input.orderId),
        orderNumber: input.orderNumber,
      },
    },
  });

  // Record the pending payment using the generic schema.
  await db.insert(payments).values({
    orderId: input.orderId,
    provider: "stripe",
    providerReference: session.id,
    amountCents: input.totalCents - couponDiscountCents,
    status: "pending",
  });

  // Update the order payment status.
  await db
    .update(orders)
    .set({ paymentStatus: "processing" })
    .where(eq(orders.id, input.orderId));

  logger.info("stripe.checkout.created", {
    orderId: input.orderId,
    sessionId: session.id,
    amountCents: input.totalCents,
  });

  return { url: session.url!, sessionId: session.id };
}

// ---------------------------------------------------------------------------
// Webhook event processing
// ---------------------------------------------------------------------------

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string
): Promise<{ handled: boolean; eventType: string }> {
  if (!env.stripe.webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("stripe.webhook.signature_invalid", { error: msg });
    throw new Error(`Webhook signature verification failed: ${msg}`);
  }

  logger.info("stripe.webhook.received", { type: event.type, id: event.id });

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;
    default:
      return { handled: false, eventType: event.type };
  }

  return { handled: true, eventType: event.type };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId ? Number(session.metadata.orderId) : null;
  const couponId = session.metadata?.couponId ? Number(session.metadata.couponId) : null;
  const referrerId = session.metadata?.referrerId
    ? Number(session.metadata.referrerId)
    : null;

  if (!orderId) {
    logger.warn("stripe.checkout.completed.no_order_id", { sessionId: session.id });
    return;
  }

  const amountCents = session.amount_total ?? 0;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  // Update the payment record: set the payment intent reference and mark succeeded.
  await db
    .update(payments)
    .set({
      providerReference: paymentIntentId ?? session.id,
      amountCents,
      status: "succeeded",
      receivedAt: new Date(),
    })
    .where(
      and(eq(payments.orderId, orderId), eq(payments.providerReference, session.id))
    );

  // Mark the order as paid.
  await db
    .update(orders)
    .set({ paymentStatus: "paid" })
    .where(eq(orders.id, orderId));

  // Increment coupon redemption count.
  if (couponId) {
    await db
      .update(coupons)
      .set({ redemptionCount: sql`${coupons.redemptionCount} + 1` })
      .where(eq(coupons.id, couponId));
  }

  // Record referral commission (5% of amount).
  if (referrerId) {
    const commissionCents = Math.round(amountCents * 0.05);
    await db.insert(referrals).values({
      referrerUserId: referrerId,
      referredUserId: null,
      orderId,
      rewardCents: commissionCents,
      status: "pending",
      code: `AUTO-${orderId}`,
    });
  }

  await recordActivity({
    actorUserId: null,
    action: "payment.completed",
    entityType: "order",
    entityId: orderId,
    summary: `Payment completed for order ${orderId}: ${amountCents} cents`,
  });

  logger.info("stripe.checkout.completed", { orderId, amountCents });
}

async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const orderId = intent.metadata?.orderId ? Number(intent.metadata.orderId) : null;
  if (!orderId) return;

  await db
    .update(payments)
    .set({ status: "failed" })
    .where(
      and(eq(payments.orderId, orderId), eq(payments.providerReference, intent.id))
    );

  await db
    .update(orders)
    .set({ paymentStatus: "failed" })
    .where(eq(orders.id, orderId));

  await recordSecurityEvent({
    eventType: "encryption.failure",
    outcome: "failure",
    message: `Payment failed for order ${orderId}: ${intent.last_payment_error?.message ?? "unknown"}`,
    metadata: { orderId, intentId: intent.id },
  });

  logger.warn("stripe.payment.failed", { orderId, intentId: intent.id });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const orderId = charge.metadata?.orderId ? Number(charge.metadata.orderId) : null;
  if (!orderId) return;

  const refundedCents = charge.amount_refunded;
  const isFullRefund = charge.refunded;

  await db
    .update(orders)
    .set({ paymentStatus: isFullRefund ? "refunded" : "partially_refunded" })
    .where(eq(orders.id, orderId));

  await db.insert(refunds).values({
    orderId,
    paymentId: null,
    amountCents: refundedCents,
    reason: `Stripe webhook: charge ${charge.id}`,
    status: "completed",
    requestedByUserId: 0, // system-initiated
    processedAt: new Date(),
  });

  logger.info("stripe.charge.refunded", { orderId, refundedCents, isFullRefund });
}

// ---------------------------------------------------------------------------
// Admin: initiate refund
// ---------------------------------------------------------------------------

export async function initiateRefund(
  orderId: number,
  amountCents: number,
  reason: string,
  requestedByUserId: number
): Promise<{ refundId: string }> {
  const stripe = getStripe();

  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.orderId, orderId),
        eq(payments.provider, "stripe"),
        eq(payments.status, "succeeded")
      )
    )
    .orderBy(desc(payments.receivedAt))
    .limit(1);

  if (paymentRows.length === 0) {
    throw new Error("No successful Stripe payment found for this order.");
  }

  const payment = paymentRows[0]!;

  const refund = await stripe.refunds.create({
    payment_intent: payment.providerReference!,
    amount: amountCents,
    reason: "requested_by_customer",
    metadata: { orderId: String(orderId), reason },
  });

  await db.insert(refunds).values({
    orderId,
    paymentId: payment.id,
    amountCents,
    reason,
    status: refund.status === "succeeded" ? "completed" : "pending",
    requestedByUserId,
    processedAt: refund.status === "succeeded" ? new Date() : null,
  });

  logger.info("stripe.refund.initiated", { orderId, amountCents, refundId: refund.id });
  return { refundId: refund.id };
}

// ---------------------------------------------------------------------------
// Admin: list payments
// ---------------------------------------------------------------------------

export async function listPayments(page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  const rows = await db
    .select()
    .from(payments)
    .orderBy(desc(payments.receivedAt))
    .limit(pageSize)
    .offset(offset);

  const countResult = await db
    .select({ total: sql<number>`count(*)` })
    .from(payments);

  return { rows, total: Number(countResult[0]?.total ?? 0) };
}
