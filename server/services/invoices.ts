import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db/client.js";
import { couponRedemptions, invoices, orderItems, orders, payments, users } from "../db/schema.js";
import { decryptField } from "../security/crypto.js";
import { insertedId } from "../db/result.js";
import { button, queueEmail, wrapHtmlBody } from "./email.js";
import { env } from "../config/env.js";

export type InvoiceLine = { description: string; quantity: number; unitPriceCents: number; lineTotalCents: number };

export type ReadyPacketsInvoice = {
  id: number;
  invoiceNumber: string;
  orderId: number;
  orderNumber: string;
  issuedAt: Date;
  paidAt: Date | null;
  customer: { publicId: string; firstName: string | null; lastName: string | null; name: string; company: string | null };
  lines: InvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  discount: { code: string; amountCents: number } | null;
  totalCents: number;
  paymentReference: string | null;
  customerVisible: boolean;
  publishedAt: Date | null;
  emailQueuedAt: Date | null;
  brand: { companyName: string; logoPath: string; supportUrl: string };
};

export function invoiceNumberFor(invoiceId: number, issuedAt: Date): string {
  return `RP-INV-${issuedAt.getUTCFullYear()}-${String(invoiceId).padStart(6, "0")}`;
}

function customerName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "ReadyPackets customer";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function currency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Materializes a single invoice record for a paid order and returns only the
 * safe display data required by a branded browser-printable invoice.
 */
