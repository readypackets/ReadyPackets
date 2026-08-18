import { describe, expect, it } from "vitest";
import { assertValidEmailLinks, normalizeEmailTemplateVariables, renderTemplate } from "../server/services/email.js";

describe("transactional email links", () => {
  it("maps legacy link variables to canonical password-reset and verification template variables", () => {
    const resetLink = "https://myportal.readypackets.com/reset-password?token=example";
    const variables = normalizeEmailTemplateVariables({ name: "Customer", link: resetLink });
    const html = renderTemplate('<a href="{{resetUrl}}">Reset</a><a href="{{verifyUrl}}">Verify</a>', variables, true);
    expect(html).toContain(`href="${resetLink}"`);
    expect(html).not.toContain('href=""');
    assertValidEmailLinks(html);
  });

  it("rejects unresolved and unsafe action URLs before an email can be queued", () => {
    expect(() => assertValidEmailLinks('<a href="{{resetUrl}}">Reset</a>')).toThrow(/unresolved/i);
    expect(() => assertValidEmailLinks('<a href="javascript:alert(1)">Unsafe</a>')).toThrow(/unsafe/i);
    expect(() => assertValidEmailLinks('<a href="">Empty</a>')).toThrow(/unresolved/i);
  });

  it("accepts portal URLs containing HTML-escaped query separators", () => {
    const html = '<a href="https://myportal.readypackets.com/reset-password?token=one&amp;next=portal">Reset</a>';
    expect(() => assertValidEmailLinks(html)).not.toThrow();
  });
});
