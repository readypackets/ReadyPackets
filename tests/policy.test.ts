/**
 * Password policy and IP address matching.
 *
 * The password tests cover the cases that actually cause account takeover in
 * practice: a password derived from the user's own email or name, a common
 * dictionary entry, and a keyboard sequence. The IP tests matter because the
 * blocklist and admin allowlist both depend on correct CIDR arithmetic, and an
 * off-by-one in a netmask silently widens or breaks an access rule.
 */
import { describe, expect, it } from "vitest";
import { evaluatePassword } from "../server/auth/passwordPolicy.js";
import {
  detectPatternType,
  ipMatchesAny,
  ipMatchesPattern,
} from "../server/security/ipAddress.js";
import type { PasswordPolicy } from "../server/services/settings.js";

const POLICY: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbols: 1,
  blockSequential: true,
};

describe("password policy", () => {
  it("accepts a strong password", () => {
    const result = evaluatePassword("Thicket-Marmalade-72!", POLICY);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("rejects a password below the minimum length", () => {
    const result = evaluatePassword("Short-1!", POLICY);
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ")).toContain("at least 12");
  });

  it("rejects a password above the maximum length", () => {
    const result = evaluatePassword(`Aa1!${"x".repeat(200)}`, POLICY);
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ")).toContain("no more than");
  });

  it("requires each configured character class", () => {
    expect(evaluatePassword("thicket-marmalade-72!", POLICY).valid).toBe(false);
    expect(evaluatePassword("THICKET-MARMALADE-72!", POLICY).valid).toBe(false);
    expect(evaluatePassword("Thicket-Marmalade-XY!", POLICY).valid).toBe(false);
    expect(evaluatePassword("ThicketMarmalade72", POLICY).valid).toBe(false);
  });

  it("rejects a well-known common password", () => {
    const result = evaluatePassword("Password123!", POLICY);
    expect(result.valid).toBe(false);
  });

  it("rejects a keyboard or numeric sequence", () => {
    const result = evaluatePassword("Qwertyuiop123!", POLICY);
    expect(result.valid).toBe(false);
  });

  it("rejects a password containing the user's email local part", () => {
    const result = evaluatePassword("Jrothstein-2026!", POLICY, {
      email: "jrothstein@example.com",
    });
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ").toLowerCase()).toContain("email");
  });

  it("rejects a password containing the user's name", () => {
    const result = evaluatePassword("Kowalski-Secure-1!", POLICY, {
      names: ["Anna", "Kowalski"],
    });
    expect(result.valid).toBe(false);
  });

  it("tolerates a missing context without throwing", () => {
    expect(() => evaluatePassword("Thicket-Marmalade-72!", POLICY, {})).not.toThrow();
    expect(
      evaluatePassword("Thicket-Marmalade-72!", POLICY, { names: [null, undefined] }).valid,
    ).toBe(true);
  });

  it("honours a relaxed policy when the operator configures one", () => {
    const relaxed: PasswordPolicy = {
      ...POLICY,
      minLength: 8,
      requireSymbols: 0,
      blockSequential: false,
    };
    expect(evaluatePassword("Marmalade7", relaxed).valid).toBe(true);
  });

  it("scores a longer, more varied password higher", () => {
    const weak = evaluatePassword("Aardvark-12!", POLICY).score;
    const strong = evaluatePassword("Thicket-Marmalade-Quixotic-72!", POLICY).score;
    expect(strong).toBeGreaterThanOrEqual(weak);
  });
});

describe("IP pattern classification", () => {
  it("recognises single addresses, CIDR ranges and wildcards", () => {
    expect(detectPatternType("203.0.113.7")).toBe("single");
    expect(detectPatternType("203.0.113.0/24")).toBe("cidr");
    expect(detectPatternType("2001:db8::1")).toBe("single");
  });
});

describe("IP matching", () => {
  it("matches an exact address", () => {
    expect(ipMatchesPattern("203.0.113.7", "203.0.113.7", "single")).toBe(true);
    expect(ipMatchesPattern("203.0.113.8", "203.0.113.7", "single")).toBe(false);
  });

  it("matches inside a /24 and excludes outside it", () => {
    expect(ipMatchesPattern("203.0.113.7", "203.0.113.0/24", "cidr")).toBe(true);
    expect(ipMatchesPattern("203.0.113.255", "203.0.113.0/24", "cidr")).toBe(true);
    expect(ipMatchesPattern("203.0.114.1", "203.0.113.0/24", "cidr")).toBe(false);
  });

  it("handles a non-byte-aligned prefix correctly", () => {
    // 10.0.0.0/12 covers 10.0.0.0 through 10.15.255.255 and nothing beyond.
    expect(ipMatchesPattern("10.15.255.255", "10.0.0.0/12", "cidr")).toBe(true);
    expect(ipMatchesPattern("10.16.0.0", "10.0.0.0/12", "cidr")).toBe(false);
  });

  it("treats /32 as a single host and /0 as everything", () => {
    expect(ipMatchesPattern("198.51.100.4", "198.51.100.4/32", "cidr")).toBe(true);
    expect(ipMatchesPattern("198.51.100.5", "198.51.100.4/32", "cidr")).toBe(false);
    expect(ipMatchesPattern("198.51.100.5", "0.0.0.0/0", "cidr")).toBe(true);
  });

  it("does not match an IPv6 address against an IPv4 range", () => {
    expect(ipMatchesPattern("2001:db8::1", "203.0.113.0/24", "cidr")).toBe(false);
  });

  it("rejects a malformed pattern rather than matching everything", () => {
    // Failing open here would silently disable an allowlist.
    expect(ipMatchesPattern("203.0.113.7", "not-an-address", "single")).toBe(false);
    expect(ipMatchesPattern("203.0.113.7", "203.0.113.0/99", "cidr")).toBe(false);
    expect(ipMatchesPattern("", "203.0.113.0/24", "cidr")).toBe(false);
  });

  it("matches against a list of patterns", () => {
    const patterns = ["198.51.100.0/24", "203.0.113.7"];
    expect(ipMatchesAny("198.51.100.200", patterns)).toBe(true);
    expect(ipMatchesAny("203.0.113.7", patterns)).toBe(true);
    expect(ipMatchesAny("192.0.2.1", patterns)).toBe(false);
    expect(ipMatchesAny("192.0.2.1", [])).toBe(false);
  });
});
