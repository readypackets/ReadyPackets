import { useMemo, useState } from "react";
import { Bot, Plus, Trash2 } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, EmptyState, Badge } from "@/components/ui/Surface";
import { Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

type Rule = {
  id: number; name: string; triggerType: "order_status" | "payment_status" | "intake_submitted" | "phase_started";
  triggerValue: string | null; completionPercent: number | null; isActive: boolean; sortOrder: number;
};

const triggerLabel: Record<Rule["triggerType"], string> = {
  order_status: "Order status changes to",
  payment_status: "Payment status changes to",
  intake_submitted: "Phase 1 intake is submitted",
  phase_started: "A phase is started",
};
const statusOptions = ["new", "phase_1_intake", "phase_2_synthesis", "phase_3_review", "phase_4_delivery", "delivered", "closed", "cancelled"];
const paymentOptions = ["unpaid", "awaiting_invoice", "processing", "paid", "partially_refunded", "refunded", "failed"];

export function AdminOrderAutomations() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const rules = trpc.admin.orderAutomationRules.useQuery();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<Rule["triggerType"]>("payment_status");
  const [triggerValue, setTriggerValue] = useState("paid");
  const [percent, setPercent] = useState("2");
  const [active, setActive] = useState(true);

  const save = trpc.admin.upsertOrderAutomationRule.useMutation({
    onSuccess() { void utils.admin.orderAutomationRules.invalidate(); toast.success(editing ? "Automation updated" : "Automation created"); close(); },
    onError(error) { toast.error("Could not save automation", errorMessage(error)); },
  });
  const remove = trpc.admin.deleteOrderAutomationRule.useMutation({
    onSuccess() { void utils.admin.orderAutomationRules.invalidate(); setDeleteId(null); toast.success("Automation deleted"); },
    onError(error) { toast.error("Could not delete automation", errorMessage(error)); },
  });

  function openCreate() { setEditing(null); setName("Paid order progress"); setTriggerType("payment_status"); setTriggerValue("paid"); setPercent("2"); setActive(true); setCreating(true); }
  function openEdit(rule: Rule) { setEditing(rule); setName(rule.name); setTriggerType(rule.triggerType); setTriggerValue(rule.triggerValue ?? ""); setPercent(String(rule.completionPercent ?? 0)); setActive(rule.isActive); setCreating(true); }
  function close() { setCreating(false); setEditing(null); }
  const valueChoices = useMemo(() => triggerType === "order_status" ? statusOptions : triggerType === "payment_status" ? paymentOptions : triggerType === "phase_started" ? ["phase_1", "phase_2", "phase_3", "phase_4"] : [], [triggerType]);
  const needsValue = triggerType !== "intake_submitted";

  const columns: Column<Rule>[] = [
    { key: "name", header: "Rule", cell: row => <div><p className="font-medium text-ink">{row.name}</p><p className="text-xs text-muted">{triggerLabel[row.triggerType]} {row.triggerValue ?? ""}</p></div> },
    { key: "action", header: "Action", cell: row => <span>Set completion to <strong>{row.completionPercent ?? 0}%</strong></span> },
    { key: "state", header: "State", cell: row => <Badge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Disabled"}</Badge> },
    { key: "actions", header: "", cell: row => <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(row)}>Edit</Button><Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-3.5" />} onClick={() => setDeleteId(row.id)}>Delete</Button></div> },
  ];

  return <>
    <PageHeader title="Order automations" description="Automatically update order completion when payment, order status, intake, or phase events occur." actions={<Button variant="primary" leadingIcon={<Plus className="size-4" />} onClick={openCreate}>New automation</Button>} />
    <Card><CardHeader title="Lifecycle rules" description="Rules run server-side after the matching order event. Use the paid trigger to set a newly paid order to 2%, or choose any completion percentage." />
      {(rules.data ?? []).length ? <DataTable caption="Order automation rules" columns={columns} rows={(rules.data ?? []) as Rule[]} rowKey={row => row.id} /> : <EmptyState icon={Bot} title="No order automations yet" description="Create a rule to set completion automatically as work progresses." action={<Button variant="primary" onClick={openCreate}>Create rule</Button>} />}
    </Card>
    <Modal open={creating} onClose={close} title={editing ? "Edit order automation" : "New order automation"} footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button variant="primary" busy={save.isPending} onClick={() => save.mutate({ id: editing?.id, name: name.trim(), triggerType, triggerValue: needsValue ? triggerValue || undefined : undefined, completionPercent: Math.max(0, Math.min(100, Number(percent))), isActive: active })}>Save automation</Button></>}>
      <div className="space-y-4"><Input label="Automation name" value={name} onChange={e => setName(e.target.value)} required /><Select label="When" value={triggerType} onChange={e => { const next = e.target.value as Rule["triggerType"]; setTriggerType(next); setTriggerValue(next === "payment_status" ? "paid" : next === "order_status" ? "new" : next === "phase_started" ? "phase_1" : ""); }}><option value="payment_status">Payment status changes</option><option value="order_status">Order status changes</option><option value="intake_submitted">Phase 1 intake is submitted</option><option value="phase_started">A phase is started</option></Select>
      {needsValue && <Select label="Matching value" value={triggerValue} onChange={e => setTriggerValue(e.target.value)}>{valueChoices.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</Select>}
      <Input label="Set completion percentage" type="number" min="0" max="100" value={percent} onChange={e => setPercent(e.target.value)} required />
      <label className="flex items-center gap-2 text-sm text-body"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active immediately</label></div>
    </Modal>
    <ConfirmDialog open={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) remove.mutate({ id: deleteId }); }} title="Delete automation" message="This removes the rule. Existing order history is unchanged." confirmLabel="Delete rule" variant="danger" busy={remove.isPending} />
  </>;
}
