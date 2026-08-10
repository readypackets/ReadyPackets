/**
 * File listing and download authorisation.
 *
 * Downloads are not served from this router. Instead a short-lived, single-use
 * ticket is issued after the ownership check, and the Express handler exchanges
 * it for the bytes. This keeps the authorisation decision in one place and means
 * a leaked URL is useless within a minute.
 */
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { fileAccessLog, files, orders } from "../db/schema.js";
import { recordSecurityEvent } from "../observability/audit.js";
import { OrderStateError, assertOrderAccess } from "../services/orders.js";
import { allowedExtensions } from "../services/storage.js";
import { protectedProcedure, router } from "../trpc/trpc.js";

const TICKET_TTL_MS = 60_000;

interface DownloadTicket {
  fileIds: number[];
  userId: number;
  expiresAt: number;
  /** A ticket is consumed on first use to prevent replay. */
  used: boolean;
  archiveName: string | null;
}

const tickets = new Map<string, DownloadTicket>();

const ticketSweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, ticket] of tickets) {
    if (ticket.expiresAt < now) tickets.delete(key);
  }
}, 30_000);
ticketSweeper.unref();

export function issueDownloadTicket(
  userId: number,
  fileIds: number[],
  archiveName: string | null = null,
): string {
  const token = randomBytes(24).toString("base64url");
  tickets.set(token, {
    fileIds,
    userId,
    expiresAt: Date.now() + TICKET_TTL_MS,
    used: false,
    archiveName,
  });
  return token;
}

export function consumeDownloadTicket(token: string): DownloadTicket | null {
  const ticket = tickets.get(token);
  if (!ticket) return null;
  if (ticket.used || ticket.expiresAt < Date.now()) {
    tickets.delete(token);
    return null;
  }
  ticket.used = true;
  // Retain briefly so a duplicated request produces a clear failure, not a silent 404.
  setTimeout(() => tickets.delete(token), 5_000).unref();
  return ticket;
}

/**
 * Resolve which of the requested files the caller may read.
 * Staff and admins may read any file; customers may read only files attached to
 * an order they own or that were shared with them, and only when the file is
 * marked visible.
 */
export async function authoriseFileAccess(
  fileIds: number[],
  userId: number,
  role: string,
): Promise<{ id: number; storageKey: string; originalName: string; detectedMime: string }[]> {
  if (fileIds.length === 0) return [];

  const rows = await db
    .select({
      id: files.id,
      storageKey: files.storageKey,
      originalName: files.originalName,
      detectedMime: files.detectedMime,
      orderId: files.orderId,
      ownerUserId: files.ownerUserId,
      visibleToCustomer: files.visibleToCustomer,
      isPlaceholder: files.isPlaceholder,
    })
    .from(files)
    .where(and(inArray(files.id, fileIds), isNull(files.deletedAt)));

  const authorised: {
    id: number;
    storageKey: string;
    originalName: string;
    detectedMime: string;
  }[] = [];

  for (const row of rows) {
    if (role === "admin" || role === "staff") {
      authorised.push(row);
      continue;
    }
    if (row.isPlaceholder || !row.visibleToCustomer) continue;
    if (row.ownerUserId === userId) {
      authorised.push(row);
      continue;
    }
    if (row.orderId !== null) {
      try {
        await assertOrderAccess(row.orderId, userId, role);
        authorised.push(row);
      } catch {
        /* not entitled to this order */
      }
    }
  }

  return authorised;
}

export async function logFileAccess(
  fileId: number,
  userId: number | null,
  action: string,
  ipAddress: string | null,
  outcome: "allowed" | "denied" = "allowed",
): Promise<void> {
  await db.insert(fileAccessLog).values({
    fileId,
    userId,
    action,
    ipAddress: ipAddress?.slice(0, 64) ?? null,
    outcome,
  });
}

