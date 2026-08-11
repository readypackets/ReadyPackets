/**
 * Admin Integrations page.
 *
 * Covers: webhook endpoints, webhook delivery log, phase kickoff configuration,
 * phase job monitoring, SharePoint/Graph configuration status, and SAML SSO.
 */
import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Card } from "../../components/ui/Surface";
import { Button } from "../../components/ui/Button";
import { FieldShell as Field, Input, Select } from "../../components/ui/Field";
import { Tabs } from "../../components/ui/DataDisplay";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";

// ---------------------------------------------------------------------------
// Webhook endpoints tab
// ---------------------------------------------------------------------------

function WebhooksTab() {
  const { data: endpoints, refetch } = trpc.integrations.webhookEndpoints.useQuery();
  const upsert = trpc.integrations.upsertWebhookEndpoint.useMutation({ onSuccess: () => { refetch(); setOpen(false); } });
  const del = trpc.integrations.deleteWebhookEndpoint.useMutation({ onSuccess: () => refetch() });
  const test = trpc.integrations.testWebhookEndpoint.useMutation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NonNullable<typeof endpoints>[0] | null>(null);
  const [form, setForm] = useState({ name: "", url: "", events: "*", secret: "", enabled: true });

  function openNew() {
    setEditing(null);
    setForm({ name: "", url: "", events: "*", secret: "", enabled: true });
    setOpen(true);
  }

  function openEdit(ep: NonNullable<typeof endpoints>[0]) {
    setEditing(ep);
    const evts = ep.events as string[] | null;
    setForm({ name: ep.name, url: ep.url, events: evts?.join(", ") ?? "*", secret: "", enabled: ep.enabled });
    setOpen(true);
  }

  async function save() {
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        name: form.name,
        url: form.url,
        events: form.events.split(",").map(e => e.trim()).filter(Boolean),
        secret: form.secret || undefined,
        enabled: form.enabled,
      });
      toast.success("Webhook endpoint saved.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save.");
    }
  }

  async function sendTest(id: number) {
    try {
      const result = await test.mutateAsync({ endpointId: id });
      if (result.success) {
        toast.success(`Test delivered (HTTP ${result.statusCode}).`);
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Test failed.");
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openNew}>Add endpoint</Button>
      </div>

      <div className="space-y-3">
        {endpoints?.map((ep) => (
          <Card key={ep.id} className="flex items-start justify-between">
            <div>
              <p className="font-medium text-brand-navy">{ep.name}</p>
              <p className="text-sm font-mono text-gray-600 mt-0.5 break-all">{ep.url}</p>
              <p className="text-xs text-gray-400 mt-1">
                Events: {(ep.events as string[] | null)?.join(", ") ?? "*"} ·{" "}
                <span className={ep.enabled ? "text-green-700" : "text-gray-400"}>
                  {ep.enabled ? "Enabled" : "Disabled"}
                </span>
              </p>
            </div>
            <div className="flex gap-2 ml-4 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => sendTest(ep.id)}>Test</Button>
              <Button size="sm" variant="ghost" onClick={() => openEdit(ep)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => del.mutate({ id: ep.id })} className="text-red-600">Delete</Button>
            </div>
          </Card>
        ))}
        {!endpoints?.length && (
          <p className="text-center text-gray-400 py-8">No webhook endpoints configured.</p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit endpoint" : "New webhook endpoint"}>
        <div className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="URL">
            <Input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://your-server.com/webhook" />
          </Field>
          <Field label="Events (comma-separated, * for all)">
            <Input value={form.events} onChange={e => setForm(f => ({ ...f, events: e.target.value }))} placeholder="order.phase_changed, *" />
          </Field>
          <Field label="Secret (leave blank to keep existing)">
            <Input type="password" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="Optional HMAC signing secret" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
            Enabled
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} busy={upsert.isPending}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delivery log tab
// ---------------------------------------------------------------------------

function DeliveryLogTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { data, refetch } = trpc.integrations.webhookDeliveries.useQuery({ page, status: status || undefined });
  const retry = trpc.integrations.retryWebhookDelivery.useMutation({ onSuccess: () => refetch() });
  const toast = useToast();

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-40">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Event</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Attempts</th>
              <th className="py-2 pr-4">Response</th>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((d) => (
              <tr key={d.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4 font-mono text-xs">{d.eventType}</td>
                <td className="py-2 pr-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    d.status === "delivered" ? "bg-green-100 text-green-800" :
                    d.status === "failed" ? "bg-red-100 text-red-800" :
                    "bg-yellow-100 text-yellow-800"
                  }`}>
                    {d.status}
                  </span>
                </td>
                <td className="py-2 pr-4">{d.attempts}</td>
                <td className="py-2 pr-4">{d.responseCode ?? "—"}</td>
                <td className="py-2 pr-4 text-gray-500">
                  {new Date(d.createdAt).toLocaleDateString()}
                </td>
                <td className="py-2">
                  {(d.status === "failed" || d.status === "pending") && (
                    <button
                      onClick={() => retry.mutate({ deliveryId: d.id })}
                      className="text-brand-teal text-xs hover:underline"
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!data?.rows.length && (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">No deliveries.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > 50 && (
        <div className="flex justify-between items-center mt-4">
          <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-gray-500">Page {page} of {Math.ceil(data.total / 50)}</span>
          <Button variant="ghost" size="sm" disabled={page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase kickoff config tab
// ---------------------------------------------------------------------------

function PhaseKickoffTab() {
  const { data, refetch } = trpc.integrations.phaseKickoffConfigs.useQuery();
  const upsert = trpc.integrations.upsertPhaseKickoffConfig.useMutation({ onSuccess: () => refetch() });
  const toast = useToast();

  const phases = [
    { key: "phase_1_intake", label: "Phase I — Intake" },
    { key: "phase_2_synthesis", label: "Phase II — Synthesis" },
    { key: "in_production", label: "In Production" },
    { key: "delivered", label: "Delivered" },
  ];

  async function toggle(phase: string, field: string, value: boolean) {
    const existing = data?.find(c => c.phase === phase);
    try {
      await upsert.mutateAsync({
        phase,
        createFolders: field === "createFolders" ? value : (existing?.createFolders ?? true),
        attachPlaceholders: field === "attachPlaceholders" ? value : (existing?.attachPlaceholders ?? true),
        notifyCustomer: field === "notifyCustomer" ? value : (existing?.notifyCustomer ?? true),
        notifyWebhooks: field === "notifyWebhooks" ? value : (existing?.notifyWebhooks ?? false),
        completionPercent: (existing as any)?.completionPercent ?? 0,
        enabled: field === "enabled" ? value : (existing?.enabled ?? true),
      });
      toast.success("Config updated.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update.");
    }
  }

  async function setCompletionPercent(phase: string, value: number) {
    const existing = data?.find(c => c.phase === phase);
    try {
      await upsert.mutateAsync({
        phase,
        createFolders: existing?.createFolders ?? true,
        attachPlaceholders: existing?.attachPlaceholders ?? true,
        notifyCustomer: existing?.notifyCustomer ?? true,
        notifyWebhooks: existing?.notifyWebhooks ?? false,
        completionPercent: value,
        enabled: existing?.enabled ?? true,
      });
      toast.success("Auto-completion % saved.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update.");
    }
  }

  return (
    <div className="space-y-4">
      {phases.map(({ key, label }) => {
        const config = data?.find(c => c.phase === key);
        return (
          <Card key={key}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-brand-navy">{label}</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config?.enabled ?? true}
                  onChange={e => toggle(key, "enabled", e.target.checked)}
                />
                Enabled
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { field: "createFolders", label: "Create SharePoint folders" },
                { field: "attachPlaceholders", label: "Attach placeholder files" },
                { field: "notifyCustomer", label: "Send customer notification email" },
                { field: "notifyWebhooks", label: "Fire webhook notifications" },
              ].map(({ field, label: flabel }) => (
                <label key={field} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(config as any)?.[field] ?? (field === "notifyWebhooks" ? false : true)}
                    onChange={e => toggle(key, field, e.target.checked)}
                    disabled={!config?.enabled && config !== undefined}
                  />
                  {flabel}
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <label className="text-gray-600 shrink-0">Auto-set completion % on entry:</label>
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={(config as any)?.completionPercent ?? 0}
                onBlur={e => setCompletionPercent(key, Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <span className="text-gray-400 text-xs">% (0 = do not auto-set)</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SharePoint status tab
// ---------------------------------------------------------------------------

function SharePointTab() {
  const { data } = trpc.integrations.graphConfig.useQuery();
  const samlConfig = trpc.adminSecurity.samlConfig.useQuery();

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold text-brand-navy mb-3">Microsoft Graph / SharePoint</h3>
        {data?.enabled ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="text-green-700 font-medium">Connected</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tenant ID</span>
              <span className="font-mono">{data.tenantId ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Client ID</span>
              <span className="font-mono">{data.clientId ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Site ID</span>
              <span className="font-mono text-xs">{data.siteId ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Root folder</span>
              <span className="font-mono text-xs">{data.rootFolderPath}</span>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              SharePoint integration is not configured. Set the following environment variables to enable automatic folder creation and placeholder file attachment on phase transitions.
            </p>
            <div className="bg-gray-50 rounded p-3 font-mono text-xs space-y-1">
              <p>GRAPH_TENANT_ID=your-azure-tenant-id</p>
              <p>GRAPH_CLIENT_ID=your-app-client-id</p>
              <p>GRAPH_CLIENT_SECRET=your-app-client-secret</p>
              <p>GRAPH_SHAREPOINT_SITE_ID=your-site-id</p>
              <p>GRAPH_SHAREPOINT_DRIVE_ID=your-drive-id</p>
              <p>GRAPH_ROOT_FOLDER_PATH=ReadyPackets/Orders</p>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold text-brand-navy mb-3">SAML SSO</h3>
        {samlConfig.data ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className={samlConfig.data.enabled ? "text-green-700 font-medium" : "text-gray-500"}>
                {samlConfig.data.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span>{samlConfig.data.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Entry point</span>
              <span className="font-mono text-xs truncate max-w-xs">{samlConfig.data.entryPoint}</span>
            </div>
            <div className="mt-3 p-3 bg-gray-50 rounded text-xs font-mono">
              <p className="text-gray-500 mb-1">SP Metadata URL (register with your IdP):</p>
              <p>{window.location.origin}/api/saml/metadata</p>
              <p className="text-gray-500 mt-2 mb-1">ACS URL:</p>
              <p>{window.location.origin}/api/saml/acs</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            No SAML configuration found. Configure it in Admin → Security → SAML SSO.
          </p>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminIntegrationsPage() {
  const [tab, setTab] = useState("webhooks");

  return (
          <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-brand-navy mb-6">Integrations</h1>
        <Tabs
          items={[
            { id: "webhooks", label: "Webhook Endpoints" },
            { id: "deliveries", label: "Delivery Log" },
            { id: "kickoff", label: "Phase Kickoff" },
            { id: "sharepoint", label: "SharePoint & SAML" },
          ]}
          initialId={tab}
          onChange={setTab}
        />
        <div className="mt-6">
          {tab === "webhooks" && <WebhooksTab />}
          {tab === "deliveries" && <DeliveryLogTab />}
          {tab === "kickoff" && <PhaseKickoffTab />}
          {tab === "sharepoint" && <SharePointTab />}
        </div>
      </div>
      );
}
