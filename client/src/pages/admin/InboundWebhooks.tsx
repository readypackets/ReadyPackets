/**
 * Admin Inbound Webhooks page — manage inbound webhook listeners and events.
 */
import { useState } from "react";
import { Plus, Webhook, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select } from "@/components/ui/Field";
import { Card, Badge, EmptyState } from "@/components/ui/Surface";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

export function AdminInboundWebhooks() {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"listeners" | "events">("listeners");
  const [form, setForm] = useState({ name: "", slug: "", eventType: "", handler: "log" });

  const listeners = trpc.tier3.inboundWebhook.listListeners.useQuery();
  const events = trpc.tier3.inboundWebhook.listEvents.useQuery({ limit: 200 });
  const utils = trpc.useUtils();

  const createListener = trpc.tier3.inboundWebhook.createListener.useMutation({
    onSuccess: () => { utils.tier3.inboundWebhook.listListeners.invalidate(); setCreateOpen(false); setForm({ name: "", slug: "", eventType: "", handler: "log" }); toast.success("Listener created"); },
    onError: (e) => toast.error("Error", e.message),
  });
  const toggleListener = trpc.tier3.inboundWebhook.toggleListener.useMutation({
    onSuccess: () => utils.tier3.inboundWebhook.listListeners.invalidate(),
  });
  const deleteListener = trpc.tier3.inboundWebhook.deleteListener.useMutation({
    onSuccess: () => { utils.tier3.inboundWebhook.listListeners.invalidate(); setDeleteId(null); toast.success("Listener deleted"); },
  });

  const listenerList = listeners.data ?? [];
  const eventList = events.data ?? [];

  return (
    <>
      <PageHeader
        title="Inbound webhooks"
        description="Receive and process webhook events from external services."
        actions={<Button onClick={() => setCreateOpen(true)} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New listener</Button>}
      />

      <div className="mb-4 flex gap-2 border-b border-line">
        {(["listeners", "events"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? "border-teal text-teal" : "border-transparent text-muted hover:text-ink"}`}>
            {tab === "listeners" ? `Listeners (${listenerList.length})` : `Events (${eventList.length})`}
          </button>
        ))}
      </div>

      {activeTab === "listeners" && (
        <Card>
          {listenerList.length === 0 ? (
            <EmptyState icon={Webhook} title="No listeners" description="Create listeners to receive inbound webhook events." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Name</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Slug / Endpoint</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Event type</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Handler</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th></tr></thead><tbody>
              {listenerList.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-4 py-3 text-sm font-medium text-ink">{l.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-body">/api/webhook/in/{l.slug}</td>
                  <td className="px-4 py-3 text-sm text-body">{l.eventType ?? "any"}</td>
                  <td className="px-4 py-3"><Badge>{l.handler}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={l.enabled ? "success" : "neutral"}>{l.enabled ? "Active" : "Disabled"}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" leadingIcon={l.enabled ? <ToggleRight className="size-4" aria-hidden="true" /> : <ToggleLeft className="size-4" aria-hidden="true" />} onClick={() => toggleListener.mutate({ id: l.id, enabled: !l.enabled })}>{l.enabled ? "Disable" : "Enable"}</Button>
                      <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setDeleteId(l.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}

      {activeTab === "events" && (
        <Card>
          {eventList.length === 0 ? (
            <EmptyState icon={Webhook} title="No events received" description="Inbound webhook events will appear here." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Listener</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Source IP</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Signature</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Processed</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Date</th></tr></thead><tbody>
              {eventList.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-3 text-sm text-body">#{e.listenerId}</td>
                  <td className="px-4 py-3 text-sm font-mono text-body">{e.sourceIp ?? "—"}</td>
                  <td className="px-4 py-3"><Badge tone={e.signatureValid === true ? "success" : e.signatureValid === false ? "danger" : "neutral"}>{e.signatureValid === null ? "unchecked" : e.signatureValid ? "valid" : "invalid"}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={e.processed ? "success" : "warning"}>{e.processed ? "Yes" : "No"}</Badge></td>
                  <td className="px-4 py-3 text-sm text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New inbound webhook listener" size="md">
        <div className="space-y-4">
          <FieldShell label="Name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FieldShell>
          <FieldShell label="Slug" help="Used in the endpoint URL: /api/webhook/in/{slug}" required>
            <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="my-service" />
          </FieldShell>
          <FieldShell label="Event type filter (optional)"><Input value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))} placeholder="e.g. payment.completed" /></FieldShell>
          <FieldShell label="Handler">
            <Select value={form.handler} onChange={(e) => setForm((f) => ({ ...f, handler: e.target.value }))}>
              {["log", "order_status", "payment_confirm", "custom"].map((h) => <option key={h} value={h}>{h}</option>)}
            </Select>
          </FieldShell>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createListener.mutate({ name: form.name, slug: form.slug, eventType: form.eventType || undefined, handler: form.handler })} busy={createListener.isPending} disabled={!form.name || !form.slug}>Create</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deleteListener.mutate({ id: deleteId }); }}
        title="Delete listener"
        message="This will permanently delete this webhook listener. Events already received will remain in the log."
        confirmLabel="Delete"
        variant="danger"
        busy={deleteListener.isPending}
      />
    </>
  );
}
