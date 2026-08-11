/**
 * Express application assembly.
 *
 * Middleware order is deliberate and load-bearing:
 *   1. proxy trust and client IP resolution, so every later decision uses the real address
 *   2. HTTPS redirect, before anything reads a cookie
 *   3. security headers with a fresh per-request CSP nonce
 *   4. IP blacklist, the cheapest possible rejection
 *   5. body and cookie parsing with hard size limits
 *   6. rate limiting, which needs the parsed path but not the session
 *   7. CSRF and Origin validation for state-changing requests
 *   8. maintenance gate
 *   9. routes
 *  10. 404 and the error handler, which never leaks internals
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { env } from "./config/env.js";
import { appRouter } from "./routers/index.js";
import { createContext } from "./trpc/context.js";
import { securityHeadersMiddleware, httpsRedirectMiddleware } from "./security/headers.js";
import {
  CSRF_COOKIE,
  csrfMiddleware,
  generateCsrfToken,
  isAllowedHostname,
  setCsrfCookie,
} from "./security/csrf.js";
import { rateLimitMiddleware } from "./security/rateLimit.js";
import { ipBlacklistMiddleware } from "./security/ipBlacklist.js";
import { resolveClientIp } from "./security/ipAddress.js";
import { createDownloadRouter } from "./http/downloads.js";
import { createUploadRouter } from "./http/uploads.js";
import { createAvatarRouter } from "./http/avatar.js";
import { logger } from "./observability/logger.js";
import { getMaintenanceState } from "./services/settings.js";
import { handleStripeWebhook } from "./services/stripe.js";
import {
  handleAcs,
  handleLoginRedirect,
  handleLogout,
  handleMetadata,
} from "./auth/saml.js";
import { pingDatabase } from "./db/client.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate the built client assets.
 *
 * The layout differs between running from source (`server/app.ts`, so the build
 * is at `../client/dist`) and running the bundled artefact (`dist/server.js`,
 * so the build is at `../client/dist` relative to `dist/`, i.e. a sibling of
 * the bundle's parent). An explicit override exists for unusual installs.
 * Resolving this once at startup avoids a per-request filesystem probe.
 */
