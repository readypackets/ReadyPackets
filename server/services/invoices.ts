import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db/client.js";
import { invoices, orderItems, orders, payments, users } from "../db/schema.js";
import { decryptField } from "../security/crypto.js";
import { insertedId } from "../db/result.js";

export type InvoiceLine = { description: string; quantity: number; unitPriceCents: number; lineTotalCents: number };

export type ReadyPacketsInvoice = {
  invoiceNumber: string;
  orderId: number;
  orderNumber: string;
  issuedAt: Date;
  paidAt: Date | null;
  customer: { publicId: string; name: string; company: string | null };
  lines: InvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentReference: string | null;
  brand: { companyName: string; logoPath: string; supportUrl: string };
};

export function invoiceNumberFor(invoiceId: number, issuedAt: Date): string {
  return `RP-INV-${issuedAt.getUTCFullYear()}-${String(invoiceId).padStart(6, "0")}`;
}

function customerName(row: { id: number; firstNameEnc: string | null; lastNameEnc: string | null }) {
  return [
    decryptField(row.firstNameEnc, `user:${row.id}:first_name`),
    decryptField(row.lastNameEnc, `user:${row.id}:last_name`),
  ].filter(Boolean).join(" ") || "ReadyPackets customer";
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

  const [customer, items, existingInvoice, payment] = await Promise.all([
    db.select({ id: users.id, publicId: users.publicId, firstNameEnc: users.firstNameEnc, lastNameEnc: users.lastNameEnc, companyEnc: users.companyEnc }).from(users).where(eq(users.id, order.userId)).limit(1),
    db.select({ name: orderItems.name, tier: orderItems.tier, quantity: orderItems.quantity, unitPriceCents: orderItems.unitPriceCents, lineTotalCents: orderItems.lineTotalCents }).from(orderItems).where(eq(orderItems.orderId, orderId)),
    db.select().from(invoices).where(eq(invoices.orderId, orderId)).orderBy(desc(invoices.createdAt)).limit(1),
    db.select({ providerReference: payments.providerReference, receivedAt: payments.receivedAt }).from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, "succeeded"))).orderBy(desc(payments.receivedAt)).limit(1),
  ]);
  const user = customer[0];
  if (!user?.publicId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The customer reference is unavailable for this order." });

  let invoice = existingInvoice[0];
  if (!invoice) {
    const issuedAt = new Date();
    const result = await db.insert(invoices).values({
      // The database auto-increment id is the authoritative invoice sequence.
      // A temporary unique value permits recovery if a process stops between the
      // insert and the canonical-number update.
      invoiceNumber: `RP-DRAFT-${orderId}-${issuedAt.getTime()}`,
      orderId,
      userId: order.userId,
      amountCents: order.totalCents,
      status: "paid",
      issuedAt,
      paidAt: payment[0]?.receivedAt ?? issuedAt,
      externalReference: payment[0]?.providerReference ?? null,
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

  return {
    invoiceNumber: invoice.invoiceNumber,
    orderId,
    orderNumber: order.orderNumber,
    issuedAt: invoice.issuedAt ?? invoice.createdAt,
    paidAt: invoice.paidAt,
    customer: {
      publicId: user.publicId,
      name: customerName(user),
      company: decryptField(user.companyEnc, `user:${user.id}:company`) ?? null,
    },
    lines: items.map((item) => ({ description: `${item.name} — ${item.tier}`, quantity: item.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    paymentReference: invoice.externalReference ?? payment[0]?.providerReference ?? null,
    brand: { companyName: "ReadyPackets", logoPath: "/brand/light/readypackets_light_document.png", supportUrl: "https://www.readypackets.com" },
  };
}
