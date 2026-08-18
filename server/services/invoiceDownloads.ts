import { randomBytes } from "node:crypto";

const TTL_MS = 5 * 60_000;

type InvoiceDownloadTicket = {
  invoiceId: number;
  userId: number;
  expiresAt: number;
};

const tickets = new Map<string, InvoiceDownloadTicket>();

export function issueInvoiceDownloadTicket(invoiceId: number, userId: number): { token: string; expiresInSeconds: number } {
  const now = Date.now();
  for (const [token, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(token);
  }
  const token = randomBytes(24).toString("base64url");
  tickets.set(token, { invoiceId, userId, expiresAt: now + TTL_MS });
  return { token, expiresInSeconds: TTL_MS / 1_000 };
}

/** A ticket is consumed before document generation, preventing replay or caching. */
export function consumeInvoiceDownloadTicket(token: string): InvoiceDownloadTicket | null {
  const ticket = tickets.get(token);
  tickets.delete(token);
  if (!ticket || ticket.expiresAt <= Date.now()) return null;
  return ticket;
}