function resolveClientDist(): string {
  const candidates = [
    process.env.CLIENT_DIST_PATH,
    path.resolve(here, "..", "client", "dist"),
    path.resolve(here, "client", "dist"),
    path.resolve(process.cwd(), "client", "dist"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  // Fall back to the conventional path so the error message names something real.
  return path.resolve(here, "..", "client", "dist");
}

const clientDist = resolveClientDist();

/**
 * Serve index.html with the request's CSP nonce injected.
 *
 * The built HTML carries a `__CSP_NONCE__` placeholder on each script and style
 * tag. Substituting it per request is what allows a strict policy with no
 * `unsafe-inline` while still shipping a normal Vite bundle.
 */
async function serveIndex(req: Request, res: Response): Promise<void> {
  try {
    // Anonymous visitors need a CSRF token before they can register, reset a
    // password, or send a contact message. Issuing it with the shell keeps the
    // double-submit check available on the very first mutation, and an existing
    // token is never overwritten because a signed-in session is bound to it.
    if (!req.cookies?.[CSRF_COOKIE]) {
      setCsrfCookie(res, generateCsrfToken());
    }

    const nonce = (res.locals.cspNonce as string | undefined) ?? "";
    const html = await readFile(path.join(clientDist, "index.html"), "utf8");
    res
      .status(200)
      .type("text/html; charset=utf-8")
      .setHeader("Cache-Control", "no-store, must-revalidate")
      .send(html.replaceAll("__CSP_NONCE__", nonce));
  } catch (error) {
    logger.error("Failed to serve index.html", { error });
    res
      .status(503)
      .type("text/plain")
      .send("The application build is missing. Run the build step and restart the service.");
  }
}

export function createApp(): Express {
  const app = express();

  // Never advertise the framework.
  app.disable("x-powered-by");
  app.set("etag", false);

  // Trust only the configured number of proxy hops; an unbounded trust would let
  // a client forge X-Forwarded-For and defeat rate limiting and blocklists.
  if (env.trustProxyHops > 0) {
    app.set("trust proxy", env.trustProxyHops);
  } else {
    app.set("trust proxy", false);
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.clientIp = resolveClientIp(req);
    res.locals.requestStart = Date.now();
    next();
  });

  app.use(httpsRedirectMiddleware());

  // Reject a request whose Host header is not one we serve, which blocks
  // host-header poisoning and cache-key confusion.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const hostname = req.hostname || null;
    if (!isAllowedHostname(hostname)) {
      res.status(421).type("text/plain").send("Misdirected request");
      return;
    }
    next();
  });

  app.use(securityHeadersMiddleware());
  app.use(ipBlacklistMiddleware());

  // Health probes must stay cheap and must not require a session, but they also
  // must not disclose anything useful to an unauthenticated caller.
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/health/ready", async (_req: Request, res: Response) => {
    const databaseOk = await pingDatabase();
    res.status(databaseOk ? 200 : 503).json({ status: databaseOk ? "ready" : "degraded" });
  });

  // Stripe webhook: must receive the raw body before JSON parsing so the
  // signature can be verified. Registered here, before express.json().
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json", limit: "512kb" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        res.status(400).json({ error: "Missing Stripe-Signature header" });
        return;
      }
      try {
        const result = await handleStripeWebhook(req.body as Buffer, sig);
        res.json({ received: true, ...result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Webhook error";
        logger.warn("stripe.webhook.error", { error: msg });
        res.status(400).json({ error: msg });
      }
    }
  );

  app.use(
    express.json({
      limit: "256kb",
      // Reject a body that is not valid JSON before it reaches a handler.
      strict: true,
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());

  app.use(rateLimitMiddleware());
  app.use(csrfMiddleware());

  // Maintenance mode: the API and the site are closed to everyone except an
  // administrator, who must still be able to sign in to turn it off again.
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/health")) return next();
    const state = await getMaintenanceState();
    if (!state.enabled) return next();

    const isAdminPath =
      req.path.startsWith("/api/trpc/auth.") ||
      req.path.startsWith("/api/trpc/adminSecurity.") ||
      req.path === "/login" ||
      req.path.startsWith("/admin");

    if (isAdminPath) return next();

    if (req.path.startsWith("/api/")) {
      res.status(503).json({
        error: state.message,
        maintenance: true,
        estimatedCompletion: state.estimatedCompletion,
      });
      return;
    }

    // Static assets still load so the maintenance page can render correctly.
    if (/\.[a-z0-9]{2,6}$/i.test(req.path)) return next();
    res.status(503);
    await serveIndex(req, res);
  });

  // SAML SSO routes. These use form-encoded POST bodies (ACS) and plain GET
  // (metadata, login, logout), so they must be registered before the tRPC
  // handler and after the body parser.
  app.get("/api/saml/metadata", handleMetadata);
  app.get("/api/saml/login", handleLoginRedirect);
  app.post("/api/saml/acs", express.urlencoded({ extended: false }), handleAcs);
  app.get("/api/saml/logout", handleLogout);

  app.use("/api/files", createDownloadRouter());
  app.use("/api/files", createUploadRouter());
  app.use("/api/avatar", createAvatarRouter());

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path: procedurePath, type }) {
        // Client-caused errors are expected and stay at info level; anything else
        // is a real fault and must be visible in the log.
        if (error.code === "INTERNAL_SERVER_ERROR") {
          logger.error("tRPC procedure failed", {
            procedure: procedurePath,
            type,
            error: error.cause ?? error,
          });
        } else {
          logger.debug("tRPC procedure rejected", {
            procedure: procedurePath,
            code: error.code,
          });
        }
      },
    }),
  );

  // Any other /api path is a client mistake, and must not fall through to the SPA.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Static assets. Hashed bundle files are immutable; everything else is revalidated.
  app.use(
    express.static(clientDist, {
      index: false,
      dotfiles: "ignore",
      etag: true,
      lastModified: true,
      maxAge: 0,
      setHeaders(res, filePath) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (/\.[0-9a-f]{8,}\.(js|css|woff2?|png|svg|jpg|webp)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (/\.(png|svg|jpg|jpeg|webp|ico|woff2?)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=86400");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  // SPA fallback for GET only; a POST to an unknown path is an error, not a page.
  app.get("*", async (req: Request, res: Response) => {
    if (/\.[a-z0-9]{2,6}$/i.test(req.path)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    await serveIndex(req, res);
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).type("text/plain").send("Not found");
  });

  // Final error handler. The client is told nothing beyond a correlation id.
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const correlationId = Math.random().toString(36).slice(2, 12);
    logger.error("Unhandled request error", {
      correlationId,
      method: req.method,
      path: req.path,
      error,
    });

    if (res.headersSent) {
      res.destroy();
      return;
    }

    // A malformed JSON body is the caller's fault and deserves a 400.
    const isBodyError =
      error instanceof SyntaxError && "body" in (error as unknown as Record<string, unknown>);

    res
      .status(isBodyError ? 400 : 500)
      .json({
        error: isBodyError ? "Malformed request body." : "An unexpected error occurred.",
        correlationId,
      });
  });

  return app;
}
