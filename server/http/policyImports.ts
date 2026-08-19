import type { Request, Response, Router } from "express";
import express from "express";
import multer from "multer";
import { resolveSession } from "../auth/session.js";
import { recordActivity, recordSecurityEvent } from "../observability/audit.js";
import { constantTimeEqual } from "../security/crypto.js";
import { CSRF_COOKIE, CSRF_HEADER } from "../security/csrf.js";
import {
  importPolicyDocument,
  isAcceptedPolicyImportMime,
  POLICY_IMPORT_ACCEPT,
  POLICY_IMPORT_MAX_BYTES,
} from "../services/policyImport.js";

export function createPolicyImportRouter(): Router {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: POLICY_IMPORT_MAX_BYTES, files: 1, fields: 2, parts: 5 },
  });

  router.post(
    "/import",
    (req, res, next) => {
      upload.single("file")(req, res, (error: unknown) => {
        if (!error) return next();
        const tooLarge = error instanceof Error && /file too large/i.test(error.message);
        res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? "Policy import files must be 5 MB or smaller." : "The policy document could not be processed." });
      });
    },
    async (req: Request, res: Response) => {
      const session = await resolveSession(req);
      if (!session || session.mfaPending || session.restricted || session.user.role !== "admin") {
        res.status(403).json({ error: "Administrator access is required." });
        return;
      }

      const headerToken = req.headers[CSRF_HEADER];
      const cookieToken = (req.cookies?.[CSRF_COOKIE] as string | undefined) ?? "";
      if (typeof headerToken !== "string" || !constantTimeEqual(headerToken, cookieToken) || !constantTimeEqual(headerToken, session.csrfSecret)) {
        void recordSecurityEvent({
          eventType: "csrf.rejected",
          outcome: "blocked",
          severity: "warning",
          message: "Policy import rejected: invalid CSRF token",
          userId: session.user.id,
          ipAddress: (res.locals.clientIp as string | undefined) ?? null,
        });
        res.status(403).json({ error: "Invalid or missing security token." });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Choose one .doc, .docx, or .pdf policy file." });
        return;
      }
      if (!isAcceptedPolicyImportMime(file.mimetype)) {
        res.status(415).json({ error: `Unsupported file type. Choose ${POLICY_IMPORT_ACCEPT}.` });
        return;
      }

      try {
        const draft = await importPolicyDocument({ buffer: file.buffer, originalName: file.originalname });
        void recordActivity({
          actorUserId: session.user.id,
          actorRole: "admin",
          action: "policy.document_imported",
          entityType: "policy_import",
          entityId: draft.sha256.slice(0, 16),
          summary: `Converted ${draft.originalName} into a reviewable policy draft`,
          changes: { sourceType: draft.sourceType, sha256: draft.sha256, characterCount: draft.markdown.length },
          ipAddress: (res.locals.clientIp as string | undefined) ?? null,
        });
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json(draft);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The policy document could not be converted.";
        void recordSecurityEvent({
          eventType: "file.access_denied",
          outcome: "blocked",
          severity: "notice",
          message: `Policy import blocked: ${message}`,
          userId: session.user.id,
          ipAddress: (res.locals.clientIp as string | undefined) ?? null,
        });
        res.status(422).json({ error: message });
      }
    },
  );

  return router;
}
