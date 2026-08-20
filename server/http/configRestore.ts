import type { Request, Response, Router } from "express";
import express from "express";
import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";
import { promises as fs } from "node:fs";
import multer from "multer";
import { resolveSession } from "../auth/session.js";
import { recordActivity, recordSecurityEvent } from "../observability/audit.js";
import { constantTimeEqual } from "../security/crypto.js";
import { CSRF_COOKIE, CSRF_HEADER } from "../security/csrf.js";

const BACKUP_CONTROL_SOCKET = "/run/readypackets/backup-control.sock";
const IMPORT_DIR = "/var/lib/readypackets/storage/config-restore-imports";
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const PENDING_TTL_MS = 10 * 60 * 1000;
const CONFIRMATION = "RESTORE CONFIGURATION";
const IMPORT_FILENAME = /^rpconfig-import-[a-f0-9]{32}\.rpconfig$/;

type PendingRestore = {
  filename: string;
  userId: number;
  expiresAt: number;
  manifest: RestoreManifest;
};

type RestoreManifest = {
  formatVersion: number;
  createdAt: string;
  applicationVersion: string;
  tableCount: number;
  contents: {
    applicationEnvironment: boolean;
    databaseConfiguration: boolean;
    customerData: boolean;
    orders: boolean;
    uploadedFiles: boolean;
    sessions: boolean;
    logs: boolean;
  };
};

const pendingRestores = new Map<string, PendingRestore>();

function assertNoLineBreaks(value: string, label: string) {
  if (/[\r\n]/.test(value)) throw new Error(`${label} must not contain line breaks.`);
}

function runBackupControl(action: "inspect-config" | "restore-config", filename: string, stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: BACKUP_CONTROL_SOCKET });
    let response = "";
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Configuration restore request timed out.")); }, 5 * 60_000);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify({ action, args: [filename], stdin })}\n`));
    socket.on("data", (chunk) => { response += chunk; if (response.includes("\n")) socket.end(); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    socket.once("close", () => {
      clearTimeout(timer);
      try {
        const payload = JSON.parse(response.trim()) as { ok?: boolean; output?: string; error?: string };
        payload.ok ? resolve((payload.output ?? "").trim()) : reject(new Error(payload.error ?? "Configuration restore was rejected."));
      } catch {
        reject(new Error("Configuration restore control returned an invalid response."));
      }
    });
  });
}

function parseManifest(output: string): RestoreManifest {
  let manifest: unknown;
  try { manifest = JSON.parse(output); } catch { throw new Error("The encrypted bundle did not return a valid restore manifest."); }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("The encrypted bundle manifest is invalid.");
  const value = manifest as Record<string, unknown>;
  const contents = value.contents;
  if (value.format !== "readypackets-config-migration" || typeof value.formatVersion !== "number" || typeof value.createdAt !== "string" || typeof value.applicationVersion !== "string" || !Array.isArray(value.tables) || !contents || typeof contents !== "object" || Array.isArray(contents)) {
    throw new Error("This file is not a valid ReadyPackets configuration bundle.");
  }
  const flags = contents as Record<string, unknown>;
  const expected = ["applicationEnvironment", "databaseConfiguration", "customerData", "orders", "uploadedFiles", "sessions", "logs"] as const;
  if (expected.some((key) => typeof flags[key] !== "boolean")) throw new Error("The configuration bundle manifest is incomplete.");
  return {
    formatVersion: value.formatVersion,
    createdAt: value.createdAt,
    applicationVersion: value.applicationVersion,
    tableCount: value.tables.length,
    contents: {
      applicationEnvironment: flags.applicationEnvironment as boolean,
      databaseConfiguration: flags.databaseConfiguration as boolean,
      customerData: flags.customerData as boolean,
      orders: flags.orders as boolean,
      uploadedFiles: flags.uploadedFiles as boolean,
      sessions: flags.sessions as boolean,
      logs: flags.logs as boolean,
    },
  };
}

async function requireAdmin(req: Request, res: Response) {
  const session = await resolveSession(req);
  if (!session || session.mfaPending || session.restricted || session.user.role !== "admin" || session.user.status !== "active") {
    res.status(403).json({ error: "A fully authenticated administrator session is required." });
    return null;
  }
  const headerToken = req.headers[CSRF_HEADER];
  const cookieToken = (req.cookies?.[CSRF_COOKIE] as string | undefined) ?? "";
  if (typeof headerToken !== "string" || !constantTimeEqual(headerToken, cookieToken) || !constantTimeEqual(headerToken, session.csrfSecret)) {
    void recordSecurityEvent({ eventType: "csrf.rejected", outcome: "blocked", severity: "warning", message: "Configuration restore rejected: invalid CSRF token", userId: session.user.id, ipAddress: (res.locals.clientIp as string | undefined) ?? null });
    res.status(403).json({ error: "Invalid or missing security token." });
    return null;
  }
  return session;
}

function purgeExpiredPendingRestores() {
  const now = Date.now();
  for (const [token, pending] of pendingRestores.entries()) {
    if (pending.expiresAt <= now) {
      pendingRestores.delete(token);
      void fs.unlink(path.join(IMPORT_DIR, pending.filename)).catch(() => undefined);
    }
  }
}

