/**
 * Admin SIEM Export page.
 * Allows downloading security and activity logs in CEF, JSON Lines, or syslog format.
 */
import { useState } from "react";
import { Download, Shield, Activity, Server } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select } from "@/components/ui/Field";
import { Card, CardHeader, Alert, Skeleton } from "@/components/ui/Surface";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

const FORMAT_OPTIONS = [
  { value: "jsonl", label: "JSON Lines (.jsonl)" },
  { value: "cef", label: "Common Event Format (.cef)" },
];

const LIMIT_OPTIONS = [
  { value: "100", label: "100 events" },
  { value: "500", label: "500 events" },
  { value: "1000", label: "1,000 events" },
  { value: "5000", label: "5,000 events" },
  { value: "10000", label: "10,000 events" },
];

export function AdminSIEMExport() {
  const toast = useToast();

  const [secFormat, setSecFormat] = useState<"jsonl" | "cef">("jsonl");
  const [secLimit, setSecLimit] = useState(1000);
  const [secFrom, setSecFrom] = useState("");
  const [secTo, setSecTo] = useState("");

  const [actLimit, setActLimit] = useState(1000);
  const [actFrom, setActFrom] = useState("");
  const [actTo, setActTo] = useState("");

  const [syslogLimit, setSyslogLimit] = useState(100);

  const secExport = trpc.siemExport.exportSecurityLogs.useQuery(
    { format: secFormat, from: secFrom || undefined, to: secTo || undefined, limit: secLimit },
    { enabled: false },
  );
  const actExport = trpc.siemExport.exportActivityLogs.useQuery(
    { from: actFrom || undefined, to: actTo || undefined, limit: actLimit },
    { enabled: false },
  );
  const syslogExport = trpc.siemExport.syslogExport.useQuery(
    { limit: syslogLimit },
    { enabled: false },
  );

  const downloadLines = (lines: string[], filename: string, mimeType: string) => {
    const blob = new Blob([lines.join("\n")], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSecExport = async () => {
    const result = await secExport.refetch();
    if (!result.data) { toast.error("Export failed", "No data returned."); return; }
    const ext = secFormat === "cef" ? "cef" : "jsonl";
    downloadLines(result.data.lines, `security-logs-${new Date().toISOString().slice(0, 10)}.${ext}`, "text/plain");
    toast.success("Exported", `${result.data.count} security events exported.`);
  };

  const handleActExport = async () => {
    const result = await actExport.refetch();
    if (!result.data) { toast.error("Export failed", "No data returned."); return; }
    downloadLines(result.data.lines, `activity-logs-${new Date().toISOString().slice(0, 10)}.jsonl`, "text/plain");
    toast.success("Exported", `${result.data.count} activity events exported.`);
  };

  const handleSyslogExport = async () => {
    const result = await syslogExport.refetch();
    if (!result.data) { toast.error("Export failed", "No data returned."); return; }
    downloadLines(result.data.lines, `syslog-${new Date().toISOString().slice(0, 10)}.log`, "text/plain");
    toast.success("Exported", `${result.data.count} syslog events exported.`);
  };

  return (
    <>
      <PageHeader
        title="SIEM export"
        description="Export security and activity logs for ingestion into a SIEM, log aggregator, or compliance archive."
      />

      <Alert tone="info" className="mb-6" title="Format guidance">
        CEF (Common Event Format) is compatible with ArcSight, Splunk, and most enterprise SIEMs.
        JSON Lines works with Elasticsearch, Datadog, and custom pipelines. Syslog (RFC 5424) is
        for direct forwarding to syslog receivers.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Security logs */}
        <Card>
          <CardHeader
            title="Security logs"
            description="Authentication, access control, and abuse events."
          />
          <div className="mt-4 space-y-4">
            <FieldShell label="Format">
              <Select
                value={secFormat}
                onChange={(e) => setSecFormat(e.target.value as "jsonl" | "cef")}
                options={FORMAT_OPTIONS}
              />
            </FieldShell>
            <FieldShell label="Limit">
              <Select
                value={String(secLimit)}
                onChange={(e) => setSecLimit(Number(e.target.value))}
                options={LIMIT_OPTIONS}
              />
            </FieldShell>
            <FieldShell label="From (UTC)" help="Optional ISO 8601 datetime">
              <Input
                type="datetime-local"
                value={secFrom}
                onChange={(e) => setSecFrom(e.target.value ? new Date(e.target.value).toISOString() : "")}
              />
            </FieldShell>
            <FieldShell label="To (UTC)">
              <Input
                type="datetime-local"
                value={secTo}
                onChange={(e) => setSecTo(e.target.value ? new Date(e.target.value).toISOString() : "")}
              />
            </FieldShell>
            <Button
              fullWidth
              onClick={handleSecExport}
              busy={secExport.isFetching}
              leadingIcon={<Download className="size-4" aria-hidden="true" />}
            >
              Export security logs
            </Button>
          </div>
        </Card>

        {/* Activity logs */}
        <Card>
          <CardHeader
            title="Activity logs"
            description="All admin and customer actions with change diffs."
          />
          <div className="mt-4 space-y-4">
            <FieldShell label="Format">
              <Input value="JSON Lines" disabled />
            </FieldShell>
            <FieldShell label="Limit">
              <Select
                value={String(actLimit)}
                onChange={(e) => setActLimit(Number(e.target.value))}
                options={LIMIT_OPTIONS}
              />
            </FieldShell>
            <FieldShell label="From (UTC)">
              <Input
                type="datetime-local"
                value={actFrom}
                onChange={(e) => setActFrom(e.target.value ? new Date(e.target.value).toISOString() : "")}
              />
            </FieldShell>
            <FieldShell label="To (UTC)">
              <Input
                type="datetime-local"
                value={actTo}
                onChange={(e) => setActTo(e.target.value ? new Date(e.target.value).toISOString() : "")}
              />
            </FieldShell>
            <Button
              fullWidth
              onClick={handleActExport}
              busy={actExport.isFetching}
              leadingIcon={<Download className="size-4" aria-hidden="true" />}
            >
              Export activity logs
            </Button>
          </div>
        </Card>

        {/* Syslog */}
        <Card>
          <CardHeader
            title="Syslog (RFC 5424)"
            description="Recent security events in syslog format for direct forwarding."
          />
          <div className="mt-4 space-y-4">
            <FieldShell label="Limit">
              <Select
                value={String(syslogLimit)}
                onChange={(e) => setSyslogLimit(Number(e.target.value))}
                options={[
                  { value: "50", label: "50 events" },
                  { value: "100", label: "100 events" },
                  { value: "500", label: "500 events" },
                  { value: "1000", label: "1,000 events" },
                ]}
              />
            </FieldShell>
            <Button
              fullWidth
              onClick={handleSyslogExport}
              busy={syslogExport.isFetching}
              leadingIcon={<Server className="size-4" aria-hidden="true" />}
            >
              Export syslog
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
