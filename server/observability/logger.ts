/**
 * Structured application logger.
 *
 * Emits single-line JSON to stdout so that journald, Docker log drivers, or a
 * syslog forwarder can ingest it without extra parsing. A redaction pass
 * removes any key whose name suggests it holds a credential, and long strings
 * are truncated so a log line cannot be used to exfiltrate a payload.
 */
import { env } from "../config/env.js";
import type { LogSeverity } from "../../shared/domain.js";

const LEVEL_ORDER: Record<LogSeverity, number> = {
  debug: 10,
  info: 20,
  notice: 30,
  warning: 40,
  error: 50,
  critical: 60,
};

const MIN_LEVEL = LEVEL_ORDER[(env.logLevel as LogSeverity) in LEVEL_ORDER
  ? (env.logLevel as LogSeverity)
  : "info"];

const REDACT_PATTERN =
  /(pass|password|secret|token|authorization|cookie|session|key|otp|totp|mfa|csrf|signature|ssn|card)/i;

const MAX_STRING_LENGTH = 512;

export type LogContext = Record<string, unknown>;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: env.isProduction ? undefined : value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redact(entry, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = REDACT_PATTERN.test(key) ? "[redacted]" : redact(entry, depth + 1);
    }
    return output;
  }
  return String(value);
}

function write(severity: LogSeverity, message: string, context?: LogContext): void {
  if (LEVEL_ORDER[severity] < MIN_LEVEL) return;
  const line = {
    ts: new Date().toISOString(),
    level: severity,
    msg: message,
    ...(context ? { ctx: redact(context) as Record<string, unknown> } : {}),
  };
  const serialised = JSON.stringify(line);
  if (LEVEL_ORDER[severity] >= LEVEL_ORDER.error) process.stderr.write(`${serialised}\n`);
  else process.stdout.write(`${serialised}\n`);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  notice: (message: string, context?: LogContext) => write("notice", message, context),
  warn: (message: string, context?: LogContext) => write("warning", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
  critical: (message: string, context?: LogContext) => write("critical", message, context),
};
