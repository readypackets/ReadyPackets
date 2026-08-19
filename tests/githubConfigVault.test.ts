import { describe, expect, it } from "vitest";
import { validateGitHubVaultConfiguration } from "../server/services/githubConfigVault.js";

describe("GitHub configuration vault destination validation", () => {
  it("accepts a conventional private repository destination", () => {
    expect(validateGitHubVaultConfiguration({
      repository: "readypackets/private-configuration-vault",
      branch: "main",
      folder: "readypackets-platform-config/production",
      enabled: true,
    })).toEqual({
      repository: "readypackets/private-configuration-vault",
      branch: "main",
      folder: "readypackets-platform-config/production",
      enabled: true,
    });
  });

  it.each([
    [{ repository: "owner/repo/extra", branch: "main", folder: "vault" }],
    [{ repository: "owner/repo", branch: "../main", folder: "vault" }],
    [{ repository: "owner/repo", branch: "main", folder: "../vault" }],
    [{ repository: "owner/repo", branch: "main", folder: "vault//secrets" }],
    [{ repository: "owner/repo", branch: "main", folder: "vault/../../secret" }],
  ])("rejects unsafe GitHub vault location %#", (input) => {
    expect(() => validateGitHubVaultConfiguration(input)).toThrow();
  });
});
