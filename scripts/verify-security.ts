/**
 * Live security verification against a running server.
 *
 * This is a black-box check: it speaks HTTP to the application exactly as a
 * browser or an attacker would, and asserts on observable behaviour rather than
 * internal state. Every check maps to a specific finding class from the Batch 39
 * gap analysis, so a regression here is traceable to the control it breaks.
 *
 * Usage:  tsx scripts/verify-security.ts [baseUrl]
 */
import process from "node:process";

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";

/**
 * The application validates the Host header, and a loopback IP is not one of the
 * hostnames it serves. Requests are therefore addressed to the loopback socket
 * while presenting the canonical hostname, which is exactly what a reverse proxy
 * does in production.
 */
/** Header the application requires for the double-submit check. */
const CSRF_HEADER = "x-rp-csrf";

const target = new URL(BASE);
const HOST =
  target.hostname === "127.0.0.1" || target.hostname === "::1"
    ? `localhost:${target.port}`
    : target.host;

interface Result {
  area: string;
  name: string;
  passed: boolean;
  detail: string;
}

const results: Result[] = [];

function record(area: string, name: string, passed: boolean, detail: string): void {
  results.push({ area, name, passed, detail });
  const mark = passed ? "\u001b[32mPASS\u001b[0m" : "\u001b[31mFAIL\u001b[0m";
  console.log(`  ${mark}  ${name}`);
  if (!passed) console.log(`        ${detail}`);
}

async function request(
  path: string,
  init: RequestInit & { cookies?: string } = {},
): Promise<{ status: number; headers: Headers; body: string; cookies: string[] }> {
  const headers = new Headers(init.headers);
  if (init.cookies) headers.set("Cookie", init.cookies);
  // Undici forbids setting Host directly, so the hostname is placed in the URL
  // and resolution is pinned to the loopback socket the server listens on.
  const url = new URL(path, `${target.protocol}//${HOST}`);
  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  const body = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body,
    cookies: response.headers.getSetCookie(),
  };
}

/** Fetch the shell and extract the CSRF cookie plus its token value. */
async function bootstrapCsrf(): Promise<{ cookieHeader: string; token: string } | null> {
  const shell = await request("/");
  const cookies = shell.cookies;
  const csrf = cookies.find((cookie) => cookie.toLowerCase().includes("csrf"));
  if (!csrf) return null;
  const pair = csrf.split(";")[0] ?? "";
  const token = pair.split("=")[1] ?? "";
  return { cookieHeader: pair, token: decodeURIComponent(token) };
}

async function checkHeaders(): Promise<void> {
  console.log("\nSecurity response headers");
  const response = await request("/");

  const csp = response.headers.get("content-security-policy") ?? "";
  record(
    "headers",
    "Content-Security-Policy present",
    csp.length > 0,
    "No CSP header was returned.",
  );
  record(
    "headers",
    "CSP contains no 'unsafe-inline'",
    !csp.includes("unsafe-inline"),
    `CSP permits inline content: ${csp}`,
  );
  record(
    "headers",
    "CSP contains no 'unsafe-eval'",
    !csp.includes("unsafe-eval"),
    `CSP permits eval: ${csp}`,
  );
  record(
    "headers",
    "CSP uses a per-request nonce",
    /script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/.test(csp),
    "script-src has no nonce source.",
  );
  record(
    "headers",
    "CSP forbids framing (frame-ancestors 'none')",
    csp.includes("frame-ancestors 'none'"),
    "frame-ancestors is not locked down.",
  );
  record(
    "headers",
    "CSP pins object-src and base-uri to 'none'",
    csp.includes("object-src 'none'") && csp.includes("base-uri 'none'"),
    "object-src or base-uri is not 'none'.",
  );

  const expectations: [string, string][] = [
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["cross-origin-opener-policy", "same-origin"],
    ["cross-origin-resource-policy", "same-origin"],
    ["x-permitted-cross-domain-policies", "none"],
  ];
  for (const [header, expected] of expectations) {
    const actual = response.headers.get(header);
    record(
      "headers",
      `${header}: ${expected}`,
      actual?.toLowerCase() === expected.toLowerCase(),
      `Received "${actual ?? "nothing"}".`,
    );
  }

  record(
    "headers",
    "Permissions-Policy disables sensitive features",
    (response.headers.get("permissions-policy") ?? "").includes("camera=()"),
    "Permissions-Policy is missing or incomplete.",
  );
  record(
    "headers",
    "No server fingerprint headers",
    !response.headers.has("x-powered-by") && !response.headers.has("server"),
    "The response advertises the server technology.",
  );

  const nonceInHtml = /nonce="[A-Za-z0-9+/=]+"/.test(response.body);
  record(
    "headers",
    "HTML shell carries the injected nonce",
    nonceInHtml,
    "The served HTML has no nonce attribute, so the bundle would be blocked.",
  );
  record(
    "headers",
    "Nonce placeholder fully substituted",
    !response.body.includes("__CSP_NONCE__"),
    "An unsubstituted __CSP_NONCE__ placeholder remains in the HTML.",
  );
}

