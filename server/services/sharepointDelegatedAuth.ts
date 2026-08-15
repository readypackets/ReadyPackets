import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { sharepointDelegatedAuthAttempts } from "../db/schema.js";
import { affectedRows } from "../db/result.js";
import { decryptField, encryptField, hashToken, randomToken } from "../security/crypto.js";
import { getSetting, setSetting } from "./settings.js";

const GRAPH_SCOPES = [
  "offline_access",
  "https://graph.microsoft.com/Files.ReadWrite.All",
  "https://graph.microsoft.com/User.Read",
].join(" ");
const AUTH_ATTEMPT_TTL_MS = 10 * 60_000;

interface DelegatedTokenCache {
  token: string;
  expiresAt: number;
}

interface DelegatedTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

interface OAuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

let delegatedTokenCache: DelegatedTokenCache | null = null;
let delegatedSharePointRestTokenCache: DelegatedTokenCache | null = null;

async function delegatedSharePointRestScope(): Promise<string> {
  const siteUrl = (await getSetting("sharepoint.site_url"))?.trim();
  if (!siteUrl) throw new Error("Save the SharePoint site URL before authorizing the Microsoft 365 sync identity.");
  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    throw new Error("The saved SharePoint site URL is invalid for delegated synchronization.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || !hostname.endsWith(".sharepoint.com") || parsed.username || parsed.password || parsed.port) {
    throw new Error("The saved SharePoint site URL must be a secure *.sharepoint.com address.");
  }
  return `https://${hostname}/AllSites.Write`;
}

// Microsoft’s authorization-code exchange issues an access token for one
// resource audience. Keep initial authorization on Graph (used for profile
// verification); the renewable refresh token obtains the separately consented
// SharePoint REST audience only when audio synchronization runs.
function authorizationScopes(): string {
  return GRAPH_SCOPES;
}

export function delegatedSharePointCallbackUrl(): string {
  return new URL("/api/integrations/sharepoint/delegated/callback", env.appUrl).toString();
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

async function getOAuthConfig(): Promise<OAuthConfig> {
  const tenantId = (await getSetting("sharepoint.tenant_id")) || env.graph.tenantId || null;
  const clientId = (await getSetting("sharepoint.client_id")) || env.graph.clientId || null;
  const storedSecret = await getSetting("sharepoint.client_secret_enc");
  const clientSecret = storedSecret
    ? decryptField(storedSecret, "sharepoint.client_secret")
    : env.graph.clientSecret || null;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Save complete Microsoft Entra and SharePoint app settings before authorizing the sync identity.");
  }
  return { tenantId, clientId, clientSecret };
}

async function tokenRequest(config: OAuthConfig, body: URLSearchParams): Promise<DelegatedTokenResponse> {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const payload = await response.json().catch(() => ({})) as DelegatedTokenResponse;
  if (!response.ok || !payload.access_token) {
    const code = typeof payload.error === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(payload.error) ? payload.error : "authorization_failed";
    throw new Error(`Microsoft delegated SharePoint authorization failed (${code}, HTTP ${response.status}).`);
  }
  return payload;
}