export const filesRouter = router({
  allowedTypes: protectedProcedure.query(() => allowedExtensions()),

  /** All deliverables visible to the caller, grouped by order. */
  listForUser: protectedProcedure.query(async ({ ctx }) => {
    const ownedOrders = await db
      .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
      .from(orders)
      .where(and(eq(orders.userId, ctx.session.user.id), isNull(orders.deletedAt)));

    if (ownedOrders.length === 0) return [];

    const orderIds = ownedOrders.map((order) => order.id);
    const rows = await db
      .select({
        id: files.id,
        orderId: files.orderId,
        originalName: files.originalName,
        extension: files.extension,
        sizeBytes: files.sizeBytes,
        category: files.category,
        version: files.version,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(
        and(
          inArray(files.orderId, orderIds),
          eq(files.visibleToCustomer, true),
          eq(files.isPlaceholder, false),
          isNull(files.deletedAt),
        ),
      )
      .orderBy(desc(files.createdAt));

    const orderMap = new Map(ownedOrders.map((order) => [order.id, order]));
    return rows.map((row) => ({
      ...row,
      orderNumber: row.orderId ? orderMap.get(row.orderId)?.orderNumber ?? null : null,
    }));
  }),

  listForOrder: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try {
        await assertOrderAccess(input.orderId, ctx.session.user.id, ctx.session.user.role);
      } catch (error) {
        if (error instanceof OrderStateError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }

      const isStaff = ctx.session.user.role === "admin" || ctx.session.user.role === "staff";
      const conditions = [eq(files.orderId, input.orderId), isNull(files.deletedAt)];
      if (!isStaff) conditions.push(eq(files.visibleToCustomer, true));

      return db
        .select({
          id: files.id,
          originalName: files.originalName,
          extension: files.extension,
          sizeBytes: files.sizeBytes,
          category: files.category,
          visibleToCustomer: files.visibleToCustomer,
          isPlaceholder: files.isPlaceholder,
          version: files.version,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(and(...conditions))
        .orderBy(desc(files.createdAt));
    }),

  /** Exchange an authorisation check for a short-lived download ticket. */
  requestDownload: protectedProcedure
    .input(z.object({ fileId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const authorised = await authoriseFileAccess(
        [input.fileId],
        ctx.session.user.id,
        ctx.session.user.role,
      );
      if (authorised.length === 0) {
        await logFileAccess(input.fileId, ctx.session.user.id, "download", ctx.clientIp, "denied");
        void recordSecurityEvent({
          eventType: "file.access_denied",
          outcome: "blocked",
          severity: "warning",
          message: `Denied download of file ${input.fileId}`,
          userId: ctx.session.user.id,
          ipAddress: ctx.clientIp,
        });
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found." });
      }

      const token = issueDownloadTicket(ctx.session.user.id, [input.fileId]);
      return {
        token,
        url: `/api/files/download/${token}`,
        expiresInSeconds: TICKET_TTL_MS / 1000,
      };
    }),

  /** Bulk download as a ZIP archive; classified as an expensive operation. */
  bulkDownload: protectedProcedure
    .input(
      z.object({
        fileIds: z.array(z.number().int().positive()).min(1).max(200),
        archiveName: z.string().trim().max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const authorised = await authoriseFileAccess(
        input.fileIds,
        ctx.session.user.id,
        ctx.session.user.role,
      );
      if (authorised.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No downloadable files were found." });
      }

      const safeName = (input.archiveName ?? "readypackets-files")
        .replace(/[^A-Za-z0-9._-]/g, "-")
        .slice(0, 80);
      const token = issueDownloadTicket(
        ctx.session.user.id,
        authorised.map((file) => file.id),
        `${safeName}.zip`,
      );

      return {
        token,
        url: `/api/files/download/${token}`,
        fileCount: authorised.length,
        skipped: input.fileIds.length - authorised.length,
        expiresInSeconds: TICKET_TTL_MS / 1000,
      };
    }),
});
