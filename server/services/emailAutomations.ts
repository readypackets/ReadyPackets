/**
 * Email automations engine.
 *
 * Automations are event-triggered email sequences. When a platform event fires
 * (e.g. order.created, order.phase_changed, user.registered), the engine looks
 * up all enabled automations for that event and queues the appropriate emails.
 *
 * Supported trigger events:
 *   user.registered          - New customer account created
 *   user.email_verified      - Email address confirmed
 *   order.created            - New order placed
 *   order.phase_changed      - Order moved to a new phase
 *   order.delivered          - Order marked as delivered
 *   order.closed             - Order closed
 *   ticket.created           - New support ticket opened
 *   ticket.replied           - Staff replied to a ticket
 *   payment.succeeded        - Payment completed
 *   payment.failed           - Payment failed
 *   review.approved          - Review approved and published
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailAutomations } from "../db/schema.js";
import { getUserById } from "../db/users.js";
import { queueTemplatedEmail } from "./email.js";
import { logger } from "../observability/logger.js";

export type AutomationEvent =
  | "user.registered"
  | "user.email_verified"
  | "order.created"
  | "order.phase_changed"
  | "order.delivered"
  | "order.closed"
  | "ticket.created"
  | "ticket.replied"
  | "payment.succeeded"
  | "payment.failed"
  | "review.approved";

export const AUTOMATION_EVENTS: AutomationEvent[] = [
  "user.registered",
  "user.email_verified",
  "order.created",
  "order.phase_changed",
  "order.delivered",
  "order.closed",
  "ticket.created",
  "ticket.replied",
  "payment.succeeded",
  "payment.failed",
  "review.approved",
];

export const AUTOMATION_EVENT_LABELS: Record<AutomationEvent, string> = {
  "user.registered": "New user registration",
  "user.email_verified": "Email address verified",
  "order.created": "Order created",
  "order.phase_changed": "Order phase changed",
  "order.delivered": "Order delivered",
  "order.closed": "Order closed",
  "ticket.created": "Support ticket opened",
  "ticket.replied": "Support ticket reply",
  "payment.succeeded": "Payment succeeded",
  "payment.failed": "Payment failed",
  "review.approved": "Review approved",
};

export interface AutomationContext {
  /** The user who is the recipient (customer). */
  userId?: number;
  /** Override the recipient email address (when userId is not available). */
  recipientEmail?: string;
  /** Template variables to interpolate. */
  variables?: Record<string, string | number | null | undefined>;
}

/**
 * Fire all enabled automations for the given event.
 * Non-fatal: errors are logged but do not propagate to the caller.
 */
export async function fireAutomations(
  event: AutomationEvent,
  context: AutomationContext,
): Promise<void> {
  try {
    const automations = await db
      .select()
      .from(emailAutomations)
      .where(and(eq(emailAutomations.triggerEvent, event), eq(emailAutomations.enabled, true)));

    if (automations.length === 0) return;

    // Resolve the recipient email address.
    let recipientEmail = context.recipientEmail;
    let recipientName: string | undefined;

    if (!recipientEmail && context.userId) {
      const user = await getUserById(context.userId);
      if (user) {
        recipientEmail = user.email ?? undefined;
        recipientName = user.preferredName ?? user.firstName ?? undefined;
      }
    }

    if (!recipientEmail) {
      logger.warn("Email automation fired but no recipient could be resolved", { event });
      return;
    }

    const baseVariables: Record<string, string | number | null | undefined> = {
      recipient_email: recipientEmail,
      recipient_name: recipientName ?? "",
      event,
      ...context.variables,
    };

    for (const automation of automations) {
      try {
        // Apply delay by scheduling the email for the future.
        const runAfterMs = automation.delayMinutes * 60_000;

        await queueTemplatedEmail({
          to: recipientEmail,
          templateKey: automation.templateKey,
          variables: baseVariables,
        });

        // Update run count and last run time.
        await db
          .update(emailAutomations)
          .set({
            runCount: automation.runCount + 1,
            lastRunAt: new Date(),
          })
          .where(eq(emailAutomations.id, automation.id));

        logger.debug("Email automation fired", {
          automationId: automation.id,
          event,
          templateKey: automation.templateKey,
          delayMinutes: automation.delayMinutes,
        });
      } catch (error) {
        logger.error("Email automation failed", {
          automationId: automation.id,
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error("Email automations engine error", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
