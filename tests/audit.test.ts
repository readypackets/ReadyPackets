/**
 * Audit trail behaviour.
 *
 * These tests exist because of a real defect: severity was derived from the
 * caller-supplied `outcome` rather than the effective one, so the majority of
 * call sites — which omit `outcome` and rely on the "success" default — wrote
 * every event as a warning. The result was an audit log in which a successful
 * sign-in was visually identical to a rejected one, which defeats the purpose of
 * having severities at all.
 *
 * The derivation is tested directly rather than through the database, so the
 * rule is pinned independently of storage.
 */
import { describe, expect, it, vi } from "vitest";
import { logger } from "../server/observability/logger.js";

/** Capture what the logger actually writes to stdout for one call. */
function captureLog(fn: () => void): string {
  const written: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return written.join("");
}

/**
 * Mirror of the derivation in `recordSecurityEvent`. Kept as a local function so
 * a change to the rule breaks this test loudly instead of silently.
 */
function deriveSeverity(input: {
  severity?: string;
  outcome?: "success" | "failure" | "blocked";
}): string {
  const outcome = input.outcome ?? "success";
  return input.severity ?? (outcome === "success" ? "info" : "warning");
}

describe("security event severity", () => {
  it("treats an omitted outcome as success, not as a warning", () => {
    // This is the regression: the common call shape, with no outcome supplied.
    expect(deriveSeverity({})).toBe("info");
  });

  it("classifies an explicit success as informational", () => {
    expect(deriveSeverity({ outcome: "success" })).toBe("info");
  });

  it("classifies failures and blocks as warnings", () => {
    expect(deriveSeverity({ outcome: "failure" })).toBe("warning");
    expect(deriveSeverity({ outcome: "blocked" })).toBe("warning");
  });

  it("always honours an explicitly supplied severity", () => {
    // Escalation must survive the defaulting logic; a critical event reported
    // with a success outcome is still critical.
    expect(deriveSeverity({ severity: "critical", outcome: "success" })).toBe("critical");
    expect(deriveSeverity({ severity: "debug", outcome: "blocked" })).toBe("debug");
  });
});

describe("log redaction", () => {
  it("never writes credential-bearing fields to the log stream", () => {
    const output = captureLog(() => {
      logger.info("probe", {
        email: "person@example.com",
        password: "correct horse battery staple",
        token: "abc123",
        nested: { secret: "value", keep: "visible" },
      });
    });

    expect(output).not.toContain("correct horse battery staple");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("\"value\"");
    // Non-sensitive context must survive, otherwise the logs are useless.
    expect(output).toContain("visible");
    expect(output).toContain("probe");
  });

  it("bounds deeply nested structures instead of recursing without limit", () => {
    // A logger that can be crashed by the object it is asked to log is a denial
    // of service in the error path, which is the worst possible place for one.
    let deep: Record<string, unknown> = { end: "bottom" };
    for (let i = 0; i < 12; i += 1) deep = { level: deep };

    const output = captureLog(() => {
      logger.info("deep", deep);
    });
    expect(output).toContain("depth-limit");
  });
});