export async function getOrCreatePaidOrderInvoice(orderId: number): Promise<ReadyPacketsInvoice> {
  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      userId: orders.userId,
      subtotalCents: orders.subtotalCents,
      discountCents: orders.discountCents,
      totalCents: orders.totalCents,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
    .limit(1);
  const order = orderRows[0];
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
  if (!(["paid", "partially_refunded"] as string[]).includes(order.paymentStatus)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Invoices can only be generated after a payment has been confirmed." });
  }

  const [customerRows, items, existingInvoice, payment, coupon] = await Promise.all([
    db.select({ id: users.id, publicId: users.publicId, firstNameEnc: users.firstNameEnc, lastNameEnc: users.lastNameEnc, companyEnc: users.companyEnc }).from(users).where(eq(users.id, order.userId)).limit(1),
    db.select({ name: orderItems.name, tier: orderItems.tier, quantity: orderItems.quantity, unitPriceCents: orderItems.unitPriceCents, lineTotalCents: orderItems.lineTotalCents }).from(orderItems).where(eq(orderItems.orderId, orderId)),
    db.select().from(invoices).where(eq(invoices.orderId, orderId)).orderBy(desc(invoices.createdAt)).limit(1),
    db.select({ providerReference: payments.providerReference, receivedAt: payments.receivedAt }).from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, "succeeded"))).orderBy(desc(payments.receivedAt)).limit(1),
    db.select({ code: couponRedemptions.codeSnapshot, discountCents: couponRedemptions.discountCents }).from(couponRedemptions).where(eq(couponRedemptions.orderId, orderId)).limit(1),
  ]);
  const user = customerRows[0];
  if (!user?.publicId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The customer reference is unavailable for this order." });

  let invoice = existingInvoice[0];
  if (!invoice) {
    const issuedAt = new Date();
    const result = await db.insert(invoices).values({
      // The database auto-increment id is the authoritative invoice sequence.
      invoiceNumber: `RP-DRAFT-${orderId}-${issuedAt.getTime()}`,
      orderId,
      userId: order.userId,
      amountCents: order.totalCents,
      status: "paid",
      issuedAt,
      paidAt: payment[0]?.receivedAt ?? issuedAt,
      externalReference: payment[0]?.providerReference ?? null,
      customerVisible: true,
      publishedAt: issuedAt,
    });
    const id = insertedId(result);
    const invoiceNumber = invoiceNumberFor(id, issuedAt);
    await db.update(invoices).set({ invoiceNumber }).where(eq(invoices.id, id));
    invoice = (await db.select().from(invoices).where(eq(invoices.id, id)).limit(1))[0];
  }

  // Repair a draft record left by the legacy tuple-result extraction bug. This
  // is safe and idempotent because invoices.id is immutable and globally unique.
  if (invoice?.invoiceNumber.startsWith("RP-DRAFT-")) {
    const canonicalNumber = invoiceNumberFor(invoice.id, invoice.issuedAt ?? invoice.createdAt ?? new Date());
    await db.update(invoices).set({ invoiceNumber: canonicalNumber }).where(eq(invoices.id, invoice.id));
    invoice = { ...invoice, invoiceNumber: canonicalNumber };
  }
  if (!invoice) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invoice generation could not be completed." });

  const aad = `user:${user.id}`;
  const firstName = decryptField(user.firstNameEnc, aad);
  const lastName = decryptField(user.lastNameEnc, aad);
  const discount = coupon[0] ? { code: coupon[0].code, amountCents: coupon[0].discountCents } : null;
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId,
    orderNumber: order.orderNumber,
    issuedAt: invoice.issuedAt ?? invoice.createdAt,
    paidAt: invoice.paidAt,
    customer: {
      publicId: user.publicId,
      firstName,
      lastName,
      name: customerName(firstName, lastName),
      company: decryptField(user.companyEnc, aad) ?? null,
    },
    lines: items.map((item) => ({ description: `${item.name} — ${item.tier}`, quantity: item.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    discount,
    totalCents: order.totalCents,
    paymentReference: invoice.externalReference ?? payment[0]?.providerReference ?? null,
    customerVisible: invoice.customerVisible,
    publishedAt: invoice.publishedAt,
    emailQueuedAt: invoice.emailQueuedAt,
    brand: { companyName: "ReadyPackets", logoPath: "/brand/light/readypackets_light_document.png", supportUrl: "https://www.readypackets.com" },
  };
}

export async function setInvoiceCustomerVisibility(orderId: number, visible: boolean): Promise<ReadyPacketsInvoice> {
  const invoice = await getOrCreatePaidOrderInvoice(orderId);
  const now = new Date();
  await db.update(invoices).set({
    customerVisible: visible,
    publishedAt: visible ? (invoice.publishedAt ?? now) : invoice.publishedAt,
  }).where(eq(invoices.id, invoice.id));
  return { ...invoice, customerVisible: visible, publishedAt: visible ? (invoice.publishedAt ?? now) : invoice.publishedAt };
}

function invoiceEmailHtml(invoice: ReadyPacketsInvoice, portalHref: string): string {
  const itemRows = invoice.lines.map((line) => `<tr><td style="padding:9px 0;color:#102033;">${escapeHtml(line.description)} × ${line.quantity}</td><td style="padding:9px 0;text-align:right;color:#102033;">${currency(line.lineTotalCents)}</td></tr>`).join("");
  const discountRow = invoice.discountCents > 0
    ? `<tr><td style="padding:8px 0;color:#168b7d;">Discount${invoice.discount ? ` (${escapeHtml(invoice.discount.code)})` : ""}</td><td style="padding:8px 0;text-align:right;color:#168b7d;">−${currency(invoice.discountCents)}</td></tr>`
    : "";
  return wrapHtmlBody(
    `Invoice ${invoice.invoiceNumber}`,
    `<p style="margin:0 0 14px 0;">Hello ${escapeHtml(invoice.customer.name)},</p>
     <p style="margin:0 0 18px 0;">Your ReadyPackets invoice for order <strong>${escapeHtml(invoice.orderNumber)}</strong> is now available.</p>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #d7dee7;border-bottom:1px solid #d7dee7;">${itemRows}</table>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:14px;">
       <tr><td style="padding:8px 0;color:#566579;">Product total</td><td style="padding:8px 0;text-align:right;color:#102033;">${currency(invoice.subtotalCents)}</td></tr>
       ${discountRow}
       <tr><td style="padding:12px 0 0 0;border-top:2px solid #102033;font-weight:700;color:#102033;">Price paid</td><td style="padding:12px 0 0 0;border-top:2px solid #102033;text-align:right;font-weight:700;color:#102033;">${currency(invoice.totalCents)}</td></tr>
     </table>
     ${button("View and save invoice", portalHref)}
     <p style="margin:16px 0 0 0;color:#566579;font-size:13px;">Invoice number: ${escapeHtml(invoice.invoiceNumber)}. This email is a copy of your paid-order invoice.</p>`,
  );
}

export async function queueCustomerInvoiceEmail(orderId: number, queuedByUserId: number): Promise<ReadyPacketsInvoice> {
  const invoice = await getOrCreatePaidOrderInvoice(orderId);
  const [order] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
  const customerRows = await db.select({ id: users.id, emailEnc: users.emailEnc }).from(users).where(eq(users.id, order.userId)).limit(1);
  const customer = customerRows[0];
  const email = customer ? decryptField(customer.emailEnc, `user:${customer.id}`) : null;
  if (!email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The customer email address is unavailable for this invoice." });

  const portalHref = new URL(`/portal/orders/${invoice.orderId}/invoice`, env.appUrl).toString();
  await queueEmail({
    to: email,
    subject: `Your ReadyPackets invoice ${invoice.invoiceNumber}`,
    html: invoiceEmailHtml(invoice, portalHref),
    text: `Your ReadyPackets invoice ${invoice.invoiceNumber} for order ${invoice.orderNumber} is available. Product total: ${currency(invoice.subtotalCents)}. Discount: ${invoice.discountCents ? `${invoice.discount?.code ?? "applied discount"} −${currency(invoice.discountCents)}` : "none"}. Price paid: ${currency(invoice.totalCents)}. Sign in to your portal to view and save the invoice.`,
    templateKey: "paid_order_invoice",
  });
  const now = new Date();
  await db.update(invoices).set({ customerVisible: true, publishedAt: invoice.publishedAt ?? now, emailQueuedAt: now, emailQueuedByUserId: queuedByUserId }).where(eq(invoices.id, invoice.id));
  return { ...invoice, customerVisible: true, publishedAt: invoice.publishedAt ?? now, emailQueuedAt: now };
}
