/**
 * Admin Subscriptions page — subscription plans and billing events.
 */
import { useState } from "react";
import { CreditCard, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Textarea } from "@/components/ui/Field";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/Surface";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/utils";

const emptyForm = { name: "", slug: "", description: "", priceCents: 0, intervalDays: 30, features: "" };

export function AdminSubscriptions() {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [activeTab, setActiveTab] = useState<"plans" | "billing">("plans");

  const plans = trpc.tier3.subscription.listPlans.useQuery();
  const billing = trpc.tier3.subscription.listBillingEvents.useQuery({ limit: 200 });
  const utils = trpc.useUtils();

  const createPlan = trpc.tier3.subscription.createPlan.useMutation({
    onSuccess: () => { utils.tier3.subscription.listPlans.invalidate(); setCreateOpen(false); setForm({ ...emptyForm }); toast.success("Plan created"); },
    onError: (e) => toast.error("Error", e.message),
  });
  const togglePlan = trpc.tier3.subscription.togglePlan.useMutation({
    onSuccess: () => utils.tier3.subscription.listPlans.invalidate(),
  });

  const planList = plans.data ?? [];
  const billingList = billing.data ?? [];

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Manage subscription plans and view billing events."
        actions={<Button onClick={() => setCreateOpen(true)} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New plan</Button>}
      />

      <div className="mb-4 flex gap-2 border-b border-line">
        {(["plans", "billing"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? "border-teal text-teal" : "border-transparent text-muted hover:text-ink"}`}>
            {tab === "plans" ? `Plans (${planList.length})` : `Billing events (${billingList.length})`}
          </button>
        ))}
      </div>

      {activeTab === "plans" && (
        <Card>
          {planList.length === 0 ? (
            <EmptyState icon={CreditCard} title="No subscription plans" description="Create subscription plans to offer recurring billing." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Name</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Slug</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Price</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Interval</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th></tr></thead><tbody>
              {planList.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3 text-sm font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-body">{p.slug}</td>
                  <td className="px-4 py-3 text-sm text-body">{formatMoney(p.priceCents ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-body">{p.intervalDays} days</td>
                  <td className="px-4 py-3"><Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" leadingIcon={p.isActive ? <ToggleRight className="size-4" aria-hidden="true" /> : <ToggleLeft className="size-4" aria-hidden="true" />} onClick={() => togglePlan.mutate({ id: p.id, isActive: !p.isActive })}>{p.isActive ? "Deactivate" : "Activate"}</Button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}

      {activeTab === "billing" && (
        <Card>
          {billingList.length === 0 ? (
            <EmptyState icon={CreditCard} title="No billing events" description="Billing events will appear here." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Event type</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Amount</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Provider</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">User</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Order</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Date</th></tr></thead><tbody>
              {billingList.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-3"><Badge>{e.eventType}</Badge></td>
                  <td className="px-4 py-3 text-sm text-body tabular-nums">{formatMoney(e.amountCents ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-body">{e.provider}</td>
                  <td className="px-4 py-3 text-sm text-body">{e.userId ? `#${e.userId}` : "—"}</td>
                  <td className="px-4 py-3 text-sm text-body">{e.orderId ? `#${e.orderId}` : "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New subscription plan" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FieldShell label="Name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FieldShell>
            <FieldShell label="Slug" required><Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="basic-monthly" /></FieldShell>
          </div>
          <FieldShell label="Description"><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></FieldShell>
          <div className="grid grid-cols-2 gap-4">
            <FieldShell label="Price (cents)" help="e.g. 4900 = $49.00"><Input type="number" min={0} value={form.priceCents} onChange={(e) => setForm((f) => ({ ...f, priceCents: +e.target.value }))} /></FieldShell>
            <FieldShell label="Interval (days)"><Input type="number" min={1} value={form.intervalDays} onChange={(e) => setForm((f) => ({ ...f, intervalDays: +e.target.value }))} /></FieldShell>
          </div>
          <FieldShell label="Features (one per line)"><Textarea value={form.features} onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))} rows={4} placeholder="Unlimited orders&#10;Priority support&#10;Custom branding" /></FieldShell>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createPlan.mutate({ ...form, features: form.features ? form.features.split("\n").filter(Boolean) : undefined })} busy={createPlan.isPending} disabled={!form.name || !form.slug}>Create plan</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
