import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { orderItems, orders, packetGroups } from "../db/schema.js";

export interface PacketTierSelection {
  packetGroupId: number;
  tier: string;
}

function normaliseManifestObject(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  const output: Record<string, string> = {};
  for (const [key, tier] of entries) {
    if (!/^packet_[1-9]\d*$/.test(key) || typeof tier !== "string" || !tier.trim()) return null;
    output[key] = tier.trim();
  }
  return output;
}

/**
 * Preserve a valid, non-empty administrator-supplied manifest. Empty, malformed,
 * or absent values are deliberately replaced by a deterministic representation of
 * the packet groups and tiers actually purchased with the order.
 */
export function resolveBundleScopeManifest(
  storedManifest: string | null | undefined,
  selections: PacketTierSelection[],
  groupNumbers: Map<number, number>,
): string {
  if (storedManifest?.trim()) {
    try {
      const explicit = normaliseManifestObject(JSON.parse(storedManifest));
      if (explicit) return JSON.stringify(explicit);
    } catch {
      // Fall through to the durable order-item source of truth.
    }
  }

  const output: Record<string, string> = {};
  for (const selection of [...selections].sort((left, right) => (groupNumbers.get(left.packetGroupId) ?? Number.MAX_SAFE_INTEGER) - (groupNumbers.get(right.packetGroupId) ?? Number.MAX_SAFE_INTEGER))) {
    const groupNumber = groupNumbers.get(selection.packetGroupId);
    const tier = selection.tier.trim();
    if (!groupNumber || !tier) continue;
    output[`packet_${groupNumber}`] = tier;
  }
  return JSON.stringify(output);
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

export async function deriveBundleScopeManifestForOrder(orderId: number, storedManifest?: string | null): Promise<string> {
  const rows = await db
    .select({ packetGroupId: orderItems.packetGroupId, tier: orderItems.tier })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const groupNumbers = await getPacketGroupNumbers(rows.map((row) => row.packetGroupId));
  return resolveBundleScopeManifest(storedManifest, rows, groupNumbers);
}

/** Backfill a missing legacy manifest only when an order has an actual selection-derived scope. */
export async function backfillBundleScopeManifest(orderId: number, storedManifest?: string | null): Promise<string> {
  const manifest = await deriveBundleScopeManifestForOrder(orderId, storedManifest);
  if (manifest !== "{}" && manifest !== storedManifest) {
    await db
      .update(orders)
      .set({ bundleScopeManifest: manifest })
      .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));
  }
  return manifest;
}

export function defaultOrderScopeMode(selections: PacketTierSelection[]): string {
  return selections.length > 1 ? "multi_packet_partial" : "single_packet";
}
