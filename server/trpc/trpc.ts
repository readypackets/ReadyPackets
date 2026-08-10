/**
 * tRPC initialisation and the procedure guards that carry the authorisation
 * model. Guards are composed rather than duplicated, so a new router cannot
 * accidentally omit a check.
 *
 * Guard ladder:
 *   publicProcedure    — no session required
 *   sessionProcedure   — a session exists (may still be MFA-pending)
 *   protectedProcedure — session complete, email verified, password current
 *   staffProcedure     — staff or admin role
 *   adminProcedure     — admin role, MFA enrolled, optional IP allowlist
 */
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { getSettingBool } from "../services/settings.js";
import { isIpAllowlisted } from "../security/ipBlacklist.js";
import { ipMatchesAny } from "../security/ipAddress.js";
import { recordSecurityEvent } from "../observability/audit.js";
import { logger } from "../observability/logger.js";
import { raiseAlert } from "../observability/audit.js";
import type { AppContext } from "./context.js";

const t = initTRPC.context<AppContext>().create({
  errorFormatter({ shape, error }) {
    const isZod = error.cause instanceof ZodError;
    return {
      ...shape,
      message:
        error.code === "INTERNAL_SERVER_ERROR" && env.isProduction
          ? "An unexpected error occurred."
          : shape.message,
      data: {
        ...shape.data,
        // Field-level detail is safe to return; internal stacks are not.
        validation: isZod ? (error.cause as ZodError).flatten().fieldErrors : null,
        stack: undefined,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;

/** Convert an unexpected throw into an alert plus a generic client error. */
const errorReporting = middleware(async ({ path, type, next, ctx }) => {
  const result = await next();
  if (!result.ok) {
    const error = result.error;
    if (error.code === "INTERNAL_SERVER_ERROR") {
      logger.error("Unhandled procedure error", {
        path,
        type,
        error,
        userId: ctx.session?.user.id ?? null,
      });
      void raiseAlert({
        alertKey: `trpc:${path}`,
        severity: "error",
        source: "trpc",
        message: `Unhandled error in ${path}`,
        detail: error.message,
      });
    }
  }
  return result;
});

export const publicProcedure = t.procedure.use(errorReporting);

const requireSession = middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/** A session exists but may be incomplete: used by MFA challenge endpoints. */
export const sessionProcedure = publicProcedure.use(requireSession);

const requireCompleteSession = middleware(async ({ ctx, next }) => {
  const session = ctx.session;
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  if (session.mfaPending) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "MFA_REQUIRED",
    });
  }
  if (session.restricted) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "MFA_SETUP_REQUIRED",
    });
  }
  if (session.user.mustChangePassword) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "PASSWORD_CHANGE_REQUIRED",
    });
  }
  // Enforced server-side rather than in the client, so the API cannot be bypassed.
  if (!session.user.emailVerified) {
    const enforce = await getSettingBool("auth.require_email_verification", true);
    if (enforce) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "EMAIL_VERIFICATION_REQUIRED",
      });
    }
  }
  return next({ ctx: { ...ctx, session } });
});

export const protectedProcedure = publicProcedure.use(requireCompleteSession);

const requireStaff = middleware(async ({ ctx, next }) => {
  const session = ctx.session;
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    void recordSecurityEvent({
      eventType: "admin.access_denied",
      outcome: "blocked",
      severity: "warning",
      message: "Non-staff account attempted a staff operation",
      userId: session.user.id,
      ipAddress: ctx.clientIp,
    });
    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient privileges." });
  }
  return next({ ctx: { ...ctx, session } });
});

export const staffProcedure = protectedProcedure.use(requireStaff);

const requireAdmin = middleware(async ({ ctx, next }) => {
  const session = ctx.session;
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  if (session.user.role !== "admin") {
    void recordSecurityEvent({
      eventType: "admin.access_denied",
      outcome: "blocked",
      severity: "warning",
      message: "Non-admin account attempted an administrative operation",
      userId: session.user.id,
      ipAddress: ctx.clientIp,
    });
    throw new TRPCError({ code: "FORBIDDEN", message: "Administrator privileges required." });
  }

  // Gap analysis 3.6 / 5.5: administrators must hold a second factor.
  const enforceMfa = await getSettingBool("security.require_admin_mfa", true);
  if (enforceMfa && !session.user.mfaEnabled) {
    void recordSecurityEvent({
      eventType: "admin.mfa_required",
      outcome: "blocked",
      severity: "warning",
      message: "Administrator without MFA was denied admin access",
      userId: session.user.id,
      ipAddress: ctx.clientIp,
    });
    throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_MFA_REQUIRED" });
  }

  // Optional allowlist, from configuration and from the database.
  const envAllowlist = env.adminIpAllowlist;
  const dbAllowed = await isIpAllowlisted(ctx.clientIp, "admin");
  const allowlistActive = envAllowlist.length > 0 || dbAllowed;
  if (envAllowlist.length > 0 && !ipMatchesAny(ctx.clientIp, envAllowlist) && !dbAllowed) {
    void recordSecurityEvent({
      eventType: "admin.ip_denied",
      outcome: "blocked",
      severity: "critical",
      message: "Administrative access attempted from a non-allowlisted address",
      userId: session.user.id,
      ipAddress: ctx.clientIp,
    });
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied from this network." });
  }
  void allowlistActive;

  return next({ ctx: { ...ctx, session } });
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
