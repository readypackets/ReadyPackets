/**
 * Typed API client.
 *
 * Every mutating request carries the CSRF token from the cookie in a custom
 * header, which is the read half of the double-submit pattern the server
 * enforces. `credentials: "same-origin"` is deliberate: cookies are never sent
 * cross-origin, so a malicious page cannot use an authenticated session.
 */
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@server/routers/index.js";

export const trpc = createTRPCReact<AppRouter>();

const CSRF_HEADER = "x-rp-csrf";

/** Read a cookie by name. Handles both the plain and `__Host-` prefixed forms. */
export function readCookie(name: string): string | null {
  const candidates = [`__Host-${name}`, name];
  const jar = document.cookie ? document.cookie.split("; ") : [];
  for (const candidate of candidates) {
    const prefix = `${candidate}=`;
    const found = jar.find((entry) => entry.startsWith(prefix));
    if (found) return decodeURIComponent(found.slice(prefix.length));
  }
  return null;
}

export function csrfToken(): string | null {
  return readCookie("rp_csrf");
}

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        // Batching keeps page loads to a single round trip.
        maxURLLength: 2_000,
        headers() {
          const token = csrfToken();
          return token ? { [CSRF_HEADER]: token } : {};
        },
        fetch(input, init) {
          return fetch(input, {
            ...init,
            credentials: "same-origin",
            // Never follow a redirect for an API call: a redirect to an
            // unexpected origin would be a sign of tampering.
            redirect: "error",
          });
        },
      }),
    ],
  });
}

/** Human-readable message from a tRPC error, without leaking internals. */
export function errorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const code = (error.data as { code?: string } | undefined)?.code;
    if (code === "UNAUTHORIZED") return "Please sign in to continue.";
    if (code === "FORBIDDEN") return error.message || "You do not have access to that.";
    if (code === "TOO_MANY_REQUESTS") {
      return error.message || "Too many attempts. Please wait a moment and try again.";
    }
    if (code === "INTERNAL_SERVER_ERROR") {
      return "Something went wrong on our side. Please try again.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}

/** True when an error means the session is gone and the user must sign in again. */
export function isAuthError(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    (error.data as { code?: string } | undefined)?.code === "UNAUTHORIZED"
  );
}