async function checkCookies(): Promise<void> {
  console.log("\nCookie attributes");
  const response = await request("/");
  const cookies = response.cookies;
  record("cookies", "A CSRF cookie is issued", cookies.length > 0, "No cookie was set.");

  for (const cookie of cookies) {
    const name = cookie.split("=")[0] ?? "cookie";
    const lower = cookie.toLowerCase();
    // The CSRF cookie is deliberately readable by script (double-submit), so
    // HttpOnly is asserted only for the session cookie.
    if (lower.includes("session")) {
      record("cookies", `${name} is HttpOnly`, lower.includes("httponly"), cookie);
    }
    record("cookies", `${name} has SameSite`, lower.includes("samesite"), cookie);
    record("cookies", `${name} is Path-scoped`, lower.includes("path=/"), cookie);
  }
}

async function checkCsrf(): Promise<void> {
  console.log("\nCSRF and origin validation");

  const noToken = await request("/api/trpc/auth.login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "probe@example.com", password: "Probe-Password-1!" }),
  });
  record(
    "csrf",
    "Mutation without a CSRF token is rejected",
    noToken.status === 403,
    `Expected 403, received ${noToken.status}.`,
  );

  const foreignOrigin = await request("/api/trpc/auth.login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ email: "probe@example.com", password: "Probe-Password-1!" }),
  });
  record(
    "csrf",
    "Mutation from a foreign Origin is rejected",
    foreignOrigin.status === 403,
    `Expected 403, received ${foreignOrigin.status}.`,
  );

  const bootstrap = await bootstrapCsrf();
  if (!bootstrap) {
    record("csrf", "CSRF token bootstrap", false, "No CSRF cookie was issued by the shell.");
    return;
  }

  const mismatched = await request("/api/trpc/auth.login", {
    method: "POST",
    cookies: bootstrap.cookieHeader,
    headers: {
      "Content-Type": "application/json",
      Origin: `${target.protocol}//${HOST}`,
      [CSRF_HEADER]: "not-the-right-token",
    },
    body: JSON.stringify({ email: "probe@example.com", password: "Probe-Password-1!" }),
  });
  record(
    "csrf",
    "Mismatched CSRF token is rejected",
    mismatched.status === 403,
    `Expected 403, received ${mismatched.status}.`,
  );

  const matched = await request("/api/trpc/auth.login", {
    method: "POST",
    cookies: bootstrap.cookieHeader,
    headers: {
      "Content-Type": "application/json",
      Origin: `${target.protocol}//${HOST}`,
      [CSRF_HEADER]: bootstrap.token,
    },
    body: JSON.stringify({ email: "probe@example.com", password: "Probe-Password-1!" }),
  });
  // A 401 (bad credentials) or 429 (auth budget already spent by the preceding
  // negative checks) both prove the request passed the CSRF gate; only a 403 means
  // the double submit itself failed.
  record(
    "csrf",
    "Matching CSRF token reaches the handler",
    matched.status !== 403,
    `Still rejected with ${matched.status}; the double-submit check may be misconfigured.`,
  );
}

async function checkAuthorisation(): Promise<void> {
  console.log("\nAuthorisation boundaries");

  const protectedPaths = [
    "orders.summary",
    "orders.list",
    "files.listForUser",
    "files.allowedTypes",
    "tickets.list",
    "account.profileFields",
  ];
  for (const path of protectedPaths) {
    const response = await request(`/api/trpc/${path}?input=%7B%7D`);
    const unauthorised =
      response.status === 401 || response.body.includes("UNAUTHORIZED");
    record(
      "authz",
      `${path} requires a session`,
      unauthorised,
      `Expected 401/UNAUTHORIZED, received ${response.status}: ${response.body.slice(0, 120)}`,
    );
  }

  const adminPaths = ["admin.dashboard", "adminSecurity.settings", "adminSecurity.apiKeys"];
  for (const path of adminPaths) {
    const response = await request(`/api/trpc/${path}?input=%7B%7D`);
    const denied =
      response.status === 401 ||
      response.status === 403 ||
      response.body.includes("UNAUTHORIZED") ||
      response.body.includes("FORBIDDEN");
    record(
      "authz",
      `${path} is not anonymously readable`,
      denied,
      `Received ${response.status}: ${response.body.slice(0, 120)}`,
    );
  }
}

async function checkHostValidation(): Promise<void> {
  console.log("\nHost header validation");
  // Addressed to the loopback socket without the canonical hostname, which is
  // how a host-header poisoning attempt or a stray scanner appears.
  const response = await fetch(`${BASE}/api/health`, { redirect: "manual" });
  record(
    "host",
    "Unrecognised Host header is refused",
    response.status === 421 || response.status === 400,
    `Expected 421, received ${response.status}.`,
  );
}

