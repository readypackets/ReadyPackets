import { z } from "zod";
import { recordActivity } from "../observability/audit.js";
import { assertOrderAccess } from "../services/orders.js";
import { getOrCreatePaidOrderInvoice } from "../services/invoices.js";
import { protectedProcedure, router } from "../trpc/trpc.js";

export const invoicesRouter = router({
  getForOrder: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
      const invoice = await getOrCreatePaidOrderInvoice(input.orderId);
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "invoice.generated",
        entityType: "invoice",
        entityId: input.orderId,
        summary: `Generated paid-order invoice ${invoice.invoiceNumber} for ${invoice.orderNumber}`,
        changes: { invoiceNumber: invoice.invoiceNumber, orderNumber: invoice.orderNumber },
        ipAddress: ctx.clientIp,
      });
      return invoice;
    }),
});
