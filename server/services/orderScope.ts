import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { orderItems, orders, packetGroups } from "../db/schema.js";

export interface PacketTierSelection {
  packetGroupId: number;
  tier: string;
}

export type CanonicalPacketTier = "Basic" | "Standard" | "Premium";
export type CanonicalOrderScopeMode = "single_packet" | "multi_packet_partial";

export interface CanonicalP101Scope {
  packet: string;
  tier: CanonicalPacketTier | "Mixed";
  orderScopeMode: CanonicalOrderScopeMode;
  bundleScopeManifest: string;
}

const CANONICAL_TIERS: Record<string, CanonicalPacketTier> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
};

function canonicalTier(value: string): CanonicalPacketTier {
  const normalized = CANONICAL_TIERS[value.trim().toLowerCase()];
  if (!normalized) {
    throw new Error(`Order scope contains unsupported tier "${value}". P101 accepts only Basic, Standard, or Premium.`);
  }
  return normalized;
}

/**
 * Derive the P101 routing contract from the immutable purchased order items.
 * Stored administrator input is deliberately not authoritative here: P101 must
 * never emit a packet/tier/scope/manifest contradiction.
 */
export function deriveCanonicalP101Scope(
  selections: PacketTierSelection[],
  groupNumbers: Map<number, number>,
): CanonicalP101Scope {
  const selected = [...selections]
    .map((selection) => {
      const packetNumber = groupNumbers.get(selection.packetGroupId);
      if (!packetNumber || !Number.isInteger(packetNumber) || packetNumber < 1) {
        throw new Error("Order scope is missing a valid packet group number required for P101.");
      }
      return { packetNumber, tier: canonicalTier(selection.tier) };
    })
    .sort((left, right) => left.packetNumber - right.packetNumber);

  if (selected.length === 0) {
    throw new Error("P101 cannot start because this order has no purchased packet selections.");
  }
  if (new Set(selected.map((selection) => selection.packetNumber)).size !== selected.length) {
    throw new Error("P101 cannot start because the order contains more than one tier for the same packet.");
  }

  const manifest: Record<string, CanonicalPacketTier> = {};
  for (const selection of selected) manifest[`packet_${selection.packetNumber}`] = selection.tier;
  const bundleScopeManifest = JSON.stringify(manifest);

  if (selected.length === 1) {
    const only = selected[0]!;
    return {
      packet: String(only.packetNumber),
      tier: only.tier,
      orderScopeMode: "single_packet",
      bundleScopeManifest,
    };
  }

  return {
    packet: "7",
    tier: "Mixed",
    orderScopeMode: "multi_packet_partial",
    bundleScopeManifest,
  };
}

export async function getPacketGroupNumbers(groupIds: number[]): Promise<Map<number, number>> {
  const distinctIds = [...new Set(groupIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (distinctIds.length === 0) return new Map();
  const rows = await db
    .select({ id: packetGroups.id, groupNumber: packetGroups.groupNumber })
    .from(packetGroups)
    .where(inArray(packetGroups.id, distinctIds));
  return new Map(rows.map((row) => [row.id, row.groupNumber]));
}

export async function deriveCanonicalP101ScopeForOrder(orderId: number): Promise<CanonicalP101Scope> {
  const rows = await db
    .select({ packetGroupId: orderItems.packetGroupId, tier: orderItems.tier })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const groupNumbers = await getPacketGroupNumbers(rows.map((row) => row.packetGroupId));
  return deriveCanonicalP101Scope(rows, groupNumbers);
}

/** Compatibility alias used by non-routing display paths. */
export async function deriveBundleScopeManifestForOrder(orderId: number): Promise<string> {
  return (await deriveCanonicalP101ScopeForOrder(orderId)).bundleScopeManifest;
}

/**
 * Persist canonical scope values for legacy orders before P101 delivery. This
 * makes P101 the durable metadata writer required by the production contract.
 */
export async function backfillCanonicalP101Scope(orderId: number): Promise<CanonicalP101Scope> {
  const scope = await deriveCanonicalP101ScopeForOrder(orderId);
  await db
    .update(orders)
    .set({
      orderScopeMode: scope.orderScopeMode,
      bundleScopeManifest: scope.bundleScopeManifest,
    })
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));
  return scope;
}

/** Compatibility helper retained for callers that only need canonical scope mode. */
export function defaultOrderScopeMode(selections: PacketTierSelection[]): CanonicalOrderScopeMode {
  return selections.length > 1 ? "multi_packet_partial" : "single_packet";
}

/** Compatibility helper retained for order creation callers. Stored input is ignored for canonical P101 safety. */
export function resolveBundleScopeManifest(
  _storedManifest: string | null | undefined,
  selections: PacketTierSelection[],
  groupNumbers: Map<number, number>,
): string {
  return deriveCanonicalP101Scope(selections, groupNumbers).bundleScopeManifest;
}