async function checkErrorHandling(): Promise<void> {
  console.log("\nError handling and information disclosure");

  const notFound = await request("/api/does-not-exist");
  record(
    "errors",
    "Unknown API path returns JSON, not the SPA",
    notFound.status === 404 && !notFound.body.includes("<!doctype html"),
    `Received ${notFound.status}: ${notFound.body.slice(0, 120)}`,
  );
  record(
    "errors",
    "Error bodies contain no stack traces",
    !/at\s+\w+\s+\(/.test(notFound.body),
    "A stack trace appears to be leaking to the client.",
  );

  // Aimed at a procedure with a required input schema, so a malformed payload
  // has to be rejected by validation rather than silently ignored.
  const badInput = await request("/api/trpc/public.policy?input=%7Bnot-json");
  record(
    "errors",
    "Malformed input is rejected cleanly",
    badInput.status >= 400 && badInput.status < 500,
    `Expected a 4xx, received ${badInput.status}: ${badInput.body.slice(0, 120)}`,
  );

  const wrongType = await request('/api/trpc/public.policy?input=%7B%22slug%22%3A12345%7D');
  record(
    "errors",
    "Type-mismatched input is rejected by validation",
    wrongType.status >= 400 && wrongType.status < 500,
    `Expected a 4xx, received ${wrongType.status}: ${wrongType.body.slice(0, 120)}`,
  );

  const traversal = await request("/../../etc/passwd");
  record(
    "errors",
    "Path traversal on static assets is refused",
    !traversal.body.includes("root:x:"),
    "A traversal attempt returned system file content.",
  );

  const dotfile = await request("/.env");
  record(
    "errors",
    "Dotfiles are not served",
    !dotfile.body.includes("SESSION_SECRET"),
    "The environment file is reachable over HTTP.",
  );
}

async function checkRateLimiting(): Promise<void> {
  console.log("\nRate limiting");

  // The health route is deliberately exempt from rate limiting so an orchestrator
  // probe can never be throttled; the catalogue is a normal rate-limited request.
  const first = await request("/api/trpc/public.catalog?input=%7B%7D");
  record(
    "ratelimit",
    "Rate limit headers are advertised",
    first.headers.has("x-ratelimit-limit"),
    "No X-RateLimit-Limit header was returned.",
  );
  record(
    "ratelimit",
    "Health probe is exempt from throttling",
    !(await request("/api/health")).headers.has("x-ratelimit-limit"),
    "The health endpoint is rate limited, which would break orchestrator probes.",
  );

  // Hammer the authentication category, which carries the tightest budget.
  const bootstrap = await bootstrapCsrf();
  let limited = false;
  let attempts = 0;
  for (let index = 0; index < 40 && !limited; index += 1) {
    attempts += 1;
    const response = await request("/api/trpc/auth.login", {
      method: "POST",
      cookies: bootstrap?.cookieHeader,
      headers: {
        "Content-Type": "application/json",
        Origin: `${target.protocol}//${HOST}`,
        ...(bootstrap ? { [CSRF_HEADER]: bootstrap.token } : {}),
      },
      body: JSON.stringify({
        email: `probe${index}@example.com`,
        password: "Probe-Password-1!",
      }),
    });
    if (response.status === 429) {
      limited = true;
      record(
        "ratelimit",
        `Login attempts are throttled (429 after ${attempts} attempts)`,
        true,
        "",
      );
      record(
        "ratelimit",
        "429 response carries Retry-After",
        response.headers.has("retry-after"),
        "No Retry-After header on the throttled response.",
      );
    }
  }
  if (!limited) {
    record(
      "ratelimit",
      "Login attempts are throttled",
      false,
      `No 429 after ${attempts} rapid login attempts.`,
    );
  }
}

async function checkPublicSurface(): Promise<void> {
  console.log("\nPublic surface");

  const catalog = await request("/api/trpc/public.catalog?input=%7B%7D");
  record(
    "public",
    "Catalogue is publicly readable",
    catalog.status === 200 && catalog.body.includes("packet"),
    `Received ${catalog.status}.`,
  );
  record(
    "public",
    "Catalogue response leaks no internal identifiers",
    !catalog.body.includes("passwordHash") && !catalog.body.includes("Enc\":"),
    "An encrypted or sensitive field appears in the public payload.",
  );

  const health = await request("/api/health");
  record(
    "public",
    "Health endpoint reveals no version or configuration",
    !health.body.includes("nodeVersion") && !health.body.includes("databaseUrl"),
    `Health payload is too verbose: ${health.body.slice(0, 120)}`,
  );
}

async function main(): Promise<void> {
  console.log(`ReadyPackets security verification against ${BASE}`);

  await checkHeaders();
  await checkCookies();
  await checkCsrf();
  await checkAuthorisation();
  await checkHostValidation();
  await checkErrorHandling();
  await checkPublicSurface();
  // Rate limiting runs last because it deliberately exhausts a budget.
  await checkRateLimiting();

  const failed = results.filter((result) => !result.passed);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed.`,
  );
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const failure of failed) {
      console.log(`  [${failure.area}] ${failure.name} — ${failure.detail}`);
    }
    process.exitCode = 1;
  }
}

await main();
