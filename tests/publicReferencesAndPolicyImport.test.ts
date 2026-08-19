import { describe, expect, it } from "vitest";
import { generateCustomerNumber, generateOrderNumber } from "../server/security/crypto.js";
import { normalizePolicyTextToMarkdown } from "../server/services/policyImport.js";

describe("public customer and order references", () => {
  it("creates opaque RP-CUS customer references without sequential database identifiers", () => {
    const values = new Set(Array.from({ length: 200 }, () => generateCustomerNumber()));
    expect(values.size).toBe(200);
    for (const value of values) {
      expect(value).toMatch(/^RP-CUS-[A-Z0-9]{8}$/);
      expect(value).not.toMatch(/^RP-C\d{6}/);
      expect(value).not.toContain("0O");
    }
  });

  it("creates RP-ORD references from an RP-CUS token without exposing retired RP-C order numbers", () => {
    const reference = generateOrderNumber(new Date("2026-08-19T12:00:00.000Z"), "RP-CUS-7K4M2QPX");
    expect(reference).toMatch(/^RP-ORD-7K4M2QPX-2608-[A-Z0-9]{6}$/);
    expect(reference).not.toContain("RP-C000");
  });
});

describe("policy import normalization", () => {
  it("normalizes extracted document paragraphs into previewable website Markdown", () => {
    const markdown = normalizePolicyTextToMarkdown("PRIVACY POLICY\n\n1. Information We Collect\n\nWe protect customer information.\n\n2. Contact\n\nContact ReadyPackets.");
    expect(markdown).toContain("## PRIVACY POLICY");
    expect(markdown).toContain("## 1. Information We Collect");
    expect(markdown).toContain("We protect customer information.");
    expect(markdown).toContain("## 2. Contact");
  });
});
