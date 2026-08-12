/**
 * Admin Finance page.
 *
 * Covers: Stripe configuration status, payments list, coupons management,
 * referrals, payouts, and refunds.
 */
import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Card } from "../../components/ui/Surface";
import { Button } from "../../components/ui/Button";
import { FieldShell as Field, Input, Select } from "../../components/ui/Field";
import { Tabs } from "../../components/ui/DataDisplay";
import { ConfirmDialog, Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/Toast";
import { formatCents } from "@shared/domain";

// ---------------------------------------------------------------------------
// Stripe settings tab
// ---------------------------------------------------------------------------

function StripeSettingsTab() {
  const { data, refetch } = trpc.stripe.config.useQuery();
  const save = trpc.stripe.saveStripeConfig.useMutation({ onSuccess: () => { refetch(); toast.success("Stripe settings saved."); } });
  const toast = useToast();
  const testConnection = trpc.stripe.testConnection.useMutation({
    onSuccess: (result) => toast.success("Stripe connection verified", `${result.mode === "live" ? "Live" : "Test"} mode · authenticated balance API reachable${result.availableBalanceCurrencies.length ? ` · ${result.availableBalanceCurrencies.join(", ")}` : ""}`),
    onError: (error) => toast.error("Stripe connection test failed", error.message),
  });
  const [form, setForm] = useState({ secretKey: "", publishableKey: "", webhookSecret: "" });
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="space-y-6">
      {/* Status card */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-brand-navy">Stripe Integration</h3>
            <p className="text-sm text-gray-500 mt-1">
              {data?.enabled
                ? "Payment ready — online payments can be verified and completed safely."
                : data?.checkoutKeyConfigured
                ? "Stripe key saved — add the webhook signing secret to enable verified online payments."
                : "Not configured — enter your Stripe keys below to enable online payments."}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            data?.enabled ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
          }`}>
            {data?.enabled ? "Payment ready" : data?.checkoutKeyConfigured ? "Webhook required" : "Not configured"}
          </span>
        </div>
        {data?.checkoutKeyConfigured && (
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Secret key</span>
              <p className="mt-1 text-xs">
                <span className={data.secretKeySource === "database" ? "text-green-700" : "text-blue-700"}>
                  {data.secretKeySource === "database" ? "Stored in database" : data.secretKeySource === "environment" ? "From environment" : "Not set"}
                </span>
              </p>
            </div>
            <div>
              <span className="text-gray-500">Publishable key</span>
              <p className="font-mono text-xs mt-1 truncate">{data.publishableKey ?? "—"}</p>
              <p className="text-xs mt-0.5">
                <span className={data.publishableKeySource === "database" ? "text-green-700" : "text-blue-700"}>
                  {data.publishableKeySource === "database" ? "Stored in database" : data.publishableKeySource === "environment" ? "From environment" : ""}
                </span>
              </p>
            </div>
            <div>
              <span className="text-gray-500">Webhook secret</span>
              <p className="mt-1">
                {data.webhookConfigured ? (
                  <span className="text-green-700 text-xs">Configured ({data.webhookSecretSource})</span>
                ) : (
                  <span className="text-yellow-700 text-xs">Not configured</span>
                )}
              </p>
            </div>
          </div>
        )}
        <div className="mt-4">
          <Button variant="outline" busy={testConnection.isPending} disabled={!data?.checkoutKeyConfigured} onClick={() => testConnection.mutate()}>
            Test Stripe connection
          </Button>
          {!data?.checkoutKeyConfigured ? <p className="mt-2 text-xs text-gray-500">Save a Stripe secret key before testing the connection.</p> : !data?.webhookConfigured ? <p className="mt-2 text-xs text-yellow-700">Connection testing is available, but online payments remain disabled until the webhook signing secret is saved.</p> : null}
        </div>
      </Card>

      {/* Configuration form */}
      <Card>
        <h3 className="font-semibold text-brand-navy mb-1">Configure Stripe Keys</h3>
        <p className="text-sm text-gray-500 mb-4">
          Keys saved here are stored encrypted in the database and take priority over environment variables.
          Leave a field blank to keep the existing value. To remove a key, enter a single space.
        </p>
        <div className="space-y-4">
          <Field label="Secret key (sk_live_... or sk_test_...)">
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                value={form.secretKey}
                onChange={e => setForm(f => ({ ...f, secretKey: e.target.value }))}
                placeholder="Leave blank to keep existing"
                className="pr-16"
              />
              <button
                type="button"
                onClick={() => setShowSecret(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showSecret ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          <Field label="Publishable key (pk_live_... or pk_test_...)">
            <Input
              value={form.publishableKey}
              onChange={e => setForm(f => ({ ...f, publishableKey: e.target.value }))}
              placeholder="Leave blank to keep existing"
            />
          </Field>
          <Field label="Webhook signing secret (whsec_...)">
            <Input
              type="password"
              value={form.webhookSecret}
              onChange={e => setForm(f => ({ ...f, webhookSecret: e.target.value }))}
              placeholder="Leave blank to keep existing"
            />
          </Field>
          <div className="pt-2">
            <p className="text-xs text-gray-400 mb-3">
              Webhook endpoint URL to register in your Stripe dashboard:{" "}
              <code className="bg-gray-100 px-1 rounded">{window.location.origin}/api/stripe/webhook</code>
            </p>
            <Button
              onClick={() => {
                const payload: Record<string, string> = {};
                if (form.secretKey.trim()) payload.secretKey = form.secretKey.trim();
                if (form.publishableKey.trim()) payload.publishableKey = form.publishableKey.trim();
                if (form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
                if (Object.keys(payload).length === 0) {
                  toast.error("No changes to save.");
                  return;
                }
                save.mutate(payload);
                setForm({ secretKey: "", publishableKey: "", webhookSecret: "" });
              }}
              busy={save.isPending}
            >
              Save Stripe configuration
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments tab
// ---------------------------------------------------------------------------

function PaymentsTab() {
  const [page, setPage] = useState(1);
  const { data } = trpc.stripe.payments.useQuery({ page });

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Order</th>
              <th className="py-2 pr-4">Provider</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">#{p.orderId}</td>
                <td className="py-2 pr-4 capitalize">{p.provider}</td>
                <td className="py-2 pr-4">{formatCents(p.amountCents)}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      p.status === "succeeded"
                        ? "bg-green-100 text-green-800"
                        : p.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="py-2 text-gray-500">
                  {p.receivedAt ? new Date(p.receivedAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {!data?.rows.length && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400">
                  No payments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > 50 && (
        <div className="flex justify-between items-center mt-4">
          <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-gray-500">
            Page {page} of {Math.ceil(data.total / 50)}
          </span>
          <Button variant="ghost" size="sm" disabled={page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coupons tab
// ---------------------------------------------------------------------------

function CouponsTab() {
  const { data, refetch } = trpc.stripe.coupons.useQuery();
  const upsert = trpc.stripe.upsertCoupon.useMutation({ onSuccess: () => { refetch(); setOpen(false); } });
  const setActive = trpc.stripe.setCouponActive.useMutation({ onSuccess: () => refetch() });
  const toast = useToast();
  const deleteCoupon = trpc.stripe.deleteCoupon.useMutation({
    onSuccess: () => {
      void refetch();
      setDeleting(null);
      toast.success("Coupon deleted.");
    },
    onError: (error) => toast.error("Could not delete coupon.", error.message),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NonNullable<typeof data>[0] | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; code: string } | null>(null);
  const [form, setForm] = useState({
    code: "", description: "", discountType: "percent" as "percent" | "fixed" | "cart_price",
    discountValue: 10, maxRedemptions: "", expiresAt: "", active: true,
  });

  function openNew() {
    setEditing(null);
    setForm({ code: "", description: "", discountType: "percent", discountValue: 10, maxRedemptions: "", expiresAt: "", active: true });
    setOpen(true);
  }

  function openEdit(c: NonNullable<typeof data>[0]) {
    setEditing(c);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discountType: c.discountType as "percent" | "fixed" | "cart_price",
      discountValue: c.discountValue,
      maxRedemptions: c.maxRedemptions ? String(c.maxRedemptions) : "",
      expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 16) : "",
      active: c.active,
    });
    setOpen(true);
  }

  async function save() {
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        code: form.code,
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: form.discountValue,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        active: form.active,
      });
      toast.success("Coupon saved.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save coupon.");
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openNew}>Add coupon</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Discount</th>
              <th className="py-2 pr-4">Used</th>
              <th className="py-2 pr-4">Expires</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4 font-mono font-medium">{c.code}</td>
                <td className="py-2 pr-4">
                  {c.discountType === "percent" ? `${c.discountValue}% off` : c.discountType === "cart_price" ? `Cart price ${formatCents(c.discountValue)}` : `${formatCents(c.discountValue)} off`}
                </td>
                <td className="py-2 pr-4">
                  {c.redemptionCount}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                </td>
                <td className="py-2 pr-4 text-gray-500">
                  {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "Never"}
                </td>
                <td className="py-2 pr-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2 flex gap-2">
                  <button onClick={() => openEdit(c)} className="text-brand-teal text-xs hover:underline">Edit</button>
                  <button
                    onClick={() => setActive.mutate({ id: c.id, active: !c.active })}
                    className="text-gray-500 text-xs hover:underline"
                  >
                    {c.active ? "Disable" : "Enable"}
                  </button>
                  {!c.active && c.redemptionCount === 0 ? (
                    <button
                      onClick={() => setDeleting({ id: c.id, code: c.code })}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Delete
                    </button>
                  ) : !c.active ? (
                    <span className="text-xs text-gray-400" title="Coupons with redemption history are retained for audit purposes">Retained</span>
                  ) : null}
                </td>
              </tr>
            ))}
            {!data?.length && (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">No coupons yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit coupon" : "New coupon"}>
        <div className="space-y-4">
          <Field label="Code">
            <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SUMMER20" />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Discount type">
              <Select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "percent" | "fixed" | "cart_price" }))}>
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
                <option value="cart_price">Fixed cart price</option>
              </Select>
            </Field>
            <Field label={form.discountType === "percent" ? "Percentage off" : form.discountType === "cart_price" ? "Final cart price (cents)" : "Amount off (cents)"}>
              <Input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max redemptions (blank = unlimited)">
              <Input type="number" value={form.maxRedemptions} onChange={e => setForm(f => ({ ...f, maxRedemptions: e.target.value }))} />
            </Field>
            <Field label="Expires at (blank = never)">
              <Input type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Active
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} busy={upsert.isPending}>Save</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteCoupon.mutate({ id: deleting!.id })}
        title="Delete coupon permanently?"
        message={`Delete ${deleting?.code ?? "this coupon"}? This cannot be undone. Only inactive coupons with no redemption history can be deleted.`}
        confirmLabel="Delete coupon"
        cancelLabel="Keep coupon"
        variant="danger"
        busy={deleteCoupon.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refunds tab
// ---------------------------------------------------------------------------

function RefundsTab() {
  const [page, setPage] = useState(1);
  const { data } = trpc.stripe.refunds.useQuery({ page });
  const initiate = trpc.stripe.initiateRefund.useMutation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ orderId: "", amountCents: "", reason: "" });

  async function submit() {
    try {
      const result = await initiate.mutateAsync({
        orderId: Number(form.orderId),
        amountCents: Number(form.amountCents),
        reason: form.reason,
      });
      toast.success(`Refund initiated: ${result.refundId}`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to initiate refund.");
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setOpen(true)}>Initiate refund</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Order</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Reason</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">#{r.orderId}</td>
                <td className="py-2 pr-4">{formatCents(r.amountCents)}</td>
                <td className="py-2 pr-4 text-gray-600">{r.reason ?? "—"}</td>
                <td className="py-2 pr-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === "completed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="py-2 text-gray-500">
                  {r.processedAt ? new Date(r.processedAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
            {!data?.rows.length && (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">No refunds yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Initiate Stripe refund">
        <div className="space-y-4">
          <Field label="Order ID">
            <Input type="number" value={form.orderId} onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))} />
          </Field>
          <Field label="Amount (cents)">
            <Input type="number" value={form.amountCents} onChange={e => setForm(f => ({ ...f, amountCents: e.target.value }))} />
          </Field>
          <Field label="Reason">
            <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} busy={initiate.isPending}>Initiate refund</Button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminFinancePage() {
  const [tab, setTab] = useState("settings");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-navy mb-6">Finance</h1>
      <Tabs
        items={[
          { id: "settings", label: "Stripe Settings" },
          { id: "payments", label: "Payments" },
          { id: "coupons", label: "Coupons" },
          { id: "refunds", label: "Refunds" },
        ]}
        initialId={tab}
        onChange={setTab}
      />
      <div className="mt-6">
        {tab === "settings" && <StripeSettingsTab />}
        {tab === "payments" && <PaymentsTab />}
        {tab === "coupons" && <CouponsTab />}
        {tab === "refunds" && <RefundsTab />}
      </div>
    </div>
  );
}
