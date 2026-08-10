/**
 * Product catalogue queries and bundle pricing.
 *
 * Money is handled exclusively in integer cents. The bundle discount is applied
 * with integer arithmetic and a documented rounding rule so a quote is always
 * reproducible.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { bundleRules, packetGroups, productFeatures, products } from "../db/schema.js";
import { BUNDLE_RULE } from "../../shared/domain.js";

export interface CatalogFeature {
  label: string;
  detail: string | null;
  inheritedFromTier: string | null;
}

export interface CatalogProduct {
  id: number;
  sku: string;
  name: string;
  tier: string;
  priceCents: number | null;
  customPricing: boolean;
  deliveryEstimate: string;
  outcome: string | null;
  description: string | null;
  listed: boolean;
  features: CatalogFeature[];
}

export interface CatalogGroup {
  id: number;
  slug: string;
  groupNumber: number;
  name: string;
  category: string;
  summary: string | null;
  icon: string;
  products: CatalogProduct[];
}

export async function getCatalog(options: { includeUnlisted?: boolean } = {}): Promise<CatalogGroup[]> {
  const groupRows = await db
    .select()
    .from(packetGroups)
    .where(options.includeUnlisted ? undefined : eq(packetGroups.listed, true))
    .orderBy(asc(packetGroups.sortOrder), asc(packetGroups.groupNumber));

  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((row) => row.id);
  const productConditions = [inArray(products.packetGroupId, groupIds), eq(products.active, true)];
  if (!options.includeUnlisted) productConditions.push(eq(products.listed, true));

  const productRows = await db
    .select()
    .from(products)
    .where(and(...productConditions))
    .orderBy(asc(products.sortOrder), asc(products.id));

  const productIds = productRows.map((row) => row.id);
  const featureRows =
    productIds.length > 0
      ? await db
          .select()
          .from(productFeatures)
          .where(inArray(productFeatures.productId, productIds))
          .orderBy(asc(productFeatures.sortOrder), asc(productFeatures.id))
      : [];

  const featuresByProduct = new Map<number, CatalogFeature[]>();
  for (const row of featureRows) {
    const list = featuresByProduct.get(row.productId) ?? [];
    list.push({
      label: row.label,
      detail: row.detail,
      inheritedFromTier: row.inheritedFromTier,
    });
    featuresByProduct.set(row.productId, list);
  }

  const productsByGroup = new Map<number, CatalogProduct[]>();
  for (const row of productRows) {
    const list = productsByGroup.get(row.packetGroupId) ?? [];
    list.push({
      id: row.id,
      sku: row.sku,
      name: row.name,
      tier: row.tier,
      priceCents: row.priceCents,
      customPricing: row.customPricing,
      deliveryEstimate: row.deliveryEstimate,
      outcome: row.outcome,
      description: row.description,
      listed: row.listed,
      features: featuresByProduct.get(row.id) ?? [],
    });
    productsByGroup.set(row.packetGroupId, list);
  }

  return groupRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    groupNumber: row.groupNumber,
    name: row.name,
    category: row.category,
    summary: row.summary,
    icon: row.icon,
    products: productsByGroup.get(row.id) ?? [],
  }));
}

export async function getProductsByIds(ids: number[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.active, true)));
}

export interface QuoteLine {
  productId: number;
  packetGroupId: number;
  sku: string;
  name: string;
  tier: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  bundleApplied: boolean;
  requiresCustomQuote: boolean;
  distinctGroups: number;
}

/**
 * Price a selection. When the selection covers the configured number of packet
 * groups, the bundle discount is applied to the subtotal. Rounding is
 * floor-based so the customer is never charged a fraction of a cent more than
 * the stated percentage.
 */
export async function priceSelection(
  selections: { productId: number; quantity?: number }[],
): Promise<Quote> {
  const ids = [...new Set(selections.map((entry) => entry.productId))];
  const rows = await getProductsByIds(ids);
  const byId = new Map(rows.map((row) => [row.id, row]));

  const lines: QuoteLine[] = [];
  let subtotalCents = 0;
  let requiresCustomQuote = false;

  for (const selection of selections) {
    const product = byId.get(selection.productId);
    if (!product) continue;
    const quantity = Math.max(1, Math.min(selection.quantity ?? 1, 10));
    if (product.customPricing || product.priceCents === null) {
      requiresCustomQuote = true;
      lines.push({
        productId: product.id,
        packetGroupId: product.packetGroupId,
        sku: product.sku,
        name: product.name,
        tier: product.tier,
        unitPriceCents: 0,
        quantity,
        lineTotalCents: 0,
      });
      continue;
    }
    const lineTotal = product.priceCents * quantity;
    subtotalCents += lineTotal;
    lines.push({
      productId: product.id,
      packetGroupId: product.packetGroupId,
      sku: product.sku,
      name: product.name,
      tier: product.tier,
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents: lineTotal,
    });
  }

  const distinctGroups = new Set(lines.map((line) => line.packetGroupId)).size;

  const ruleRows = await db
    .select()
    .from(bundleRules)
    .where(eq(bundleRules.active, true))
    .limit(1);
  const rule = ruleRows[0];
  const minimumGroups = rule?.minimumGroups ?? BUNDLE_RULE.minimumGroups;
  const basisPoints = rule?.discountBasisPoints ?? BUNDLE_RULE.discountBasisPoints;

  const bundleApplied = distinctGroups >= minimumGroups && subtotalCents > 0;
  const discountCents = bundleApplied
    ? Math.floor((subtotalCents * basisPoints) / 10_000)
    : 0;

  return {
    lines,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    bundleApplied,
    requiresCustomQuote,
    distinctGroups,
  };
}
