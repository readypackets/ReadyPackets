import path from "node:path";

/**
 * Produces the externally visible file name for an order artifact. Storage keys
 * stay random and opaque; this name is used in the database, downloads, ZIPs,
 * customer views, administrator views, and external document systems.
 */
export function orderFilePrefix(customerPublicId: string, orderNumber: string): string {
  const customer = customerPublicId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-");
  const order = orderNumber.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-");
  return `${customer}__${order}__`;
}

function safeSourceName(value: string): { stem: string; extension: string } {
  const basename = path.basename(value).normalize("NFKC");
  const extension = path.extname(basename).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 16);
  const rawStem = extension ? basename.slice(0, -extension.length) : basename;
  const stem = rawStem
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/^[-_. ]+|[-_. ]+$/g, "")
    .slice(0, 180) || "file";
  return { stem, extension };
}

/**
 * The database column is capped at 255 characters. Preserve the source
 * extension so a user can still identify the document type in other systems.
 */
export function buildOrderFileName(input: {
  customerPublicId: string;
  orderNumber: string;
  sourceName: string;
}): string {
  const prefix = orderFilePrefix(input.customerPublicId, input.orderNumber);
  const rawBaseName = path.basename(input.sourceName).normalize("NFKC");
  if (rawBaseName.startsWith(prefix)) return rawBaseName.slice(0, 255);
  const source = safeSourceName(input.sourceName);
  const availableStemLength = Math.max(1, 255 - prefix.length - source.extension.length);
  return `${prefix}${source.stem.slice(0, availableStemLength)}${source.extension}`;
}
