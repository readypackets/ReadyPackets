/**
 * Multipart upload endpoint.
 *
 * Files are buffered in memory up to the configured limit and never written to
 * disk before validation, so a rejected file leaves nothing behind. Content is
 * validated by magic bytes, stored under a random key, and recorded with its
 * SHA-256 digest so tampering is detectable.
 */
import type { Request, Response, Router } from "express";
import express from "express";
import multer from "multer";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { fileVersions, files, intakeAnswers, intakeSubmissions, orders } from "../db/schema.js";
import { resolveSession } from "../auth/session.js";
import { CSRF_COOKIE, CSRF_HEADER } from "../security/csrf.js";
import { constantTimeEqual } from "../security/crypto.js";
import { putObject, validateUpload } from "../services/storage.js";
import { logger } from "../observability/logger.js";
import { recordActivity, recordSecurityEvent } from "../observability/audit.js";
import { assertOrderAccess } from "../services/orders.js";
import { insertedId } from "../db/result.js";

const UPLOAD_CATEGORIES = new Set([
  "deliverable",
  "intake_attachment",
  "signed_document",
  "reference",
  "internal",
  "ticket_attachment",
]);

export function createUploadRouter(): Router {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: env.storage.maxUploadBytes,
      files: 5,
      fields: 10,
      parts: 20,
    },
  });

  router.post(
    "/upload",
    (req, res, next) => {
      upload.array("files", 5)(req, res, (error: unknown) => {
        if (error) {
          const message =
            error instanceof Error && error.message.includes("File too large")
              ? `Each file must be ${Math.floor(env.storage.maxUploadBytes / 1_048_576)} MB or smaller.`
              : "The upload could not be processed.";
          res.status(413).json({ error: message });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const session = await resolveSession(req);
      if (!session || session.mfaPending || session.restricted) {
        res.status(401).json({ error: "Authentication required." });
        return;
      }

      // The multipart route sits outside tRPC, so CSRF is verified explicitly.
      const headerToken = req.headers[CSRF_HEADER];
      const cookieToken = (req.cookies?.[CSRF_COOKIE] as string | undefined) ?? "";
      if (
        typeof headerToken !== "string" ||
        !constantTimeEqual(headerToken, cookieToken) ||
        !constantTimeEqual(headerToken, session.csrfSecret)
      ) {
        void recordSecurityEvent({
          eventType: "csrf.rejected",
          outcome: "blocked",
          severity: "warning",
          message: "Upload rejected: invalid CSRF token",
          userId: session.user.id,
          ipAddress: (res.locals.clientIp as string | undefined) ?? null,
        });
        res.status(403).json({ error: "Invalid or missing CSRF token." });
        return;
      }

      const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (uploaded.length === 0) {
        res.status(400).json({ error: "No file was supplied." });
        return;
      }

      const isStaff = session.user.role === "admin" || session.user.role === "staff";
      const rawOrderId = typeof req.body.orderId === "string" ? Number(req.body.orderId) : null;
      const orderId = Number.isInteger(rawOrderId) && rawOrderId! > 0 ? rawOrderId! : null;
      const requestedCategory =
        typeof req.body.category === "string" ? req.body.category : "intake_attachment";
      const category = UPLOAD_CATEGORIES.has(requestedCategory)
        ? requestedCategory
        : "intake_attachment";
      const replaceFileId =
        typeof req.body.replaceFileId === "string" ? Number(req.body.replaceFileId) : null;
      const intakeQuestionKey =
        typeof req.body.intakeQuestionKey === "string" ? req.body.intakeQuestionKey : null;

      // Customers may only attach to their own orders, and only in safe categories.
      if (orderId !== null) {
        try {
          await assertOrderAccess(orderId, session.user.id, session.user.role);
        } catch {
          res.status(404).json({ error: "Order not found." });
          return;
        }
      }
      if (!isStaff && (category === "deliverable" || category === "internal")) {
        res.status(403).json({ error: "You cannot upload files of that type." });
        return;
      }
      if (!isStaff && replaceFileId) {
        res.status(403).json({ error: "Only staff can replace an existing file." });
        return;
      }

      const results: {
        fileId: number;
        originalName: string;
        sizeBytes: number;
        detectedMime: string;
      }[] = [];
      const rejected: { name: string; reason: string }[] = [];

      for (const file of uploaded) {
        const validation = await validateUpload(file.originalname, file.buffer);
        if (!validation.ok) {
          rejected.push({ name: file.originalname, reason: validation.reason ?? "Rejected." });
          void recordSecurityEvent({
            eventType: "file.access_denied",
            outcome: "blocked",
            severity: "warning",
            message: `Upload rejected: ${validation.reason ?? "validation failed"}`,
            userId: session.user.id,
            ipAddress: (res.locals.clientIp as string | undefined) ?? null,
            metadata: { filename: file.originalname, size: file.size },
          });
          continue;
        }

        try {
          const stored = await putObject(file.buffer, validation.extension ?? "");

          // Replacement keeps the file identity and archives the previous version.
          if (replaceFileId) {
            const existingRows = await db
              .select()
              .from(files)
              .where(and(eq(files.id, replaceFileId), isNull(files.deletedAt)))
              .limit(1);
            const existing = existingRows[0];
            if (existing) {
              await db.insert(fileVersions).values({
                fileId: existing.id,
                storageKey: existing.storageKey,
                sizeBytes: existing.sizeBytes,
                sha256: existing.sha256,
                version: existing.version,
                replacedByUserId: session.user.id,
              });
              await db
                .update(files)
                .set({
                  storageKey: stored.storageKey,
                  originalName: file.originalname.slice(0, 255),
                  detectedMime: validation.mime ?? "application/octet-stream",
                  extension: validation.extension ?? null,
                  sizeBytes: stored.sizeBytes,
                  sha256: stored.sha256,
                  version: existing.version + 1,
                  isPlaceholder: false,
                })
                .where(eq(files.id, existing.id));

              results.push({
                fileId: existing.id,
                originalName: file.originalname,
                sizeBytes: stored.sizeBytes,
                detectedMime: validation.mime ?? "application/octet-stream",
              });

              void recordActivity({
                actorUserId: session.user.id,
                actorRole: session.user.role,
                action: "file.replace",
                entityType: "file",
                entityId: existing.id,
                summary: `File "${existing.originalName}" replaced with version ${existing.version + 1}`,
                ipAddress: (res.locals.clientIp as string | undefined) ?? null,
              });
              continue;
            }
          }

          const inserted = await db.insert(files).values({
            storageKey: stored.storageKey,
            orderId,
            ownerUserId: isStaff ? null : session.user.id,
            uploadedByUserId: session.user.id,
            originalName: file.originalname.slice(0, 255),
            detectedMime: validation.mime ?? "application/octet-stream",
            extension: validation.extension ?? null,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
            category,
            // Staff publish deliverables explicitly; customer uploads are theirs by definition.
            visibleToCustomer: !isStaff,
          });
          const fileId = insertedId(inserted);

          // Link an intake attachment to its question.
          if (intakeQuestionKey && orderId) {
            const submissionRows = await db
              .select({ id: intakeSubmissions.id })
              .from(intakeSubmissions)
              .where(eq(intakeSubmissions.orderId, orderId))
              .limit(1);
            const submissionId = submissionRows[0]?.id;
            if (submissionId) {
              await db
                .insert(intakeAnswers)
                .values({
                  submissionId,
                  questionKey: intakeQuestionKey.slice(0, 48),
                  attachmentFileId: fileId,
                });
            }
          }

          results.push({
            fileId,
            originalName: file.originalname,
            sizeBytes: stored.sizeBytes,
            detectedMime: validation.mime ?? "application/octet-stream",
          });

          void recordActivity({
            actorUserId: session.user.id,
            actorRole: session.user.role,
            action: "file.upload",
            entityType: "file",
            entityId: fileId,
            summary: `Uploaded "${file.originalname}" (${category})`,
            changes: { sizeBytes: stored.sizeBytes, orderId },
            ipAddress: (res.locals.clientIp as string | undefined) ?? null,
          });
        } catch (error) {
          logger.error("Upload storage failed", { error });
          rejected.push({ name: file.originalname, reason: "The file could not be stored." });
        }
      }

      if (results.length === 0) {
        res.status(400).json({ error: rejected[0]?.reason ?? "No file was accepted.", rejected });
        return;
      }

      res.status(201).json({ files: results, rejected });
    },
  );

  return router;
}
