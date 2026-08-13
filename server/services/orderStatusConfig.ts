import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "../../shared/domain.js";
import { getSettingJson } from "./settings.js";

export const ORDER_STATUS_OPTIONS_SETTING = "orders.status_options";

export type OrderStatusTone = "neutral" | "teal" | "gold" | "success" | "warning" | "danger";

export interface OrderStatusOption {
  key: string;
  label: string;
  tone: OrderStatusTone;
  active: boolean;
  system: boolean;
  sortOrder: number;
}

const tones: readonly OrderStatusTone[] = ["neutral", "teal", "gold", "success", "warning", "danger"];
const statusKey = /^[a-z][a-z0-9_]{1,31}$/;
const terminalSystemStatuses = new Set<OrderStatus>(["closed", "cancelled", "refunded"]);

const defaultTone: Record<OrderStatus, OrderStatusTone> = {
  new: "neutral",
  phase_1_intake: "teal",
  phase_2_synthesis: "teal",
  in_production: "gold",
  delivered: "success",
  closed: "neutral",
  cancelled: "danger",
  refunded: "warning",
};

export const DEFAULT_ORDER_STATUS_OPTIONS: readonly OrderStatusOption[] = ORDER_STATUSES.map((key, index) => ({
  key,
  label: ORDER_STATUS_LABELS[key],
  tone: defaultTone[key],
  active: true,
  system: true,
  sortOrder: (index + 1) * 10,
}));

function fallbackOption(key: OrderStatus): OrderStatusOption {
  return DEFAULT_ORDER_STATUS_OPTIONS.find((option) => option.key === key)!;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeConfiguredOptions(value: unknown): OrderStatusOption[] {
  if (!Array.isArray(value)) return [...DEFAULT_ORDER_STATUS_OPTIONS];
  const supplied = new Map<string, OrderStatusOption>();
  for (const raw of value.slice(0, 40)) {
    const object = asObject(raw);
    if (!object || typeof object.key !== "string" || !statusKey.test(object.key)) continue;
    const label = typeof object.label === "string" ? object.label.trim().slice(0, 64) : "";
    if (!label) continue;
    const tone = typeof object.tone === "string" && tones.includes(object.tone as OrderStatusTone) ? object.tone as OrderStatusTone : "neutral";
    const sortOrder = typeof object.sortOrder === "number" && Number.isFinite(object.sortOrder) ? Math.max(0, Math.min(9_999, Math.round(object.sortOrder))) : 9_000;
    supplied.set(object.key, { key: object.key, label, tone, active: object.active !== false, system: ORDER_STATUSES.includes(object.key as OrderStatus), sortOrder });
  }
  for (const key of ORDER_STATUSES) {
    const configured = supplied.get(key);
    supplied.set(key, configured ? { ...configured, system: true, active: true } : fallbackOption(key));
  }
  return [...supplied.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export async function getOrderStatusOptions(includeInactive = false): Promise<OrderStatusOption[]> {
  const configured = await getSettingJson<unknown>(ORDER_STATUS_OPTIONS_SETTING, null);
  const options = normalizeConfiguredOptions(configured);
  return includeInactive ? options : options.filter((option) => option.active);
}

export async function getOrderStatusOption(key: string, includeInactive = false): Promise<OrderStatusOption | null> {
  const options = await getOrderStatusOptions(includeInactive);
  return options.find((option) => option.key === key) ?? null;
}

export async function assertActiveOrderStatus(key: string): Promise<OrderStatusOption> {
  const option = await getOrderStatusOption(key);
  if (!option) throw new Error("The selected order status is not active or is not configured.");
  return option;
}

/**
 * System lifecycle states retain their guarded transition map. Custom states are
 * non-terminal routing/status labels: administrators can move a non-terminal
 * order into or out of one only when the configured status is active.
 */
export function isTerminalOrderStatus(key: string): boolean {
  return terminalSystemStatuses.has(key as OrderStatus);
}

export function isSystemOrderStatus(key: string): key is OrderStatus {
  return ORDER_STATUSES.includes(key as OrderStatus);
}

export function normalizeOrderStatusOptions(input: unknown): OrderStatusOption[] {
  return normalizeConfiguredOptions(input);
}
