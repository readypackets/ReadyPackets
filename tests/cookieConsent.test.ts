import { describe, expect, it } from "vitest";
import { normalizeCookiePreferences } from "../server/services/cookieConsent.js";

describe("cookie consent normalization", () => {
  it("keeps essential processing always enabled and defaults every optional category to off", () => {
    expect(normalizeCookiePreferences({}, { version: "2026.08.19", enabled: true, analyticsAvailable: false, marketingAvailable: false })).toEqual({
      essential: true,
      preferences: false,
      analytics: false,
      marketing: false,
    });
  });

  it("does not grant unavailable analytics or marketing consent even when a caller requests it", () => {
    expect(normalizeCookiePreferences({ preferences: true, analytics: true, marketing: true }, { version: "2026.08.19", enabled: true, analyticsAvailable: false, marketingAvailable: false })).toEqual({
      essential: true,
      preferences: true,
      analytics: false,
      marketing: false,
    });
  });

  it("preserves granular optional consent only for administrator-enabled categories", () => {
    expect(normalizeCookiePreferences({ preferences: true, analytics: true, marketing: false }, { version: "2026.08.19", enabled: true, analyticsAvailable: true, marketingAvailable: true })).toEqual({
      essential: true,
      preferences: true,
      analytics: true,
      marketing: false,
    });
  });
});
