import express, { type Request, type Response } from "express";
import { logger } from "../observability/logger.js";
import { recordActivity } from "../observability/audit.js";
import { completeDelegatedSharePointAuthorization } from "../services/sharepointDelegatedAuth.js";
import { resolveClientIp } from "../security/ipAddress.js";

function singleQueryValue(value: unknown, max = 8192): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > max) return null;
  return value;
}

/**
 * OAuth callback for the dedicated Microsoft 365 SharePoint sync account.
 * It relies on a single-use, hashed OAuth state record rather than a browser
 * session cookie, because strict SameSite cookies are intentionally not sent on
 * a cross-site Microsoft authorization redirect.
 */
export function createSharePointDelegatedAuthRouter(): express.Router {
  const router = express.Router();
  router.get("/delegated/callback", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    const state = singleQueryValue(req.query.state, 512);
    const code = singleQueryValue(req.query.code, 8192);
    const upstreamError = singleQueryValue(req.query.error, 128);
    if (!state || !code || upstreamError) {
      logger.warn("sharepoint.delegated.callback.rejected", { error: upstreamError ?? "invalid_callback", clientIp: resolveClientIp(req) });
      res.redirect(302, "/admin/integrations?sharepointDelegated=error");
      return;
    }
    try {
      const result = await completeDelegatedSharePointAuthorization({ state, code });
      void recordActivity({
        actorUserId: null,
        actorRole: "system",
        action: "sharepoint.delegated_sync_connected",
        entityType: "sharepoint",
        entityId: 0,
        summary: `A delegated Microsoft 365 sync identity was connected: ${result.account}`,
        ipAddress: resolveClientIp(req),
      });
      res.redirect(302, "/admin/integrations?sharepointDelegated=connected");
    } catch (error) {
      logger.warn("sharepoint.delegated.callback.failed", { error, clientIp: resolveClientIp(req) });
      res.redirect(302, "/admin/integrations?sharepointDelegated=error");
    }
  });
  return router;
}
