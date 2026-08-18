import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { recordActivity } from "../observability/audit.js";
import { assertOrderAccess } from "../services/orders.js";
import { getOrCreatePaidOrderInvoice, queueCustomerInvoiceEmail, setInvoiceCustomerVisibility } from "../services/invoices.js";
import { issueInvoiceDownloadTicket } from "../services/invoiceDownloads.js";
import { adminProcedure, protectedProcedure, router } from "../trpc/trpc.js";

const orderIdInput = z.object({ orderId: z.number().int().positive() });

export const invoicesRouter = router({
  getForOrder: protectedProcedure
    .input(orderIdInput)
    .query(async ({ ctx, input }) => {
      await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
      const invoice = await getOrCreatePaidOrderInvoice(input.orderId);
      if (ctx.session.user.role === "customer" && !invoice.customerVisible) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This invoice is not currently available in the customer portal." });
      }
      return invoice;
    }),

  requestPdfDownload: protectedProcedure
    .input(orderIdInput)
    .mutation(async ({ ctx, input }) => {
      await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
      const invoice = await getOrCreatePaidOrderInvoice(input.orderId);
      if (ctx.session.user.role === "customer" && !invoice.customerVisible) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This invoice is not currently available in the customer portal." });
      }
      const ticket = issueInvoiceDownloadTicket(invoice.id, ctx.session.user.id);
      return { url: `/api/invoices/download/${ticket.token}`, expiresInSeconds: ticket.expiresInSeconds };
    }),

  setCustomerVisibility: adminProcedure
    .input(orderIdInput.extend({ visible: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await setInvoiceCustomerVisibility(input.orderId, input.visible);
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "invoice.customer_visibility",
        entityType: "invoice",
        entityId: invoice.id,
        summary: `Invoice ${invoice.invoiceNumber} ${input.visible ? "published to" : "hidden from"} the customer portal`,
        changes: { orderId: input.orderId, invoiceNumber: invoice.invoiceNumber, visible: input.visible },
        ipAddress: ctx.clientIp,
      });
      return invoice;
    }),

  sendCustomerCopy: adminProcedure
    .input(orderIdInput)
    .mutation(async ({ ctx, input }) => {
      const invoice = await queueCustomerInvoiceEmail(input.orderId, ctx.session.user.id);
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "invoice.customer_email_queued",
        entityType: "invoice",
        entityId: invoice.id,
        summary: `Queued customer invoice email for ${invoice.invoiceNumber}`,
        changes: { orderId: input.orderId, invoiceNumber: invoice.invoiceNumber },
        ipAddress: ctx.clientIp,
      });
      return invoice;
    }),
});
