/**
 * Administrative file operations: visibility, placeholders, versioning, deletion.
 *
 * The binary upload itself is handled by the Express route in
 * `server/http/uploads.ts`, because multipart parsing does not belong in tRPC.
 * This router covers the metadata operations that follow an upload.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { fileAccessLog, fileVersions, files, orders } from "../db/schema.js";
import { displayNameOf, getUserById } from "../db/users.js";
import { recordActivity } from "../observability/audit.js";
import { deleteObject } from "../services/storage.js";
import { queueTemplatedEmail, wrapHtmlBody } from "../services/email.js";
import { staffProcedure, adminProcedure, router } from "../trpc/trpc.js";
import { insertedId } from "../db/result.js";

const FILE_CATEGORIES = [
  "deliverable",
  "intake_attachment",
  "signed_document",
  "reference",
  "internal",
  "ticket_attachment",
] as const;

export const adminFilesRouter = router({
  list: staffProcedure
    .input(
      z
        .object({
          orderId: z.number().int().positive().optional(),
          includeDeleted: z.boolean().default(false),
          limit: z.number().int().min(1).max(300).default(100),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.orderId) conditions.push(eq(files.orderId, input.orderId));
      if (!input?.includeDeleted) conditions.push(isNull(files.deletedAt));

      const rows = await db
        .select()
        .from(files)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(files.createdAt))
        .limit(input?.limit ?? 100);

      const uploaderNames = new Map<number, string>();
      for (const userId of new Set(rows.map((row) => row.uploadedByUserId))) {
        const user = await getUserById(userId);
        uploaderNames.set(userId, user ? displayNameOf(user) : "Unknown");
      }

      return rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        originalName: row.originalName,
        detectedMime: row.detectedMime,
        extension: row.extension,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
        category: row.category,
        phase: row.phase,
        visibleToCustomer: row.visibleToCustomer,
        isPlaceholder: row.isPlaceholder,
        version: row.version,
        uploadedBy: uploaderNames.get(row.uploadedByUserId) ?? "Unknown",
        createdAt: row.createdAt,
        deletedAt: row.deletedAt,
      }));
    }),

  setVisibility: staffProcedure
    .input(
      z.object({
        fileId: z.number().int().positive(),
        visibleToCustomer: z.boolean(),
        notifyCustomer: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: files.id,
          orderId: files.orderId,
          originalName: files.originalName,
          isPlaceholder: files.isPlaceholder,
        })
        .from(files)
        .where(and(eq(files.id, input.fileId), isNull(files.deletedAt)))
        .limit(1);
      const file = rows[0];
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found." });

      if (input.visibleToCustomer && file.isPlaceholder) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A placeholder cannot be published to the customer. Replace it first.",
        });
      }

      await db
        .update(files)
        .set({ visibleToCustomer: input.visibleToCustomer })
        .where(eq(files.id, input.fileId));

      if (input.visibleToCustomer && input.notifyCustomer && file.orderId) {
        const orderRow = await db
          .select({ userId: orders.userId, orderNumber: orders.orderNumber })
          .from(orders)
          .where(eq(orders.id, file.orderId))
          .limit(1);
        if (orderRow[0]) {
          const customer = await getUserById(orderRow[0].userId);
          if (customer) {
            await queueTemplatedEmail({
              to: customer.email,
              templateKey: "deliverable_ready",
              variables: {
                name: displayNameOf(customer),
                orderNumber: orderRow[0].orderNumber,
                fileName: file.originalName,
              },
              fallback: {
                subject: "A new deliverable is ready — order {{orderNumber}}",
                html: wrapHtmlBody(
                  "Your deliverable is ready",
                  `<p style="margin:0 0 12px 0;">Hello {{name}}, "{{fileName}}" is now available in your portal for order {{orderNumber}}.</p>
                   <p style="margin:0;">Sign in to review and download it.</p>`,
                ),
              },
            });
          }
        }
      }

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "file.visibility",
        entityType: "file",
        entityId: input.fileId,
        summary: `File "${file.originalName}" ${
          input.visibleToCustomer ? "published to" : "hidden from"
        } the customer`,
        ipAddress: ctx.clientIp,
      });

      return { ok: true as const };
    }),

  updateMetadata: staffProcedure
    .input(
      z.object({
        fileId: z.number().int().positive(),
        category: z.enum(FILE_CATEGORIES).optional(),
        originalName: z.string().trim().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Partial<typeof files.$inferInsert> = {};
      if (input.category) patch.category = input.category;
      if (input.originalName) {
        // Reject a rename that would introduce a dangerous extension.
        if (/\.(exe|sh|bat|cmd|php|js|html?|jar|ps1)$/i.test(input.originalName)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That filename extension is not permitted.",
          });
        }
        patch.originalName = input.originalName;
      }
      if (Object.keys(patch).length === 0) return { ok: true as const };

      await db.update(files).set(patch).where(eq(files.id, input.fileId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "file.metadata",
        entityType: "file",
        entityId: input.fileId,
        summary: "File metadata updated",
        changes: patch as Record<string, unknown>,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /** Create a named placeholder so the customer can see what is coming. */
  createPlaceholder: staffProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        name: z.string().trim().min(3).max(255),
        category: z.enum(FILE_CATEGORIES).default("deliverable"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const inserted = await db.insert(files).values({
        storageKey: `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        orderId: input.orderId,
        uploadedByUserId: ctx.session.user.id,
        originalName: input.name,
        detectedMime: "application/octet-stream",
        extension: null,
        sizeBytes: 0,
        sha256: "0".repeat(64),
        category: input.category,
        visibleToCustomer: false,
        isPlaceholder: true,
      });
      return {
        ok: true as const,
        fileId: insertedId(inserted),
      };
    }),

  versions: staffProcedure
    .input(z.object({ fileId: z.number().int().positive() }))
    .query(async ({ input }) =>
      db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId))
        .orderBy(desc(fileVersions.version)),
    ),

  accessLog: adminProcedure
    .input(
      z.object({
        fileId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(300).default(100),
      }),
    )
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(fileAccessLog)
        .where(input.fileId ? eq(fileAccessLog.fileId, input.fileId) : undefined)
        .orderBy(desc(fileAccessLog.createdAt))
        .limit(input.limit);

      const names = new Map<number, string>();
      for (const userId of new Set(rows.map((row) => row.userId).filter(Boolean))) {
        const user = await getUserById(userId as number);
        names.set(userId as number, user ? displayNameOf(user) : "Deleted user");
      }

      return rows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        user: row.userId ? names.get(row.userId) ?? "Unknown" : "Anonymous",
        action: row.action,
        outcome: row.outcome,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt,
      }));
    }),

  softDelete: staffProcedure
    .input(z.object({ fileId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(files)
        .set({ deletedAt: new Date(), visibleToCustomer: false })
        .where(eq(files.id, input.fileId));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "file.soft_delete",
        entityType: "file",
        entityId: input.fileId,
        severity: "warning",
        summary: "File soft-deleted",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  restore: staffProcedure
    .input(z.object({ fileId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.update(files).set({ deletedAt: null }).where(eq(files.id, input.fileId));
      return { ok: true as const };
    }),

  /** Permanent removal, including the stored object. Admin only. */
  purge: adminProcedure
    .input(
      z.object({
        fileId: z.number().int().positive(),
        confirm: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select({ id: files.id, storageKey: files.storageKey, originalName: files.originalName })
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);
      const file = rows[0];
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found." });

      const versionRows = await db
        .select({ storageKey: fileVersions.storageKey })
        .from(fileVersions)
        .where(eq(fileVersions.fileId, input.fileId));

      for (const version of versionRows) await deleteObject(version.storageKey);
      await deleteObject(file.storageKey);

      await db.delete(fileVersions).where(eq(fileVersions.fileId, input.fileId));
      await db.delete(files).where(eq(files.id, input.fileId));

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "file.purge",
        entityType: "file",
        entityId: input.fileId,
        severity: "critical",
        summary: `File "${file.originalName}" permanently deleted`,
        ipAddress: ctx.clientIp,
      });

      return { ok: true as const };
    }),

  storageUsage: adminProcedure.query(async () => {
    const rows = await db
      .select({
        total: sql<number>`COALESCE(SUM(${files.sizeBytes}), 0)`,
        fileCount: sql<number>`COUNT(*)`,
      })
      .from(files)
      .where(isNull(files.deletedAt));
    const byCategory = await db
      .select({
        category: files.category,
        total: sql<number>`COALESCE(SUM(${files.sizeBytes}), 0)`,
      })
      .from(files)
      .where(isNull(files.deletedAt))
      .groupBy(files.category);

    return {
      totalBytes: Number(rows[0]?.total ?? 0),
      fileCount: Number(rows[0]?.fileCount ?? 0),
      byCategory: byCategory.map((row) => ({
        category: row.category,
        bytes: Number(row.total),
      })),
    };
  }),
});
