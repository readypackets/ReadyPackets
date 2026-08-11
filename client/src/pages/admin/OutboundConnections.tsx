/**
 * Admin Outbound Connections page — manage external HTTP connections.
 */
import { useState } from "react";
import { Plus, Plug, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/Surface";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

const emptyForm = { name: "", connectionType: "http", baseUrl: "", authType: "none" as const, credentials: "", timeoutMs: 10000 };

export function AdminOutboundConnections() {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [activeTab, setActiveTab] = useState<"connections" | "logs">("connections");

  const connections = trpc.tier3.outbound.listConnections.useQuery();
  const callLogs = trpc.tier3.outbound.callLogs.useQuery({ limit: 200 });
  const utils = trpc.useUtils();

  const createConn = trpc.tier3.outbound.createConnection.useMutation({
    onSuccess: () => { utils.tier3.outbound.listConnections.invalidate(); setCreateOpen(false); setForm({ ...emptyForm }); toast.success("Connection created"); },
    onError: (e) => toast.error("Error", e.message),
  });
  const toggleConn = trpc.tier3.outbound.toggleConnection.useMutation({
    onSuccess: () => utils.tier3.outbound.listConnections.invalidate(),
  });
  const deleteConn = trpc.tier3.outbound.deleteConnection.useMutation({
    onSuccess: () => { utils.tier3.outbound.listConnections.invalidate(); setDeleteId(null); toast.success("Connection deleted"); },
  });

  const connList = connections.data ?? [];
  const logList = callLogs.data ?? [];

  return (
    <>
      <PageHeader
        title="Outbound connections"
        description="Manage external HTTP connections and view call logs."
        actions={<Button onClick={() => setCreateOpen(true)} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New connection</Button>}
      />

      <div className="mb-4 flex gap-2 border-b border-line">
        {(["connections", "logs"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? "border-teal text-teal" : "border-transparent text-muted hover:text-ink"}`}>
            {tab === "connections" ? `Connections (${connList.length})` : `Call logs (${logList.length})`}
          </button>
        ))}
      </div>

      {activeTab === "connections" && (
        <Card>
          {connList.length === 0 ? (
            <EmptyState icon={Plug} title="No connections" description="Create outbound connections to integrate with external services." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Name</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Type</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Base URL</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Auth</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Last tested</th></tr></thead><tbody>
              {connList.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3 text-sm font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-3"><Badge>{c.connectionType}</Badge></td>
                  <td className="px-4 py-3 text-sm font-mono text-body max-w-xs truncate">{c.baseUrl ?? "—"}</td>
                  <td className="px-4 py-3"><Badge>{c.authType}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={c.enabled ? "success" : "neutral"}>{c.enabled ? "Enabled" : "Disabled"}</Badge></td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {c.lastTestedAt ? (
                      <span className={c.lastTestOk ? "text-success" : "text-danger"}>{c.lastTestOk ? "✓" : "✗"} {new Date(c.lastTestedAt).toLocaleDateString()}</span>
                    ) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" leadingIcon={c.enabled ? <ToggleRight className="size-4" aria-hidden="true" /> : <ToggleLeft className="size-4" aria-hidden="true" />} onClick={() => toggleConn.mutate({ id: c.id, enabled: !c.enabled })}>{c.enabled ? "Disable" : "Enable"}</Button>
                      <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setDeleteId(c.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}

      {activeTab === "logs" && (
        <Card>
          {logList.length === 0 ? (
            <EmptyState icon={Plug} title="No call logs" description="Outbound call logs will appear here." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Connection</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Method</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">URL</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Latency</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Date</th></tr></thead><tbody>
              {logList.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-4 py-3 text-sm text-body">#{l.connectionId}</td>
                  <td className="px-4 py-3"><Badge>{l.method}</Badge></td>
                  <td className="px-4 py-3 text-sm font-mono text-body max-w-xs truncate">{l.url}</td>
                  <td className="px-4 py-3"><Badge tone={l.statusCode && l.statusCode < 400 ? "success" : "danger"}>{l.statusCode ?? "error"}</Badge></td>
                  <td className="px-4 py-3 text-sm text-body tabular-nums">{l.latencyMs}ms</td>
                  <td className="px-4 py-3 text-sm text-muted">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New outbound connection" size="md">
        <div className="space-y-4">
          <FieldShell label="Name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FieldShell>
          <div className="grid grid-cols-2 gap-4">
            <FieldShell label="Connection type">
              <Select value={form.connectionType} onChange={(e) => setForm((f) => ({ ...f, connectionType: e.target.value }))}>
                {["http", "graphql", "rest", "soap", "grpc"].map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </FieldShell>
            <FieldShell label="Timeout (ms)"><Input type="number" min={100} max={60000} value={form.timeoutMs} onChange={(e) => setForm((f) => ({ ...f, timeoutMs: +e.target.value }))} /></FieldShell>
          </div>
          <FieldShell label="Base URL"><Input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://api.example.com" /></FieldShell>
          <FieldShell label="Authentication">
            <Select value={form.authType} onChange={(e) => setForm((f) => ({ ...f, authType: e.target.value as typeof form.authType }))}>
              {["none", "api_key", "bearer", "basic", "oauth2"].map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </FieldShell>
          {form.authType !== "none" && (
            <FieldShell label="Credentials" help="Stored encrypted. Enter API key, bearer token, or JSON credentials.">
              <Textarea value={form.credentials} onChange={(e) => setForm((f) => ({ ...f, credentials: e.target.value }))} rows={3} placeholder={form.authType === "basic" ? '{"username":"...","password":"..."}' : "your-api-key-or-token"} />
            </FieldShell>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createConn.mutate({ ...form, baseUrl: form.baseUrl || undefined, credentials: form.credentials || undefined })} busy={createConn.isPending} disabled={!form.name}>Create</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deleteConn.mutate({ id: deleteId }); }}
        title="Delete connection"
        message="This will permanently delete this outbound connection."
        confirmLabel="Delete"
        variant="danger"
        busy={deleteConn.isPending}
      />
    </>
  );
}
