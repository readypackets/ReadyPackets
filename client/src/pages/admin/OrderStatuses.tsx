import { ArrowDown, ArrowUp, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

type Tone = "neutral" | "teal" | "gold" | "success" | "warning" | "danger";
type StatusOption = { key: string; label: string; tone: Tone; active: boolean; system: boolean; sortOrder: number };
const toneChoices = ["neutral", "teal", "gold", "success", "warning", "danger"] as const;

function nextCustomKey(options: StatusOption[]) {
  const base = "custom_status";
  let index = 1;
  while (options.some((option) => option.key === `${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

export function AdminOrderStatusesPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const query = trpc.admin.orderStatusOptions.useQuery();
  const save = trpc.admin.saveOrderStatusOptions.useMutation({
    onSuccess: async () => {
      await utils.admin.orderStatusOptions.invalidate();
      toast.success("Order status options saved", "Active statuses are immediately available to staff, workflows, and automations.");
    },
    onError: (error) => toast.error("Order statuses could not be saved", errorMessage(error)),
  });
  const options = (query.data ?? []) as StatusOption[];

  const update = (key: string, patch: Partial<StatusOption>) => {
    const updated = options.map((option) => option.key === key ? { ...option, ...patch } : option);
    utils.admin.orderStatusOptions.setData(undefined, updated);
  };
  const move = (key: string, direction: -1 | 1) => {
    const index = options.findIndex((option) => option.key === key);
    const other = index + direction;
    if (index < 0 || other < 0 || other >= options.length) return;
    const copy = [...options];
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
    utils.admin.orderStatusOptions.setData(undefined, copy.map((option, position) => ({ ...option, sortOrder: (position + 1) * 10 })));
  };
  const add = () => {
    const next = [...options, { key: nextCustomKey(options), label: "New custom status", tone: "neutral" as Tone, active: true, system: false, sortOrder: (options.length + 1) * 10 }];
    utils.admin.orderStatusOptions.setData(undefined, next);
  };
  const remove = (key: string) => utils.admin.orderStatusOptions.setData(undefined, options.filter((option) => option.key !== key));

  return <div className="space-y-6">
    <PageHeader title="Order status options" description="Manage the labels and custom operating statuses available to staff, workflow actions, automations, filters, and customer order views." actions={<Button leadingIcon={<Save className="size-4" />} busy={save.isPending} disabled={options.length === 0} onClick={() => save.mutate({ options: options.map((option, index) => ({ key: option.key, label: option.label.trim(), tone: option.tone, active: option.system ? true : option.active, sortOrder: (index + 1) * 10 })) })}>Save status options</Button>} />
    <Alert tone="info" title="Protected lifecycle safeguards remain active">New, Phase I, Phase II, In Production, Delivered, Closed, Cancelled, and Refunded are retained as protected lifecycle states. You may rename or reorder them, but they remain active so payment, deliverable, history, and automation safeguards cannot be bypassed. Custom statuses are administrator-only routing labels and may be deactivated instead of deleted.</Alert>
    <Card>
      <CardHeader title="Available order statuses" description="Drag-free ordering is intentional: use the arrows to keep the customer and staff sequence predictable. Status keys are permanent identifiers; change the label instead of changing a key already in use." />
      {query.isLoading ? <Skeleton className="mt-4 h-64 w-full" /> : options.length === 0 ? <EmptyState className="mt-5" icon={ShieldCheck} title="No order statuses" description="Default protected statuses will be restored when the page reloads." /> : <div className="mt-5 space-y-3">{options.map((option, index) => <div key={option.key} className="grid gap-3 rounded-xl border border-line bg-surface p-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)_10rem_auto] lg:items-end"><div className="flex gap-1"><Button size="sm" variant="ghost" aria-label={`Move ${option.label} up`} disabled={index === 0} onClick={() => move(option.key, -1)}><ArrowUp className="size-4" /></Button><Button size="sm" variant="ghost" aria-label={`Move ${option.label} down`} disabled={index === options.length - 1} onClick={() => move(option.key, 1)}><ArrowDown className="size-4" /></Button></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Status key</p><code className="block truncate rounded-md bg-surface-soft px-3 py-2 text-sm text-ink">{option.key}</code></div><Input label="Customer and staff label" value={option.label} onChange={(event) => update(option.key, { label: event.target.value })} maxLength={64} /><Select label="Badge tone" value={option.tone} onChange={(event) => update(option.key, { tone: event.target.value as Tone })} options={toneChoices.map((tone) => ({ value: tone, label: tone.charAt(0).toUpperCase() + tone.slice(1) }))} /><div className="flex items-center gap-2 pb-2"><Badge tone={option.system ? "teal" : option.active ? "success" : "neutral"}>{option.system ? "Protected" : option.active ? "Active" : "Inactive"}</Badge>{option.system ? null : <><Checkbox label="Active" aria-label={`Activate ${option.label}`} checked={option.active} onChange={(event) => update(option.key, { active: event.target.checked })} /><Button size="sm" variant="ghost" aria-label={`Remove ${option.label}`} onClick={() => remove(option.key)}><Trash2 className="size-4 text-danger" /></Button></>}</div></div>)}</div>}
      <div className="mt-5 border-t border-line pt-4"><Button variant="outline" leadingIcon={<Plus className="size-4" />} onClick={add}>Add custom status</Button></div>
    </Card>
  </div>;
}