export function createConfigurationRestoreRouter(): Router {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 1, parts: 3 } });

  router.post("/preflight", (req, res, next) => {
    upload.single("file")(req, res, (error: unknown) => {
      if (!error) return next();
      const tooLarge = error instanceof Error && /file too large/i.test(error.message);
      res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? "Configuration bundles must be 5 MB or smaller." : "The configuration bundle could not be uploaded." });
    });
  }, async (req: Request, res: Response) => {
    const session = await requireAdmin(req, res);
    if (!session) return;
    purgeExpiredPendingRestores();
    const file = req.file;
    const passphrase = typeof req.body?.passphrase === "string" ? req.body.passphrase : "";
    if (!file || !file.originalname.toLowerCase().endsWith(".rpconfig")) {
      res.status(400).json({ error: "Choose one encrypted .rpconfig configuration bundle." });
      return;
    }
    if (passphrase.length < 16 || passphrase.length > 512 || /[\r\n]/.test(passphrase)) {
      res.status(400).json({ error: "Use a 16–512 character restore passphrase without line breaks." });
      return;
    }

    const filename = `rpconfig-import-${crypto.randomBytes(16).toString("hex")}.rpconfig`;
    const location = path.join(IMPORT_DIR, filename);
    try {
      await fs.writeFile(location, file.buffer, { mode: 0o600, flag: "wx" });
      const manifest = parseManifest(await runBackupControl("inspect-config", filename, `${passphrase}\n`));
      const restoreToken = crypto.randomBytes(32).toString("base64url");
      pendingRestores.set(restoreToken, { filename, userId: session.user.id, expiresAt: Date.now() + PENDING_TTL_MS, manifest });
      void recordActivity({ actorUserId: session.user.id, actorRole: "admin", action: "backup.configuration_restore_preflight", entityType: "configuration_restore", entityId: filename.slice(-16), severity: "warning", summary: "Administrator validated an encrypted configuration restore bundle", changes: { formatVersion: manifest.formatVersion, tableCount: manifest.tableCount, secretFree: !manifest.contents.applicationEnvironment }, ipAddress: (res.locals.clientIp as string | undefined) ?? null });
      res.setHeader("Cache-Control", "no-store").status(200).json({ restoreToken, expiresAt: new Date(Date.now() + PENDING_TTL_MS).toISOString(), manifest });
    } catch (error) {
      await fs.unlink(location).catch(() => undefined);
      const message = error instanceof Error ? error.message : "The encrypted configuration bundle could not be verified.";
      void recordSecurityEvent({ eventType: "file.access_denied", outcome: "blocked", severity: "notice", message: `Configuration restore preflight blocked: ${message}`, userId: session.user.id, ipAddress: (res.locals.clientIp as string | undefined) ?? null });
      res.status(422).json({ error: message });
    }
  });

  router.post("/apply", async (req: Request, res: Response) => {
    const session = await requireAdmin(req, res);
    if (!session) return;
    purgeExpiredPendingRestores();
    const restoreToken = typeof req.body?.restoreToken === "string" ? req.body.restoreToken : "";
    const passphrase = typeof req.body?.passphrase === "string" ? req.body.passphrase : "";
    const confirmation = typeof req.body?.confirmation === "string" ? req.body.confirmation : "";
    const pending = pendingRestores.get(restoreToken);
    if (!pending || pending.userId !== session.user.id || pending.expiresAt <= Date.now() || !IMPORT_FILENAME.test(pending.filename)) {
      res.status(400).json({ error: "This restore preflight has expired. Validate the encrypted bundle again before restoring." });
      return;
    }
    if (passphrase.length < 16 || passphrase.length > 512 || /[\r\n]/.test(passphrase) || confirmation !== CONFIRMATION) {
      res.status(400).json({ error: `Enter the restore passphrase and type ${CONFIRMATION} to continue.` });
      return;
    }
    try {
      const output = runBackupControl("restore-config", pending.filename, `${passphrase}\n${CONFIRMATION}\n`);
      pendingRestores.delete(restoreToken);
      const result = await output;
      const unit = /^unit=([A-Za-z0-9@._-]+)$/.exec(result)?.[1] ?? null;
      void recordActivity({ actorUserId: session.user.id, actorRole: "admin", action: "backup.configuration_restored", entityType: "configuration_restore", entityId: pending.filename.slice(-16), severity: "warning", summary: "Administrator applied a secret-free encrypted configuration restore", changes: { formatVersion: pending.manifest.formatVersion, tableCount: pending.manifest.tableCount, restartUnit: unit }, ipAddress: (res.locals.clientIp as string | undefined) ?? null });
      res.setHeader("Cache-Control", "no-store").status(202).json({ ok: true, restartUnit: unit, message: "Configuration settings were restored. The portal will restart momentarily; reload this page after about 15 seconds." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Configuration restore failed.";
      void recordSecurityEvent({ eventType: "file.access_denied", outcome: "blocked", severity: "warning", message: `Configuration restore failed: ${message}`, userId: session.user.id, ipAddress: (res.locals.clientIp as string | undefined) ?? null });
      res.status(422).json({ error: message });
    }
  });

  return router;
}
