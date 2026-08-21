import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const text = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("native mobile contract safeguards", () => {
  it("publishes an OAuth 2.1 PKCE mobile boundary without exposing web tRPC", async () => {
    const [contract, router, oidc] = await Promise.all([
      text("mobile/api-contract/openapi.yaml"),
      text("server/http/mobile/index.ts"),
      text("server/auth/mobileOidc.ts"),
    ]);
    expect(contract).toContain("/authorize:");
    expect(contract).toContain("code_challenge_method");
    expect(contract).toContain("S256");
    expect(router).toContain('router.post("/token"');
    expect(router).not.toContain("/api/trpc");
    expect(oidc).toContain("createHash(\"sha256\")");
    expect(oidc).toContain("refresh_token_reuse_or_expiry");
  });

  it("uses purpose-built mobile order DTOs rather than raw internal order records", async () => {
    const router = await text("server/http/mobile/index.ts");
    expect(router).toContain("assertOrderAccess(summary.id");
    expect(router).not.toMatch(/import\s*\{[^}]*getOrderDetail/);
    expect(router).not.toMatch(/getOrderDetail\(summary\./);
    expect(router).toContain("publicOrderId");
    expect(router).toContain("currentStage");
  });

  it("keeps browser CSRF protection and exempts only the bearer/code mobile prefix", async () => {
    const csrf = await text("server/security/csrf.ts");
    expect(csrf).toContain('"/api/mobile/"');
    expect(csrf).toContain("CSRF_HEADER");
    expect(csrf).toContain("isAllowedHostname");
  });

  it("uses native secure storage and system-browser OAuth rather than a web wrapper", async () => {
    const [iosSecurity, iosAuth, androidStorage, androidAuth, iosReadme, androidReadme] = await Promise.all([
      text("mobile/ios/ReadyPackets/ReadyPacketsApp/Core/Security.swift"),
      text("mobile/ios/ReadyPackets/ReadyPacketsApp/Core/AuthCoordinator.swift"),
      text("mobile/android/app/src/main/java/com/readypackets/mobile/core/SecureTokenStore.kt"),
      text("mobile/android/app/src/main/java/com/readypackets/mobile/core/AuthCoordinator.kt"),
      text("mobile/ios/ReadyPackets/README.md"),
      text("mobile/android/README.md"),
    ]);
    expect(iosSecurity).toContain("kSecAttrAccessibleWhenUnlockedThisDeviceOnly");
    expect(iosAuth).toContain("ASWebAuthenticationSession");
    expect(androidStorage).toContain("EncryptedSharedPreferences");
    expect(androidAuth).toContain("CustomTabsIntent");
    expect(iosReadme).toMatch(/no cross-platform runtime/i);
    expect(androidReadme).toMatch(/does not include React Native/i);
  });
});
