/**
 * Admin A/B Test Manager page.
 */
import { useState } from "react";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Textarea } from "@/components/ui/Field";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/Surface";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

const emptyForm = { id: undefined as number | undefined, experimentKey: "", variantKey: "", description: "", weight: 50, isControl: false, isActive: true };

export function AdminABTests() {
  const toast = useToast();
  const [editVariant, setEditVariant] = useState<typeof emptyForm | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [statsKey, setStatsKey] = useState<string>("");

  const variants = trpc.tier3.abTest.listVariants.useQuery();
  const stats = trpc.tier3.abTest.eventStats.useQuery({ experimentKey: statsKey }, { enabled: !!statsKey });
  const utils = trpc.useUtils();

  const upsert = trpc.tier3.abTest.upsertVariant.useMutation({
    onSuccess: () => { utils.tier3.abTest.listVariants.invalidate(); setEditVariant(null); toast.success(editVariant?.id ? "Variant updated" : "Variant created"); },
    onError: (e) => toast.error("Error", e.message),
  });
  const deleteVariant = trpc.tier3.abTest.deleteVariant.useMutation({
    onSuccess: () => { utils.tier3.abTest.listVariants.invalidate(); setDeleteId(null); toast.success("Variant deleted"); },
  });

  const variantList = variants.data ?? [];
  const experiments = [...new Set(variantList.map((v) => v.experimentKey))];

  return (
    <>
      <PageHeader
        title="A/B test manager"
        description="Manage experiment variants and view event statistics."
        actions={<Button onClick={() => setEditVariant({ ...emptyForm })} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New variant</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          {variantList.length === 0 ? (
            <EmptyState icon={FlaskConical} title="No variants" description="Create A/B test variants to start experimenting." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Experiment</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Variant</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Weight</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Control</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th></tr></thead><tbody>
              {variantList.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="px-4 py-3 text-sm font-mono text-ink">{v.experimentKey}</td>
                  <td className="px-4 py-3 text-sm font-mono text-body">{v.variantKey}</td>
                  <td className="px-4 py-3 text-sm text-body">{v.weight}%</td>
                  <td className="px-4 py-3"><Badge tone={v.isControl ? "teal" : "neutral"}>{v.isControl ? "Yes" : "No"}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={v.isActive ? "success" : "neutral"}>{v.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditVariant({ id: v.id, experimentKey: v.experimentKey, variantKey: v.variantKey, description: v.description ?? "", weight: v.weight, isControl: v.isControl, isActive: v.isActive })}>Edit</Button>
                      <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setDeleteId(v.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>

        <Card>
          <CardHeader title="Event statistics" />
          <div className="mt-4">
            <FieldShell label="Experiment">
              <select value={statsKey} onChange={(e) => setStatsKey(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none">
                <option value="">Select experiment…</option>
                {experiments.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </FieldShell>
            {statsKey && (stats.data ?? []).length > 0 ? (
              <div className="mt-4 space-y-2">
                {(stats.data ?? []).map((row) => (
                  <div key={`${row.variantKey}-${row.eventType}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <div>
                      <span className="text-sm font-mono text-ink">{row.variantKey}</span>
                      <span className="ml-2 text-xs text-muted">{row.eventType}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-ink">{row.total}</span>
                  </div>
                ))}
              </div>
            ) : statsKey ? (
              <p className="mt-4 text-sm text-muted">No events recorded for this experiment.</p>
            ) : null}
          </div>
        </Card>
      </div>

      {editVariant !== null && (
        <Modal open onClose={() => setEditVariant(null)} title={editVariant.id ? "Edit variant" : "New variant"} size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FieldShell label="Experiment key" required><Input value={editVariant.experimentKey} onChange={(e) => setEditVariant((f) => f && ({ ...f, experimentKey: e.target.value }))} placeholder="homepage-hero" /></FieldShell>
              <FieldShell label="Variant key" required><Input value={editVariant.variantKey} onChange={(e) => setEditVariant((f) => f && ({ ...f, variantKey: e.target.value }))} placeholder="control" /></FieldShell>
            </div>
            <FieldShell label="Description"><Textarea value={editVariant.description} onChange={(e) => setEditVariant((f) => f && ({ ...f, description: e.target.value }))} rows={2} /></FieldShell>
            <div className="grid grid-cols-2 gap-4">
              <FieldShell label="Weight (%)" help="Traffic allocation"><Input type="number" min={0} max={100} value={editVariant.weight} onChange={(e) => setEditVariant((f) => f && ({ ...f, weight: +e.target.value }))} /></FieldShell>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-body">
                <input type="checkbox" checked={editVariant.isControl} onChange={(e) => setEditVariant((f) => f && ({ ...f, isControl: e.target.checked }))} className="size-4 rounded border-line accent-teal" />
                Control variant
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-body">
                <input type="checkbox" checked={editVariant.isActive} onChange={(e) => setEditVariant((f) => f && ({ ...f, isActive: e.target.checked }))} className="size-4 rounded border-line accent-teal" />
                Active
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditVariant(null)}>Cancel</Button>
              <Button onClick={() => upsert.mutate({ ...editVariant, description: editVariant.description || undefined })} busy={upsert.isPending} disabled={!editVariant.experimentKey || !editVariant.variantKey}>Save</Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deleteVariant.mutate({ id: deleteId }); }}
        title="Delete variant"
        message="This will permanently delete this A/B test variant."
        confirmLabel="Delete"
        variant="danger"
        busy={deleteVariant.isPending}
      />
    </>
  );
}
