/**
 * tRPC request context.
 *
 * The context resolves the session before any procedure runs and exposes the
 * client address, so authorisation and audit logging never depend on values a
 * client can forge.
 */
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { resolveClientIp } from "../security/ipAddress.js";
import { resolveSession, type ActiveSession } from "../auth/session.js";

export interface AppContext {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  session: ActiveSession | null;
  clientIp: string;
  userAgent: string | null;
}

export async function createContext({
  req,
  res,
}: CreateExpressContextOptions): Promise<AppContext> {
  const session = await resolveSession(req);
  if (session) {
    res.locals.userId = session.user.id;
    res.locals.csrfSecret = session.csrfSecret;
  }
  return {
    req,
    res,
    session,
    clientIp: (res.locals.clientIp as string | undefined) ?? resolveClientIp(req),
    userAgent: req.headers["user-agent"]?.slice(0, 255) ?? null,
  };
}
