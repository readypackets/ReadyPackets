/**
 * Microsoft Graph API email transport.
 *
 * Used as the primary transport when GRAPH_EMAIL_SENDER is configured.
 * Falls back to SMTP automatically if Graph fails or is not configured.
 * Requires the following Microsoft Entra app permissions:
 *   - Mail.Send (application permission, not delegated)
 *   - User.Read (for token validation)
 */
import { ClientSecretCredential } from "@azure/identity";
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";

interface GraphMailMessage {
  to: string;
  subject: string;
  html: string;
  text: string | null;
  fromName?: string;
}

/** Cached access token with expiry. */
let cachedToken: { value: string; expiresAt: number } | null = null;
let credential: ClientSecretCredential | null = null;

function getCredential(): ClientSecretCredential | null {
  if (!env.graph.enabled || !env.graph.emailEnabled) return null;
  if (!env.graph.tenantId || !env.graph.clientId || !env.graph.clientSecret) return null;
  if (credential) return credential;
  credential = new ClientSecretCredential(
    env.graph.tenantId,
    env.graph.clientId,
    env.graph.clientSecret,
  );
  return credential;
}

async function getAccessToken(): Promise<string | null> {
  const cred = getCredential();
  if (!cred) return null;

  // Return cached token if it has more than 60 seconds remaining.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  try {
    const tokenResponse = await cred.getToken("https://graph.microsoft.com/.default");
    if (!tokenResponse) return null;
    cachedToken = {
      value: tokenResponse.token,
      expiresAt: tokenResponse.expiresOnTimestamp,
    };
    return tokenResponse.token;
  } catch (error) {
    logger.error("Failed to obtain Microsoft Graph access token", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Send an email via Microsoft Graph API.
 * Returns true on success, false on failure (caller should fall back to SMTP).
 */
export async function sendViaGraph(message: GraphMailMessage): Promise<boolean> {
  if (!env.graph.emailEnabled || !env.graph.emailSender) return false;

  const token = await getAccessToken();
  if (!token) return false;

  const fromName = message.fromName ?? "ReadyPackets";
  const sender = env.graph.emailSender;

  const body = {
    message: {
      subject: message.subject,
      body: {
        contentType: "HTML",
        content: message.html,
      },
      toRecipients: [
        {
          emailAddress: { address: message.to },
        },
      ],
      from: {
        emailAddress: { address: sender, name: fromName },
      },
    },
    saveToSentItems: false,
  };

  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (response.status === 202) {
      return true;
    }

    const detail = await response.text().catch(() => "");
    logger.warn("Microsoft Graph sendMail returned non-202 status", {
      status: response.status,
      detail: detail.slice(0, 500),
    });
    return false;
  } catch (error) {
    logger.error("Microsoft Graph sendMail request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** True when Graph email transport is configured and credentials are present. */
export function isGraphEmailEnabled(): boolean {
  return (
    env.graph.emailEnabled &&
    Boolean(env.graph.emailSender) &&
    Boolean(env.graph.tenantId) &&
    Boolean(env.graph.clientId) &&
    Boolean(env.graph.clientSecret)
  );
}

/** Invalidate the cached credential (e.g. after a settings change). */
export function invalidateGraphCredential(): void {
  cachedToken = null;
  credential = null;
}
