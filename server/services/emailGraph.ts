/**
 * Microsoft Graph API email transport.
 *
 * Settings are read from the database (email.graph_* keys) at call time,
 * falling back to environment variables. This means changes saved through
 * the admin panel take effect immediately without a service restart.
 *
 * Requires the following Microsoft Entra app permissions:
 *   - Mail.Send (application permission, not delegated)
 */
import { ClientSecretCredential } from "@azure/identity";
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";
import { getSetting } from "./settings.js";

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
/** Track the credential key so we can detect config changes. */
let credentialKey = "";

/** Read Graph config from DB settings, falling back to env vars. */
async function getGraphConfig(): Promise<{
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  emailSender: string | null;
}> {
  const [tenantId, clientId, clientSecret, emailSender] = await Promise.all([
    getSetting("email.graph_tenant_id").then((v) => v ?? env.graph.tenantId ?? null),
    getSetting("email.graph_client_id").then((v) => v ?? env.graph.clientId ?? null),
    getSetting("email.graph_client_secret").then((v) => v ?? env.graph.clientSecret ?? null),
    getSetting("email.graph_email_sender").then((v) => v ?? env.graph.emailSender ?? null),
  ]);
  return { tenantId, clientId, clientSecret, emailSender };
}

async function getAccessToken(): Promise<{ token: string; sender: string } | null> {
  const config = await getGraphConfig();
  if (!config.tenantId || !config.clientId || !config.clientSecret || !config.emailSender) {
    return null;
  }

  // Re-create credential if config changed.
  const newKey = `${config.tenantId}:${config.clientId}`;
  if (!credential || credentialKey !== newKey) {
    credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret,
    );
    credentialKey = newKey;
    cachedToken = null;
  }

  // Return cached token if it has more than 60 seconds remaining.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return { token: cachedToken.value, sender: config.emailSender };
  }

  try {
    const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
    if (!tokenResponse) return null;
    cachedToken = {
      value: tokenResponse.token,
      expiresAt: tokenResponse.expiresOnTimestamp,
    };
    return { token: tokenResponse.token, sender: config.emailSender };
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
  const tokenData = await getAccessToken();
  if (!tokenData) return false;

  const { token, sender } = tokenData;
  const fromName = message.fromName ?? "ReadyPackets";

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
export async function isGraphEmailEnabled(): Promise<boolean> {
  const config = await getGraphConfig();
  return Boolean(
    config.tenantId && config.clientId && config.clientSecret && config.emailSender,
  );
}

/** Invalidate the cached credential (e.g. after a settings change). */
export function invalidateGraphCredential(): void {
  cachedToken = null;
  credential = null;
  credentialKey = "";
}