export async function startDelegatedSharePointAuthorization(options: { initiatedByUserId: number; requestIp?: string | null }): Promise<{ authorizationUrl: string; expiresAt: Date }> {
  const [config, scope] = await Promise.all([getOAuthConfig(), Promise.resolve(authorizationScopes())]);
  const state = randomToken(32);
  const stateHash = hashToken(state);
  const codeVerifier = randomToken(64);
  const expiresAt = new Date(Date.now() + AUTH_ATTEMPT_TTL_MS);
  await db.insert(sharepointDelegatedAuthAttempts).values({
    stateHash,
    codeVerifierEnc: encryptField(codeVerifier, `sharepoint.delegated_attempt:${stateHash}`)!,
    initiatedByUserId: options.initiatedByUserId,
    requestIp: options.requestIp?.slice(0, 64) ?? null,
    expiresAt,
  });

  const authorizeUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`);
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", delegatedSharePointCallbackUrl());
  authorizeUrl.searchParams.set("response_mode", "query");
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "select_account");
  return { authorizationUrl: authorizeUrl.toString(), expiresAt };
}

export async function completeDelegatedSharePointAuthorization(input: { state: string; code: string }): Promise<{ account: string }> {
  const stateHash = hashToken(input.state);
  const rows = await db.select().from(sharepointDelegatedAuthAttempts).where(and(
    eq(sharepointDelegatedAuthAttempts.stateHash, stateHash),
    isNull(sharepointDelegatedAuthAttempts.consumedAt),
    gt(sharepointDelegatedAuthAttempts.expiresAt, new Date()),
  )).limit(1);
  const attempt = rows[0];
  if (!attempt) throw new Error("This Microsoft authorization request is invalid, expired, or already used.");
  const consumed = await db.update(sharepointDelegatedAuthAttempts)
    .set({ consumedAt: new Date() })
    .where(and(eq(sharepointDelegatedAuthAttempts.id, attempt.id), isNull(sharepointDelegatedAuthAttempts.consumedAt)));
  if (!affectedRows(consumed)) throw new Error("This Microsoft authorization request is no longer available.");

  const verifier = decryptField(attempt.codeVerifierEnc, `sharepoint.delegated_attempt:${stateHash}`);
  if (!verifier) throw new Error("The protected Microsoft authorization verifier could not be recovered.");
  const [config, scope] = await Promise.all([getOAuthConfig(), Promise.resolve(authorizationScopes())]);
  const tokens = await tokenRequest(config, new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: delegatedSharePointCallbackUrl(),
    code: input.code,
    code_verifier: verifier,
    scope,
  }));
  if (!tokens.refresh_token) throw new Error("Microsoft did not provide a renewable sync authorization. Ensure offline access was granted.");

  const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName,mail", {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
  });
  if (!profileResponse.ok) throw new Error("Microsoft authorized the token but did not allow the sync-account identity check.");
  const profile = await profileResponse.json() as { displayName?: string; userPrincipalName?: string; mail?: string };
  const account = [profile.displayName, profile.userPrincipalName ?? profile.mail].filter(Boolean).join(" — ").slice(0, 250) || "Microsoft 365 sync account";

  await Promise.all([
    setSetting("sharepoint.delegated_refresh_token_enc", encryptField(tokens.refresh_token, "sharepoint.delegated_refresh_token"), { category: "sharepoint", isSecret: true, userId: attempt.initiatedByUserId }),
    setSetting("sharepoint.delegated_account_enc", encryptField(account, "sharepoint.delegated_account"), { category: "sharepoint", isSecret: true, userId: attempt.initiatedByUserId }),
    setSetting("sharepoint.delegated_connected_at", new Date().toISOString(), { category: "sharepoint", userId: attempt.initiatedByUserId }),
    setSetting("sharepoint.delegated_last_error", null, { category: "sharepoint", userId: attempt.initiatedByUserId }),
  ]);
  delegatedTokenCache = { token: tokens.access_token!, expiresAt: Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000 };
  return { account };
}

export async function getDelegatedSharePointToken(): Promise<string> {
  if (delegatedTokenCache && Date.now() < delegatedTokenCache.expiresAt - 60_000) return delegatedTokenCache.token;
  const storedRefreshToken = await getSetting("sharepoint.delegated_refresh_token_enc");
  const refreshToken = decryptField(storedRefreshToken, "sharepoint.delegated_refresh_token");
  if (!refreshToken) throw new Error("A delegated Microsoft 365 sync identity has not been authorized. Connect the sync account in SharePoint settings.");
  const config = await getOAuthConfig();
  const tokens = await tokenRequest(config, new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES,
  }));
  if (tokens.refresh_token) {
    await setSetting("sharepoint.delegated_refresh_token_enc", encryptField(tokens.refresh_token, "sharepoint.delegated_refresh_token"), { category: "sharepoint", isSecret: true });
  }
  delegatedTokenCache = { token: tokens.access_token!, expiresAt: Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000 };
  return delegatedTokenCache.token;
}

/** Request a refresh-token-derived access token whose audience is SharePoint REST rather than Microsoft Graph. */
export async function getDelegatedSharePointRestToken(): Promise<string> {
  if (delegatedSharePointRestTokenCache && Date.now() < delegatedSharePointRestTokenCache.expiresAt - 60_000) return delegatedSharePointRestTokenCache.token;
  const storedRefreshToken = await getSetting("sharepoint.delegated_refresh_token_enc");
  const refreshToken = decryptField(storedRefreshToken, "sharepoint.delegated_refresh_token");
  if (!refreshToken) throw new Error("A delegated Microsoft 365 sync identity has not been authorized. Connect the sync account in SharePoint settings.");
  const [config, scope] = await Promise.all([getOAuthConfig(), delegatedSharePointRestScope()]);
  const tokens = await tokenRequest(config, new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    scope,
  }));
  if (tokens.refresh_token) {
    await setSetting("sharepoint.delegated_refresh_token_enc", encryptField(tokens.refresh_token, "sharepoint.delegated_refresh_token"), { category: "sharepoint", isSecret: true });
  }
  delegatedSharePointRestTokenCache = { token: tokens.access_token!, expiresAt: Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000 };
  return delegatedSharePointRestTokenCache.token;
}

export async function getDelegatedSharePointStatus(): Promise<{ connected: boolean; account: string | null; connectedAt: string | null; lastError: string | null }> {
  const [refreshStored, accountStored, connectedAt, lastError] = await Promise.all([
    getSetting("sharepoint.delegated_refresh_token_enc"),
    getSetting("sharepoint.delegated_account_enc"),
    getSetting("sharepoint.delegated_connected_at"),
    getSetting("sharepoint.delegated_last_error"),
  ]);
  return {
    connected: Boolean(decryptField(refreshStored, "sharepoint.delegated_refresh_token")),
    account: decryptField(accountStored, "sharepoint.delegated_account"),
    connectedAt,
    lastError: lastError ? lastError.slice(0, 240) : null,
  };
}

export async function disconnectDelegatedSharePointIdentity(userId: number): Promise<void> {
  delegatedTokenCache = null;
  delegatedSharePointRestTokenCache = null;
  await Promise.all([
    setSetting("sharepoint.delegated_refresh_token_enc", null, { category: "sharepoint", isSecret: true, userId }),
    setSetting("sharepoint.delegated_account_enc", null, { category: "sharepoint", isSecret: true, userId }),
    setSetting("sharepoint.delegated_connected_at", null, { category: "sharepoint", userId }),
    setSetting("sharepoint.delegated_last_error", null, { category: "sharepoint", userId }),
  ]);
}

export async function recordDelegatedSharePointError(message: string): Promise<void> {
  await setSetting("sharepoint.delegated_last_error", message.slice(0, 240), { category: "sharepoint" });
}
