/**
 * Transactional email.
 *
 * Messages are queued in the database first and delivered by a worker, so a
 * transient SMTP failure never fails a user-facing request and no message is
 * silently lost. Recipient addresses are stored encrypted; the delivery log
 * keeps only a hash so history can be audited without retaining addresses.
 */
import { and, eq, lte, sql } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { emailLog, emailQueue, emailTemplates } from "../db/schema.js";
import { blindIndex, decryptField, encryptField } from "../security/crypto.js";
import { logger } from "../observability/logger.js";
import { raiseAlert } from "../observability/audit.js";
import { getSetting } from "./settings.js";
import { BRAND, BRAND_COLORS } from "../../shared/brand.js";
import { isGraphEmailEnabled, sendViaGraph } from "./emailGraph.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.smtp.enabled) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass ?? "" } : undefined,
    tls: { minVersion: "TLSv1.2" },
    pool: true,
    maxConnections: 3,
  });
  return transporter;
}

/** Escape a value before interpolating it into an HTML template. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace `{{key}}` placeholders. Values are HTML-escaped for the HTML body. */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>,
  escape: boolean,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    const asString = String(value);
    return escape ? escapeHtml(asString) : asString;
  });
}

/** Brand-consistent HTML wrapper; the logo is served from the app's own origin. */
export function wrapHtmlBody(title: string, innerHtml: string): string {
  const logoUrl = `${env.appUrl}/brand/dark/readypackets_dark_email_header.png`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Inter,'Helvetica Neue',Arial,sans-serif;color:${BRAND_COLORS.navy};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:${BRAND_COLORS.navy};padding:24px;text-align:center;">
<img src="${logoUrl}" width="240" alt="${escapeHtml(BRAND.companyShortName)}" style="display:block;margin:0 auto;max-width:240px;height:auto;">
</td></tr>
<tr><td style="padding:32px 32px 24px 32px;font-size:15px;line-height:1.65;">
${innerHtml}
</td></tr>
<tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:${BRAND_COLORS.grayDark};">
<p style="margin:0 0 6px 0;">${escapeHtml(BRAND.tagline)}</p>
<p style="margin:0 0 6px 0;">${escapeHtml(BRAND.companyLegalName)} &middot; ${escapeHtml(BRAND.address)}</p>
<p style="margin:0;">${escapeHtml(BRAND.copyright())}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function button(label: string, href: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND_COLORS.teal};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(label)}</a></p>`;
}

export interface QueueEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateKey?: string;
}

export async function queueEmail(input: QueueEmailInput): Promise<void> {
  await db.insert(emailQueue).values({
    toAddressEnc: encryptField(input.to, "email:queue") ?? "",
    templateKey: input.templateKey ?? null,
    subject: input.subject.slice(0, 255),
    bodyHtml: input.html,
    bodyText: input.text ?? null,
  });
}

export interface SendTemplateInput {
  to: string;
  templateKey: string;
  variables: Record<string, string | number | null | undefined>;
  /** Used when the template row is absent, e.g. before seeding completes. */
  fallback?: { subject: string; html: string; text?: string };
}

export async function queueTemplatedEmail(input: SendTemplateInput): Promise<void> {
  const rows = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.templateKey, input.templateKey), eq(emailTemplates.enabled, true)))
    .limit(1);
  const template = rows[0];

  if (!template) {
    if (!input.fallback) {
      logger.warn("Email template missing and no fallback supplied", {
        templateKey: input.templateKey,
      });
      return;
    }
    await queueEmail({
      to: input.to,
      subject: renderTemplate(input.fallback.subject, input.variables, false),
      html: renderTemplate(input.fallback.html, input.variables, true),
      text: input.fallback.text
        ? renderTemplate(input.fallback.text, input.variables, false)
        : undefined,
      templateKey: input.templateKey,
    });
    return;
  }

  await queueEmail({
    to: input.to,
    subject: renderTemplate(template.subject, input.variables, false),
    html: renderTemplate(template.bodyHtml, input.variables, true),
    text: template.bodyText
      ? renderTemplate(template.bodyText, input.variables, false)
      : undefined,
    templateKey: input.templateKey,
  });
}

async function deliver(
  to: string,
  subject: string,
  html: string,
  text: string | null,
): Promise<void> {
  const fromName = (await getSetting("email.from_name")) ?? BRAND.companyShortName;

  // Try Microsoft Graph first if configured; fall back to SMTP.
  if (await isGraphEmailEnabled()) {
    const sent = await sendViaGraph({ to, subject, html, text, fromName });
    if (sent) {
      logger.debug("Email delivered via Microsoft Graph", { subject });
      return;
    }
    logger.warn("Graph email delivery failed; falling back to SMTP", { subject });
  }

  const smtp = getTransporter();
  if (!smtp) {
    throw new Error("No email transport configured (set SMTP_HOST or GRAPH_EMAIL_SENDER)");
  }
  const fromAddress = env.smtp.enabled ? env.smtp.from : BRAND.emails.general;
  await smtp.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    replyTo: env.smtp.enabled ? env.smtp.replyTo : undefined,
    to,
    subject,
    html,
    text: text ?? undefined,
  });
}

/** True when at least one email transport is configured. */
export async function isEmailEnabled(): Promise<boolean> {
  return env.smtp.enabled || (await isGraphEmailEnabled());
}

/** Drain a batch of queued messages. Invoked by the scheduler. */
export async function processEmailQueue(batchSize = 20): Promise<{ sent: number; failed: number }> {
  if (!(await isEmailEnabled())) return { sent: 0, failed: 0 };

  const pending = await db
    .select()
    .from(emailQueue)
    .where(and(eq(emailQueue.status, "pending"), lte(emailQueue.runAfter, new Date())))
    .limit(batchSize);

  let sent = 0;
  let failed = 0;

  for (const message of pending) {
    const to = decryptField(message.toAddressEnc, "email:queue");
    if (!to) {
      await db
        .update(emailQueue)
        .set({ status: "failed", lastError: "Recipient could not be decrypted" })
        .where(eq(emailQueue.id, message.id));
      failed += 1;
      continue;
    }

    try {
      await deliver(to, message.subject, message.bodyHtml, message.bodyText);
      await db
        .update(emailQueue)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(emailQueue.id, message.id));
      await db.insert(emailLog).values({
        toAddressHash: blindIndex(to),
        templateKey: message.templateKey,
        subject: message.subject,
        status: "sent",
      });
      sent += 1;
    } catch (error) {
      const attempts = message.attempts + 1;
      const detail = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
      const giveUp = attempts >= 5;
      await db
        .update(emailQueue)
        .set({
          attempts,
          status: giveUp ? "failed" : "pending",
          lastError: detail,
          // Exponential backoff: 1, 2, 4, 8 minutes.
          runAfter: new Date(Date.now() + Math.min(2 ** attempts, 16) * 60_000),
        })
        .where(eq(emailQueue.id, message.id));
      await db.insert(emailLog).values({
        toAddressHash: blindIndex(to),
        templateKey: message.templateKey,
        subject: message.subject,
        status: giveUp ? "failed" : "retrying",
        detail,
      });
      if (giveUp) {
        void raiseAlert({
          alertKey: "email:delivery_failed",
          severity: "warning",
          source: "email",
          message: "One or more emails could not be delivered after five attempts",
          detail,
        });
      }
      failed += 1;
    }
  }

  return { sent, failed };
}

export async function sendTestEmail(to: string): Promise<void> {
  const html = wrapHtmlBody(
    "SMTP test message",
    `<h1 style="margin:0 0 12px 0;font-size:20px;">SMTP configuration test</h1>
     <p style="margin:0 0 12px 0;">If you are reading this, outbound email from your ReadyPackets Portal instance is working.</p>
     <p style="margin:0;">Sent at ${new Date().toISOString()}.</p>`,
  );
  await deliver(to, "ReadyPackets Portal — SMTP test", html, "SMTP test message.");
  await db.insert(emailLog).values({
    toAddressHash: blindIndex(to),
    templateKey: "smtp_test",
    subject: "ReadyPackets Portal — SMTP test",
    status: "sent",
  });
}

export async function countQueuedEmails(): Promise<{ pending: number; failed: number }> {
  const rows = await db
    .select({
      status: emailQueue.status,
      total: sql<number>`COUNT(*)`,
    })
    .from(emailQueue)
    .groupBy(emailQueue.status);
  let pending = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "pending") pending = Number(row.total);
    if (row.status === "failed") failed = Number(row.total);
  }
  return { pending, failed };
}
