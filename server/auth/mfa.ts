/**
 * TOTP multi-factor authentication with single-use backup codes.
 *
 * Replay is prevented by recording the last accepted time step: a code that has
 * already been used cannot be presented again inside its validity window.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { db } from "../db/client.js";
import { userBackupCodes, userMfa } from "../db/schema.js";
import { decryptField, encryptField, generateBackupCode, hashToken } from "../security/crypto.js";
import { BRAND } from "../../shared/brand.js";

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // accept one step either side of now
const BACKUP_CODE_COUNT = 10;

function totpFor(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: BRAND.companyShortName,
    label,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export interface MfaEnrolment {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

/** Begin enrolment: generate a secret, store it unconfirmed, return a QR code. */
export async function beginMfaEnrolment(
  userId: number,
  accountLabel: string,
): Promise<MfaEnrolment> {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const encrypted = encryptField(secret, `mfa:${userId}`);
  if (!encrypted) throw new Error("Failed to encrypt MFA secret");

  await db
    .insert(userMfa)
    .values({ userId, secretEnc: encrypted, confirmedAt: null, lastUsedStep: null })
    .onDuplicateKeyUpdate({
      set: { secretEnc: encrypted, confirmedAt: null, lastUsedStep: null },
    });

  const totp = totpFor(secret, accountLabel);
  const otpauthUrl = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });

  return { secret, otpauthUrl, qrDataUrl };
}

async function loadSecret(userId: number): Promise<{ secret: string; lastStep: number | null } | null> {
  const rows = await db
    .select({ secretEnc: userMfa.secretEnc, lastUsedStep: userMfa.lastUsedStep })
    .from(userMfa)
    .where(eq(userMfa.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const secret = decryptField(row.secretEnc, `mfa:${userId}`);
  if (!secret) return null;
  return { secret, lastStep: row.lastUsedStep };
}

export interface TotpResult {
  valid: boolean;
  reason?: "no_secret" | "invalid" | "replayed";
}

/** Validate a TOTP code and burn its time step so it cannot be replayed. */
export async function verifyTotp(
  userId: number,
  code: string,
  accountLabel: string,
): Promise<TotpResult> {
  const stored = await loadSecret(userId);
  if (!stored) return { valid: false, reason: "no_secret" };

  const normalised = code.replace(/\s|-/g, "");
  if (!/^\d{6}$/.test(normalised)) return { valid: false, reason: "invalid" };

  const totp = totpFor(stored.secret, accountLabel);
  const delta = totp.validate({ token: normalised, window: WINDOW });
  if (delta === null) return { valid: false, reason: "invalid" };

  const step = Math.floor(Date.now() / 1000 / PERIOD_SECONDS) + delta;
  if (stored.lastStep !== null && step <= stored.lastStep) {
    return { valid: false, reason: "replayed" };
  }

  await db.update(userMfa).set({ lastUsedStep: step }).where(eq(userMfa.userId, userId));
  return { valid: true };
}

/** Confirm enrolment and issue the one-time backup codes. */
export async function confirmMfaEnrolment(
  userId: number,
  code: string,
  accountLabel: string,
): Promise<{ backupCodes: string[] }> {
  const result = await verifyTotp(userId, code, accountLabel);
  if (!result.valid) {
    throw new Error(
      result.reason === "replayed"
        ? "That code has already been used. Wait for the next code and try again."
        : "That verification code is not valid.",
    );
  }

  await db.update(userMfa).set({ confirmedAt: new Date() }).where(eq(userMfa.userId, userId));
  return { backupCodes: await regenerateBackupCodes(userId) };
}

export async function regenerateBackupCodes(userId: number): Promise<string[]> {
  await db.delete(userBackupCodes).where(eq(userBackupCodes.userId, userId));
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode());
  await db.insert(userBackupCodes).values(
    codes.map((code) => ({ userId, codeHash: hashToken(code) })),
  );
  return codes;
}

/** Consume a backup code. Each code is valid exactly once. */
export async function consumeBackupCode(userId: number, code: string): Promise<boolean> {
  const normalised = code.trim().toUpperCase();
  const candidate = normalised.includes("-")
    ? normalised
    : `${normalised.slice(0, 4)}-${normalised.slice(4)}`;

  const rows = await db
    .select({ id: userBackupCodes.id })
    .from(userBackupCodes)
    .where(
      and(
        eq(userBackupCodes.userId, userId),
        eq(userBackupCodes.codeHash, hashToken(candidate)),
        isNull(userBackupCodes.usedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return false;
  await db
    .update(userBackupCodes)
    .set({ usedAt: new Date() })
    .where(eq(userBackupCodes.id, row.id));
  return true;
}

export async function countUnusedBackupCodes(userId: number): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(userBackupCodes)
    .where(and(eq(userBackupCodes.userId, userId), isNull(userBackupCodes.usedAt)));
  return Number(rows[0]?.total ?? 0);
}

export async function disableMfa(userId: number): Promise<void> {
  await db.delete(userMfa).where(eq(userMfa.userId, userId));
  await db.delete(userBackupCodes).where(eq(userBackupCodes.userId, userId));
}

export async function hasConfirmedMfa(userId: number): Promise<boolean> {
  const rows = await db
    .select({ confirmedAt: userMfa.confirmedAt })
    .from(userMfa)
    .where(eq(userMfa.userId, userId))
    .limit(1);
  return Boolean(rows[0]?.confirmedAt);
}

/** Opaque identifier used as the TOTP label; avoids leaking the address in URLs. */
export function accountLabelFor(userId: number, email: string): string {
  const localPart = email.split("@")[0] ?? `user${userId}`;
  return `${localPart}@${BRAND.companyShortName.toLowerCase()}`;
}

/** Test seam. */
export function generateTestTotp(secret: string, label = "test"): string {
  return totpFor(secret, label).generate();
}

export function randomSecret(): string {
  const bytes = randomBytes(20);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new OTPAuth.Secret({ buffer }).base32;
}
