import type { ReadyPacketsInvoice } from "./invoices.js";

/**
 * Small, dependency-free PDF renderer for paid-order invoices. The document is
 * generated on demand from the immutable invoice/order snapshot and never
 * stores customer payment data in a public path.
 */
function pdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(value) : "Not applicable";
}

function clip(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, Math.max(1, length - 1))}…`;
}

function text(font: "F1" | "F2", size: number, x: number, y: number, value: string, color = "0.063 0.125 0.200 rg"): string {
  return `${color}\nBT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET\n`;
}

function line(x1: number, y1: number, x2: number, y2: number, color = "0.75 0.79 0.84 RG", width = 0.8): string {
  return `${color}\n${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function rect(x: number, y: number, width: number, height: number, color: string): string {
  return `${color}\n${x} ${y} ${width} ${height} re f\n`;
}

/** Render a company-branded PDF invoice that is safe to email as an attachment. */
export function renderInvoicePdf(invoice: ReadyPacketsInvoice): Buffer {
  const navy = "0.063 0.125 0.200 rg";
  const teal = "0.035 0.545 0.494 rg";
  const gold = "0.796 0.608 0.204 rg";
  const muted = "0.329 0.396 0.475 rg";
  const white = "1 1 1 rg";
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const productValueCents = invoice.productValueCents;
  let y = 742;
  let content = "";

  content += rect(0, 735, pageWidth, 57, navy);
  content += rect(margin, 752, 20, 20, teal);
  content += rect(margin + 6, 758, 8, 8, gold);
  content += text("F2", 19, margin + 30, 757, invoice.brand.companyName || "ReadyPackets", white);
  content += text("F1", 8, margin + 30, 744, invoice.brand.address ?? "Business readiness, packaged with clarity.", "0.84 0.89 0.93 rg");
  content += text("F2", 20, 432, 758, "INVOICE", white);
  content += text("F1", 9, 432, 744, invoice.invoiceNumber, "0.84 0.89 0.93 rg");

  y = 707;
  content += text("F2", 10, margin, y, "BILL TO", muted);
  content += text("F2", 12, margin, y - 18, invoice.customer.name || "ReadyPackets customer", navy);
  if (invoice.customer.company) content += text("F1", 10, margin, y - 33, clip(invoice.customer.company, 48), muted);
  content += text("F1", 9, margin, y - 48, `Customer ID: ${invoice.customer.publicId}`, muted);

  content += text("F2", 10, 385, y, "ORDER REFERENCE", muted);
  content += text("F2", 11, 385, y - 18, invoice.orderNumber, navy);
  content += text("F1", 9, 385, y - 34, `Issued ${date(invoice.issuedAt)}`, muted);
  content += text("F1", 9, 385, y - 48, `Payment confirmed ${date(invoice.paidAt)}`, "0.035 0.42 0.31 rg");
  y = 630;
  content += line(margin, y, pageWidth - margin, y, "0.063 0.125 0.200 RG", 1.5);

  y -= 26;
  content += rect(margin, y - 14, pageWidth - margin * 2, 25, navy);
  content += text("F2", 9, margin + 8, y - 4, "PRODUCT PURCHASED", white);
  content += text("F2", 9, 384, y - 4, "QTY.", white);
  content += text("F2", 9, 434, y - 4, "UNIT PRICE", white);
  content += text("F2", 9, 519, y - 4, "TOTAL", white);
  y -= 33;

  for (const item of invoice.lines.slice(0, 16)) {
    content += text("F1", 9, margin + 8, y, clip(item.description, 53), navy);
    content += text("F1", 9, 390, y, String(item.quantity), navy);
    content += text("F1", 9, 432, y, money(item.unitPriceCents), navy);
    content += text("F2", 9, 516, y, money(item.lineTotalCents), navy);
    content += line(margin, y - 8, pageWidth - margin, y - 8);
    y -= 22;
  }
  if (invoice.lines.length > 16) {
    content += text("F1", 9, margin + 8, y, `${invoice.lines.length - 16} additional product line(s) documented in the portal invoice.`, muted);
    y -= 22;
  }

  y -= 8;
  const summaryX = 350;
  const labelX = summaryX;
  const valueX = 510;
  content += text("F1", 10, labelX, y, "Catalog product value", muted);
  content += text("F1", 10, valueX, y, money(productValueCents), navy);
  y -= 18;
  if (invoice.pricingAdjustmentCents > 0) {
    content += text("F1", 10, labelX, y, "Pricing / bundle adjustment", muted);
    content += text("F1", 10, valueX, y, `−${money(invoice.pricingAdjustmentCents)}`, "0.035 0.42 0.31 rg");
    y -= 18;
  }
  if (invoice.discountCents > 0) {
    content += text("F1", 10, labelX, y, `Discount${invoice.discount?.code ? ` (${invoice.discount.code})` : ""}`, muted);
    content += text("F1", 10, valueX, y, `−${money(invoice.discountCents)}`, "0.035 0.42 0.31 rg");
    y -= 18;
  }
  content += text("F2", 10, labelX, y, "Order amount due", navy);
  content += text("F2", 10, valueX, y, money(invoice.totalCents), navy);
  y -= 22;
  content += line(labelX, y + 8, pageWidth - margin, y + 8, "0.063 0.125 0.200 RG", 1.1);
  content += text("F2", 13, labelX, y - 8, "Actual customer payment", navy);
  content += text("F2", 13, valueX - 3, y - 8, money(invoice.actualCustomerPaidCents), navy);
  y -= 31;

  content += rect(margin, y - 52, pageWidth - margin * 2, 52, "0.94 0.97 0.97 rg");
  content += text("F2", 9, margin + 12, y - 18, "PAYMENT AND ORDER EVIDENCE", teal);
  content += text("F1", 8.5, margin + 12, y - 33, `Order source: ${invoice.orderOriginLabel}  |  Payment basis: ${invoice.paymentEvidenceLabel}`, navy);
  content += text("F1", 8.5, margin + 12, y - 45, invoice.paymentReference ? `Payment reference: ${invoice.paymentReference}` : "No external payment reference applies to this order.", muted);
  y -= 78;

  content += line(margin, 76, pageWidth - margin, 76);
  content += text("F1", 8, margin, 58, `${invoice.brand.legalName ?? invoice.brand.companyName} · ${invoice.brand.address ?? ""}`.trim(), muted);
  content += text("F1", 8, margin, 45, `${invoice.brand.companyName} invoice records the order value, adjustments, and actual customer payment evidence.`, muted);

  const stream = content;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

export function invoicePdfFileName(invoice: Pick<ReadyPacketsInvoice, "invoiceNumber">): string {
  return `${invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
}
