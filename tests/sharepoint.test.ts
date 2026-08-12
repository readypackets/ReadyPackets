import { describe, expect, it } from "vitest";
import { normalizeSharePointSiteUrl } from "../server/services/sharepoint.js";

describe("SharePoint site URL normalization", () => {
  it("accepts a tenant-root SharePoint URL and removes copied query/hash fragments", () => {
    expect(normalizeSharePointSiteUrl(" https://btkeys.sharepoint.com/?source=copy#section ")).toEqual({
      hostname: "btkeys.sharepoint.com",
      sitePath: "/",
      canonicalUrl: "https://btkeys.sharepoint.com/",
    });
  });

  it("accepts a server-relative site path", () => {
    expect(normalizeSharePointSiteUrl("https://contoso.sharepoint.com/sites/ReadyPackets/")).toEqual({
      hostname: "contoso.sharepoint.com",
      sitePath: "/sites/ReadyPackets",
      canonicalUrl: "https://contoso.sharepoint.com/sites/ReadyPackets",
    });
  });

  it("refuses non-SharePoint and credential-bearing URLs", () => {
    expect(() => normalizeSharePointSiteUrl("https://sharepoint.com/")).toThrow("HTTPS *.sharepoint.com");
    expect(() => normalizeSharePointSiteUrl("https://user:pass@contoso.sharepoint.com/")).toThrow("HTTPS *.sharepoint.com");
    expect(() => normalizeSharePointSiteUrl("https://contoso.sharepoint.com.evil.example/")).toThrow("HTTPS *.sharepoint.com");
  });
});
