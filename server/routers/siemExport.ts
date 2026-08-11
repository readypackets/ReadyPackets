/**
 * SIEM / syslog export router.
 *
 * Provides a streaming export of security and activity logs in CEF (Common
 * Event Format) and JSON Lines formats, suitable for ingestion by Splunk,
 * Elastic SIEM, Datadog, or any syslog-compatible receiver.
 */
import { z } from "zod";
import { and, desc, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { activityLogs, securityLogs } from "../db/schema.js";
import { adminProcedure, router } from "../trpc/trpc.js";

const VENDOR = "ReadyPackets";
const PRODUCT = "Portal";
const VERSION = "2.0";

function toCef(row: {
  id: number;
  eventType: string;
  severity: string;
  message: string;
  ipAddress: string | null;
  createdAt: Date;
  metadata?: unknown;
}): string {
  const severityMap: Record<string, number> = {
    info: 3, notice: 5, warning: 7, critical: 10,
  };
  const cefSeverity = severityMap[row.severity] ?? 5;
  const ts = row.createdAt.toISOString();
  const ext = `rt=${ts} src=${row.ipAddress ?? "unknown"} msg=${row.message.replace(/\|/g, "\\|")}`;
  return `CEF:0|${VENDOR}|${PRODUCT}|${VERSION}|${row.eventType}|${row.message}|${cefSeverity}|${ext}`;
}

export const siemExportRouter = router({
  /** Export security logs in CEF or JSON Lines format. */
  exportSecurityLogs: adminProcedure
    .input(
      z.object({
        format: z.enum(["cef", "jsonl"]).default("jsonl"),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(10_000).default(1000),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input.from) conditions.push(gte(securityLogs.createdAt, new Date(input.from)));
      if (input.to) conditions.push(lte(securityLogs.createdAt, new Date(input.to)));

      const rows = await db
        .select()
        .from(securityLogs)
        .where(conditions.length > 0 ? and(...(conditions as [ReturnType<typeof gte>, ...ReturnType<typeof gte>[]])) : undefined)
        .orderBy(desc(securityLogs.createdAt))
        .limit(input.limit);

      if (input.format === "cef") {
        const lines = rows.map((row) =>
          toCef({
            id: row.id,
            eventType: row.eventType,
            severity: row.severity,
            message: row.message,
            ipAddress: row.ipAddress,
            createdAt: row.createdAt,
            metadata: row.metadata,
          }),
        );
        return { format: "cef" as const, lines, count: lines.length };
      }

      // JSON Lines
      const lines = rows.map((row) =>
        JSON.stringify({
          "@timestamp": row.createdAt.toISOString(),
          source: `${VENDOR}/${PRODUCT}`,
          event: {
            type: row.eventType,
            severity: row.severity,
            outcome: row.outcome,
          },
          message: row.message,
          user: { id: row.userId },
          network: { client: { ip: row.ipAddress } },
          metadata: row.metadata,
        }),
      );
      return { format: "jsonl" as const, lines, count: lines.length };
    }),

  /** Export activity logs in JSON Lines format. */
  exportActivityLogs: adminProcedure
    .input(
      z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(10_000).default(1000),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input.from) conditions.push(gte(activityLogs.createdAt, new Date(input.from)));
      if (input.to) conditions.push(lte(activityLogs.createdAt, new Date(input.to)));

      const rows = await db
        .select()
        .from(activityLogs)
        .where(conditions.length > 0 ? and(...(conditions as [ReturnType<typeof gte>, ...ReturnType<typeof gte>[]])) : undefined)
        .orderBy(desc(activityLogs.createdAt))
        .limit(input.limit);

      const lines = rows.map((row) =>
        JSON.stringify({
          "@timestamp": row.createdAt.toISOString(),
          source: `${VENDOR}/${PRODUCT}`,
          actor: { id: row.actorUserId, role: row.actorRole },
          action: row.action,
          entity: { type: row.entityType, id: row.entityId },
          summary: row.summary,
          network: { client: { ip: row.ipAddress } },
          changes: row.changes,
        }),
      );
      return { format: "jsonl" as const, lines, count: lines.length };
    }),

  /** Syslog-compatible summary: last N events as RFC 5424 messages. */
  syslogExport: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(1000).default(100) }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(securityLogs)
        .orderBy(desc(securityLogs.createdAt))
        .limit(input.limit);

      const facilityCode = 16; // local0
      const severityMap: Record<string, number> = {
        info: 6, notice: 5, warning: 4, critical: 2,
      };

      const lines = rows.map((row) => {
        const sev = severityMap[row.severity] ?? 6;
        const pri = facilityCode * 8 + sev;
        const ts = row.createdAt.toISOString();
        return `<${pri}>1 ${ts} readypackets ${PRODUCT} - ${row.eventType} - ${row.message}`;
      });

      return { lines, count: lines.length };
    }),
});
