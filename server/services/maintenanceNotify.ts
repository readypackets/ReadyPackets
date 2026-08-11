/**
 * Maintenance subscriber notification service.
 *
 * When a maintenance window is activated or deactivated, this service sends
 * email notifications to all opted-in subscribers.
 */
import { db } from "../db/client.js";
import { maintenanceSubscribers } from "../db/schema.js";
import { decryptField } from "../security/crypto.js";
import { queueEmail, wrapHtmlBody } from "./email.js";
import { logger } from "../observability/logger.js";

export async function notifyMaintenanceStart(message?: string): Promise<number> {
  const rows = await db
    .select({ emailEnc: maintenanceSubscribers.emailEnc, id: maintenanceSubscribers.id })
    .from(maintenanceSubscribers);

  if (rows.length === 0) return 0;

  const maintenanceMessage =
    message ?? "We are performing scheduled maintenance. The portal will be back shortly.";

  let sent = 0;
  for (const row of rows) {
    try {
      const email = decryptField(row.emailEnc, `maintenance_subscribers:${row.id}`);
      if (!email) continue;
      await queueEmail({
        to: email,
        subject: "ReadyPackets Portal — Scheduled Maintenance",
        html: wrapHtmlBody(
          "Scheduled Maintenance",
          `<p style="margin:0 0 12px 0;">Hello,</p>
           <p style="margin:0 0 12px 0;">${maintenanceMessage}</p>
           <p style="margin:0;">We will notify you when the portal is back online.</p>`,
        ),
      });
      sent++;
    } catch (err) {
      logger.warn(`Failed to queue maintenance start notification: ${String(err)}`);
    }
  }

  logger.info(`Maintenance start notifications queued: ${sent}/${rows.length}`);
  return sent;
}

export async function notifyMaintenanceEnd(): Promise<number> {
  const rows = await db
    .select({ emailEnc: maintenanceSubscribers.emailEnc, id: maintenanceSubscribers.id })
    .from(maintenanceSubscribers);

  if (rows.length === 0) return 0;

  let sent = 0;
  for (const row of rows) {
    try {
      const email = decryptField(row.emailEnc, `maintenance_subscribers:${row.id}`);
      if (!email) continue;
      await queueEmail({
        to: email,
        subject: "ReadyPackets Portal — Back Online",
        html: wrapHtmlBody(
          "We're Back Online",
          `<p style="margin:0 0 12px 0;">Hello,</p>
           <p style="margin:0;">The ReadyPackets portal is back online. Thank you for your patience.</p>`,
        ),
      });
      sent++;
    } catch (err) {
      logger.warn(`Failed to queue maintenance end notification: ${String(err)}`);
    }
  }

  logger.info(`Maintenance end notifications queued: ${sent}/${rows.length}`);
  return sent;
}
