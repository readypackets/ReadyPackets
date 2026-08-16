import { useParams } from "wouter";
import { FileText, Printer } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button, LinkButton } from "@/components/ui/Button";
import { Alert, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { PageHeader } from "@/components/layout/PortalLayout";
import { formatDate } from "@/lib/utils";
import { formatCents } from "@shared/domain";

export function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const validOrderId = Number.isInteger(orderId) && orderId > 0;
  const invoiceQuery = trpc.invoices.getForOrder.useQuery({ orderId }, { enabled: validOrderId });
  const invoice = invoiceQuery.data;
  const print = () => { window.print(); };

  if (!validOrderId) return <EmptyState icon={FileText} title="Invoice unavailable" description="The requested order reference is invalid." action={<LinkButton href="/portal/orders" variant="outline">Back to my orders</LinkButton>} />;
  if (invoiceQuery.isLoading) return <><PageHeader title="Order invoice" description="Loading your confirmed paid-order invoice." breadcrumb={{ href: `/portal/orders/${orderId}`, label: "Back to order" }} /><Skeleton className="h-[38rem] w-full" /></>;
  if (invoiceQuery.error || !invoice) return <><PageHeader title="Order invoice" description="View the branded receipt for a confirmed paid order." breadcrumb={{ href: `/portal/orders/${orderId}`, label: "Back to order" }} /><Card className="max-w-2xl"><CardHeader title="Invoice unavailable" description={invoiceQuery.error ? errorMessage(invoiceQuery.error) : "The invoice is not available for this order."} /><LinkButton className="mt-5" href={`/portal/orders/${orderId}`} variant="outline">Back to order</LinkButton></Card></>;

  return <>
    <PageHeader title="Order invoice" description="Your confirmed payment invoice is saved with this order." breadcrumb={{ href: `/portal/orders/${orderId}`, label: "Back to order" }} actions={<Button variant="outline" leadingIcon={<Printer className="size-4" />} onClick={print}>Print / save PDF</Button>} />
    <div className="mx-auto max-w-4xl print:max-w-none">
      <Alert tone="info" className="mb-5 print:hidden">This invoice is saved to your order. Use <strong>Print / save PDF</strong> to download a browser PDF copy.</Alert>
      <article className="invoice-paper rounded-xl border border-line bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-8 border-b-4 border-brand-gold pb-7">
          <div><img src={invoice.brand.logoPath} alt="ReadyPackets" className="h-14 w-auto" /><p className="mt-3 text-sm text-body">Business readiness, packaged with clarity.</p><a className="mt-1 block text-sm text-teal-dark" href={invoice.brand.supportUrl}>{invoice.brand.supportUrl}</a></div>
          <div className="text-right"><p className="text-3xl font-bold tracking-wide text-brand-navy">INVOICE</p><p className="mt-2 font-mono text-sm font-semibold text-brand-navy">{invoice.invoiceNumber}</p><p className="mt-1 text-sm text-body">Issued {formatDate(invoice.issuedAt)}</p><p className="mt-1 text-sm text-success">Payment confirmed{invoice.paidAt ? ` · ${formatDate(invoice.paidAt)}` : ""}</p></div>
        </header>
        <section className="mt-7 grid gap-6 sm:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Bill to</p><p className="mt-2 text-base font-semibold text-ink">{invoice.customer.firstName ?? ""} {invoice.customer.lastName ?? ""}</p>{invoice.customer.company ? <p className="text-sm text-body">{invoice.customer.company}</p> : null}<p className="mt-1 font-mono text-xs text-muted">Customer ID: {invoice.customer.publicId}</p></div>
          <div className="sm:text-right"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Order reference</p><p className="mt-2 font-mono text-base font-semibold text-ink">{invoice.orderNumber}</p>{invoice.paymentReference ? <p className="mt-1 text-xs text-muted">Payment reference: {invoice.paymentReference}</p> : null}</div>
        </section>
        <section className="mt-8 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-y border-brand-navy bg-brand-navy text-white"><th className="px-3 py-3">Product purchased</th><th className="px-3 py-3 text-right">Qty.</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">Product total</th></tr></thead><tbody className="divide-y divide-line">{invoice.lines.map((line: { description: string; quantity: number; unitPriceCents: number; lineTotalCents: number }, index: number) => <tr key={`${line.description}-${index}`}><td className="px-3 py-3 text-ink">{line.description}</td><td className="px-3 py-3 text-right text-body">{line.quantity}</td><td className="px-3 py-3 text-right text-body">{formatCents(line.unitPriceCents)}</td><td className="px-3 py-3 text-right font-medium text-ink">{formatCents(line.lineTotalCents)}</td></tr>)}</tbody></table></section>
        <section className="ml-auto mt-7 max-w-sm space-y-2 text-sm"><div className="flex justify-between"><span className="text-body">Product total</span><span>{formatCents(invoice.subtotalCents)}</span></div>{invoice.discountCents > 0 ? <div className="flex justify-between text-success"><span>Discount{invoice.discount?.code ? ` (${invoice.discount.code})` : ""}</span><span>−{formatCents(invoice.discountCents)}</span></div> : null}<div className="flex justify-between border-t-2 border-brand-navy pt-3 text-lg font-bold text-brand-navy"><span>Price paid</span><span>{formatCents(invoice.totalCents)}</span></div></section>
        <footer className="mt-10 border-t border-line pt-5 text-xs text-muted">Thank you for choosing ReadyPackets. This invoice documents a confirmed payment for the order reference above.</footer>
      </article>
    </div>
  </>;
}
