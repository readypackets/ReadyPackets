/**
 * Field encryption, blind indexing, password hashing and token generation.
 *
 * These are the primitives every other control depends on, so the tests assert
 * the security properties directly: ciphertext must not be deterministic, an
 * authentication tag must actually be checked, a blind index must not be
 * reversible to a plaintext comparison, and a tampered ciphertext must fail
 * rather than decrypt to garbage.
 */
import { describe, expect, it } from "vitest";
import {
  blindIndex,
  constantTimeEqual,
  decryptField,
  emailIndex,
  encryptField,
  generateBackupCode,
  generateOrderNumber,
  generateStorageKey,
  hashPassword,
  hashToken,
  needsRehash,
  randomToken,
  verifyPassword,
} from "../server/security/crypto.js";

describe("field encryption", () => {
  it("round-trips a value with its associated data", () => {
    const ciphertext = encryptField("Acme Holdings LLC", "customer:42");
    expect(ciphertext).not.toBeNull();
    expect(decryptField(ciphertext, "customer:42")).toBe("Acme Holdings LLC");
  });

  it("passes null through without producing ciphertext", () => {
    expect(encryptField(null, "customer:42")).toBeNull();
    expect(decryptField(null, "customer:42")).toBeNull();
  });

  it("never produces identical ciphertext for identical plaintext", () => {
    const first = encryptField("same value", "ctx");
    const second = encryptField("same value", "ctx");
    expect(first).not.toBe(second);
  });

  it("stores no plaintext in the ciphertext envelope", () => {
    const ciphertext = encryptField("supersecret@example.com", "user:7") ?? "";
    expect(ciphertext).not.toContain("supersecret");
    expect(ciphertext).not.toContain("example.com");
  });

  it("refuses to decrypt under different associated data", () => {
    const ciphertext = encryptField("bound to one row", "order_note:1");
    // Rebinding to another row must fail: this is what stops an attacker with
    // write access from moving a ciphertext between records.
    expect(decryptField(ciphertext, "order_note:2")).toBeNull();
  });

  it("rejects a tampered ciphertext rather than returning corrupt data", () => {
    const ciphertext = encryptField("integrity matters", "ctx") ?? "";
    const flipped = ciphertext.slice(0, -4) + (ciphertext.endsWith("A") ? "BBBB" : "AAAA");
    expect(decryptField(flipped, "ctx")).toBeNull();
  });

  it("rejects a malformed versioned envelope without throwing", () => {
    // A value carrying the version prefix but a broken body must fail closed.
    expect(decryptField("v1:garbage", "ctx")).toBeNull();
    expect(decryptField("v1:a:b:c:d:e", "ctx")).toBeNull();
    expect(decryptField("", "ctx")).toBeNull();
  });

  it("passes an unversioned legacy value through unchanged", () => {
    // Rows written before encryption was introduced must remain readable during
    // a migration rather than silently becoming null.
    expect(decryptField("legacy plaintext", "ctx")).toBe("legacy plaintext");
  });

  it("handles unicode and long values", () => {
    const value = `Ünïcödé ✓ ${"x".repeat(5_000)}`;
    const ciphertext = encryptField(value, "ctx");
    expect(decryptField(ciphertext, "ctx")).toBe(value);
  });
});

describe("blind index", () => {
  it("is deterministic so encrypted columns remain searchable", () => {
    expect(blindIndex("value")).toBe(blindIndex("value"));
  });

  it("differs for different inputs", () => {
    expect(blindIndex("a@example.com")).not.toBe(blindIndex("b@example.com"));
  });

  it("does not reveal the plaintext", () => {
    const index = emailIndex("Person@Example.COM");
    expect(index).not.toContain("Person");
    expect(index).not.toContain("example.com");
  });

  it("normalises email case and surrounding whitespace", () => {
    expect(emailIndex("  Person@Example.com ")).toBe(emailIndex("person@example.com"));
  });
});

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9!");
    expect(await verifyPassword(hash, "Correct-Horse-Battery-9!")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9!");
    expect(await verifyPassword(hash, "correct-horse-battery-9!")).toBe(false);
  });

  it("produces a distinct hash per call, proving the salt is random", async () => {
    const first = await hashPassword("Same-Password-1!");
    const second = await hashPassword("Same-Password-1!");
    expect(first).not.toBe(second);
  });

  it("does not embed the password in the hash", async () => {
    const hash = await hashPassword("Recognisable-Password-1!");
    expect(hash).not.toContain("Recognisable");
  });

  it("treats a corrupt stored hash as a failed verification", async () => {
    expect(await verifyPassword("not-a-real-hash", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
  });

  it("flags a legacy bcrypt hash for rehashing", async () => {
    const argon = await hashPassword("Modern-Password-1!");
    expect(needsRehash(argon)).toBe(false);
    expect(needsRehash("$2a$10$abcdefghijklmnopqrstuvwxyz012345678901234567890123")).toBe(true);
  });
});

describe("token and identifier generation", () => {
  it("produces unique high-entropy tokens", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => randomToken(32)));
    expect(tokens.size).toBe(500);
  });

  it("hashes tokens deterministically for storage", () => {
    const token = randomToken(32);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it("compares equal values in constant time and rejects mismatches", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    // Different lengths must not throw.
    expect(constantTimeEqual("abc", "abcdef")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("generates readable, unique backup codes", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateBackupCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-Z-]+$/);
    }
  });

  it("generates order numbers that are unique and non-sequential", () => {
    const numbers = Array.from({ length: 200 }, () => generateOrderNumber());
    // A guessable, incrementing order number would let a client enumerate other
    // customers' orders, so the suffix is random rather than a counter.
    expect(new Set(numbers).size).toBeGreaterThan(190);
    for (const number of numbers) {
      expect(number).toMatch(/^RP-\d{4}-[0-9A-F]{6}$/);
    }
  });

  it("generates storage keys that cannot escape the storage root", () => {
    // The key is derived from random bytes and a sanitised extension, so a
    // traversal sequence supplied by a client cannot survive into a path.
    const key = generateStorageKey("../../etc/passwd");
    expect(key).not.toContain("..");
    expect(key).not.toContain("/");
    expect(key.startsWith("/")).toBe(false);
  });

  it("generates a unique storage key on every call", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateStorageKey("pdf")));
    expect(keys.size).toBe(200);
    for (const key of keys) expect(key.endsWith(".pdf")).toBe(true);
  });
});
