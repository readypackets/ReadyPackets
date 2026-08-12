/**
 * Cryptographic primitives.
 *
 * Field encryption uses AES-256-GCM with a per-value random IV and binds the
 * owning record identifier as additional authenticated data, so a ciphertext
 * cannot be moved between rows. Searchable columns carry an HMAC-SHA256 blind
 * index because GCM ciphertext is not searchable.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import argon2 from "argon2";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

/** Encrypt a UTF-8 string. Returns `v1:<iv>:<tag>:<ciphertext>` in base64url parts. */
export function encryptField(plaintext: string | null | undefined, aad = ""): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, env.dataEncryptionKey, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * Decrypt a value produced by {@link encryptField}. Values that are not in the
 * versioned envelope format are returned unchanged, which allows a plaintext
 * install to be migrated to an encrypted one without a rewrite step.
 */
export function decryptField(stored: string | null | undefined, aad = ""): string | null {
  if (stored === null || stored === undefined || stored === "") return null;
  if (!stored.startsWith(`${VERSION}:`)) return stored;
  const parts = stored.split(":");
  if (parts.length !== 4) return null;
  const [, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      env.dataEncryptionKey,
      Buffer.from(ivPart, "base64url"),
    );
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    // Authentication failure means the value was tampered with or the key rotated.
    return null;
  }
}

/**
 * Deterministic, keyed index for an encrypted value. Case and surrounding
 * whitespace are normalised so that an email lookup behaves as users expect.
 */
export function blindIndex(value: string): string {
  return createHmac("sha256", env.emailIndexKey)
    .update(value.trim().toLowerCase(), "utf8")
    .digest("hex");
}

export const emailIndex = blindIndex;

/** Argon2id parameters chosen for a small VPS: ~64 MB, 3 passes. */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

/**
 * A pre-computed hash used to keep failed-login timing indistinguishable from
 * a successful lookup with a wrong password.
 */
const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against a stored hash. Supports Argon2id (current) and
 * bcrypt (legacy) so an existing install can migrate transparently.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    if (hash.startsWith("$argon2")) return await argon2.verify(hash, password);
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      return await bcrypt.compare(password, hash);
    }
    return false;
  } catch {
    return false;
  }
}

/** True when the stored hash should be upgraded to the current algorithm. */
export function needsRehash(hash: string): boolean {
  return !hash.startsWith("$argon2id$");
}

/** Burn equivalent CPU time when no account matched, defeating timing probes. */
export async function burnPasswordVerification(password: string): Promise<void> {
  try {
    await argon2.verify(DUMMY_ARGON2_HASH, password);
  } catch {
    /* expected: the dummy hash never matches */
  }
}

/** URL-safe random token, 32 bytes of entropy by default. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Opaque, non-sequential customer-facing account reference, e.g. RP-U-7F3A9D2C8B1E. */
export function generatePublicUserId(): string {
  return `RP-U-${randomBytes(6).toString("hex").toUpperCase()}`;
}

/** Tokens are persisted only as SHA-256 digests so a database leak is inert. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Human-transcribable backup code, e.g. `7K4M-2QPX`. */
export function generateBackupCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(0, alphabet.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** Sequential-looking but unguessable order number.
 * When customerNumber is supplied (e.g. RP-CUST-000002) the order number
 * embeds the customer ID: RP-C000002-2608-4F7QK2
 */
export function generateOrderNumber(date = new Date(), customerNumber?: string | null): string {
  const year = String(date.getUTCFullYear()).slice(2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const suffix = randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  if (customerNumber) {
    // Extract the numeric part from RP-CUST-000002 → C000002
    const custPart = customerNumber.replace(/^RP-CUST-/, "C");
    return `RP-${custPart}-${year}${month}-${suffix}`;
  }
  return `RP-${year}${month}-${suffix}`;
}

/**
 * Opaque storage key; never derived from user, order or file name.
 *
 * Only the final extension of the supplied value is considered, and every
 * character outside `[a-z0-9]` is discarded, so a caller who passes an entire
 * path such as `../../etc/passwd` cannot introduce a traversal sequence or a
 * second dot into the resulting key.
 */
export function generateStorageKey(extension = ""): string {
  const lastDot = extension.lastIndexOf(".");
  const candidate = lastDot === -1 ? extension : extension.slice(lastDot + 1);
  const clean = candidate
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 12);
  const suffix = clean ? `.${clean}` : "";
  return `${randomBytes(24).toString("hex")}${suffix}`;
}
