/**
 * File download endpoint.
 *
 * A download is only reachable with a single-use ticket that was issued after an
 * ownership check in the tRPC layer, and the ticket is bound to the requesting
 * user, so a stolen URL cannot be replayed from another session. Every response
 * is sent as an attachment with `nosniff`, which prevents a stored SVG or HTML
 * payload from executing in the origin.
 */
import type { Request, Response, Router } from "express";
import express from "express";
import archiver from "archiver";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { files } from "../db/schema.js";
import { resolveSession } from "../auth/session.js";
import { consumeDownloadTicket, logFileAccess } from "../routers/files.js";
import { contentDisposition, getObjectStream, objectExists } from "../services/storage.js";
import { logger } from "../observability/logger.js";
import { recordSecurityEvent } from "../observability/audit.js";

export function createDownloadRouter(): Router {
  const router = express.Router();

  router.get("/download/:token", async (req: Request, res: Response) => {
    const token = req.params.token ?? "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      res.status(400).type("text/plain").send("Invalid download token");
      return;
    }

    const session = await resolveSession(req);
    if (!session || session.mfaPending || session.restricted) {
      res.status(401).type("text/plain").send("Authentication required");
      return;
    }

    const ticket = consumeDownloadTicket(token);
    if (!ticket) {
      res.status(410).type("text/plain").send("This download link has expired");
      return;
    }

    // A ticket issued to another account must never be honoured.
    if (ticket.userId !== session.user.id) {
      void recordSecurityEvent({
        eventType: "file.access_denied",
        outcome: "blocked",
        severity: "critical",
        message: "Download ticket presented by a different account",
        userId: session.user.id,
        ipAddress: (res.locals.clientIp as string | undefined) ?? null,
      });
      res.status(403).type("text/plain").send("Forbidden");
      return;
    }

    const rows = await db
      .select({
        id: files.id,
        storageKey: files.storageKey,
        originalName: files.originalName,
        detectedMime: files.detectedMime,
        sizeBytes: files.sizeBytes,
        isPlaceholder: files.isPlaceholder,
      })
      .from(files)
      .where(and(inArray(files.id, ticket.fileIds), isNull(files.deletedAt)));

    const deliverable = rows.filter((row) => !row.isPlaceholder);
    if (deliverable.length === 0) {
      res.status(404).type("text/plain").send("File not found");
      return;
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");

    // Single file: stream it directly.
    if (deliverable.length === 1 && !ticket.archiveName) {
      const file = deliverable[0]!;
      if (!(await objectExists(file.storageKey))) {
        logger.error("Stored object missing for file record", { fileId: file.id });
        res.status(404).type("text/plain").send("File not found");
        return;
      }

      // Always an attachment: never render user-supplied content in the origin.
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", contentDisposition(file.originalName));
      res.setHeader("Content-Length", String(file.sizeBytes));

      void logFileAccess(
        file.id,
        session.user.id,
        "download",
        (res.locals.clientIp as string | undefined) ?? null,
      );

      const stream = getObjectStream(file.storageKey);
      stream.on("error", (error) => {
        logger.error("Download stream failed", { error, fileId: file.id });
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });
      stream.pipe(res);
      return;
    }

    // Multiple files: build a ZIP on the fly, without buffering it in memory.
    const archiveName = ticket.archiveName ?? "readypackets-files.zip";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", contentDisposition(archiveName));

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("warning", (error) => {
      logger.warn("Archive warning during bulk download", { error });
    });
    archive.on("error", (error) => {
      logger.error("Archive failed during bulk download", { error });
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });

    archive.pipe(res);

    const usedNames = new Set<string>();
    for (const file of deliverable) {
      if (!(await objectExists(file.storageKey))) continue;
      // Disambiguate duplicate names so entries are not silently overwritten.
      let entryName = file.originalName.replace(/[/\\]/g, "_");
      if (usedNames.has(entryName)) {
        const dot = entryName.lastIndexOf(".");
        const base = dot > 0 ? entryName.slice(0, dot) : entryName;
        const ext = dot > 0 ? entryName.slice(dot) : "";
        entryName = `${base}-${file.id}${ext}`;
      }
      usedNames.add(entryName);
      archive.append(getObjectStream(file.storageKey), { name: entryName });
      void logFileAccess(
        file.id,
        session.user.id,
        "bulk_download",
        (res.locals.clientIp as string | undefined) ?? null,
      );
    }

    await archive.finalize();
  });

  return router;
}
