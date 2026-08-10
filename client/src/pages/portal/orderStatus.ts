/**
 * Presentation mapping for order and payment states.
 *
 * The labels come from the shared domain module so the portal, the admin panel
 * and outbound email all describe a state identically; only the colour tone is
 * decided here.
 */
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from "@shared/domain";
import type { BadgeTone } from "@/components/ui/Surface";

export const STATUS_LABELS: Record<string, string> = ORDER_STATUS_LABELS;

export const STATUS_TONES: Record<string, BadgeTone> = {
  new: "neutral",
  phase_1_intake: "info",
  phase_2_synthesis: "teal",
  in_production: "gold",
  delivered: "success",
  closed: "neutral",
  cancelled: "danger",
  refunded: "danger",
};

export const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  awaiting_invoice: "Awaiting invoice",
  processing: "Processing",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  failed: "Payment failed",
};

export const PAYMENT_TONES: Record<string, BadgeTone> = {
  unpaid: "warning",
  awaiting_invoice: "info",
  processing: "info",
  paid: "success",
  partially_refunded: "warning",
  refunded: "neutral",
  failed: "danger",
};

/** Ordered lifecycle used to draw the phase tracker. */
export const PHASE_SEQUENCE: { status: OrderStatus; short: string; detail: string }[] = [
  { status: "new", short: "Order placed", detail: "Order received and awaiting the NDA and intake." },
  {
    status: "phase_1_intake",
    short: "Phase I — Intake",
    detail: "Mutual NDA signed and the structured intake form completed.",
  },
  {
    status: "phase_2_synthesis",
    short: "Phase II — Synthesis",
    detail: "The Logic Synthesis call is scheduled and held with the lead architect.",
  },
  {
    status: "in_production",
    short: "In production",
    detail: "Your packet is being built. Clarification questions appear in your portal.",
  },
  {
    status: "delivered",
    short: "Delivered",
    detail: "Deliverables published to your portal, with a 14-day quality review window.",
  },
];

export function phaseIndexOf(status: string): number {
  const index = PHASE_SEQUENCE.findIndex((phase) => phase.status === status);
  if (index >= 0) return index;
  // Closed sits after delivery; cancelled and refunded fall outside the sequence.
  if (status === "closed") return PHASE_SEQUENCE.length - 1;
  return -1;
}

export function isTerminated(status: string): boolean {
  return status === "cancelled" || status === "refunded";
}

export function paymentLabel(status: PaymentStatus | string): string {
  return PAYMENT_LABELS[status] ?? status;
}
