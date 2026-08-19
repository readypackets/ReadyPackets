import type { Request, Response } from "express";
import { z } from "zod";
import { getCurrentCookieConsent, saveCookieConsent } from "../services/cookieConsent.js";
import { resolveSession } from "../auth/session.js";
import { recordSecurityEvent } from "../observability/audit.js";

const consentInputSchema = z.object({
  preferences: z.boolean().optional(),
  analytics: z.boolean().optional(),
  marketing: z.boolean().optional(),
  action: z.enum(["accepted_all", "rejected_optional", "saved_preferences"]),
});

export async function getCookieConsent(req: Request, res: Response): Promise<void> {
  const current = await getCurrentCookieConsent(req);
  res.status(200).setHeader("Cache-Control", "no-store").json(current);
}

export async function savePublicCookieConsent(req: Request, res: Response): Promise<void> {
  const parsed = consentInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid cookie preferences." });
    return;
  }
  const session = await resolveSession(req);
  const saved = await saveCookieConsent(req, res, parsed.data, parsed.data.action, session?.user.id ?? null);
  void recordSecurityEvent({
    eventType: "privacy.cookie_consent_saved",
    outcome: "success",
    severity: "notice",
    message: `Saved ${parsed.data.action} cookie consent choice`,
    userId: session?.user.id ?? null,
    ipAddress: (res.locals.clientIp as string | undefined) ?? null,
    metadata: { version: saved.version, preferences: saved.preferences },
  });
  res.status(200).setHeader("Cache-Control", "no-store").json(saved);
}
