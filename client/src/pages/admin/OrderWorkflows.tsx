import { useState } from "react";
import { ClipboardList, Plus, Save } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Textarea } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

type Workflow = { id: number; name: string; description: string | null; stages: unknown[]; isDefault: boolean; active: boolean; createdAt: Date | string };

type Stage = { key: string; label: string; order: number };

function stageLines(stages: unknown[]): string {
  return (stages as Stage[]).map((stage) => `${stage.key} | ${stage.label}`).join("\n");
}

function parseStages(value: string): Stage[] {
  const parsed = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [firstPart = "", ...labelParts] = line.split("|");
    const rawKey = firstPart;
    const label = labelParts.join("|").trim() || rawKey.trim();
    const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    return { key, label, order: index + 1 };
  });
  return parsed.filter((stage) => stage.key && stage.label.length >= 2);
}

export function AdminOrderWorkflowsPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const workflows = trpc.admin.orderWorkflows.useQuery();
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [active, setActive] = useState(true);

  const save = trpc.admin.upsertOrderWorkflow.useMutation({
    async onSuccess() { await utils.admin.orderWorkflows.invalidate(); setOpen(false); toast.success(editing ? "Workflow updated" : "Workflow created"); },
    onError(error) { toast.error("Could not save workflow", errorMessage(error)); },
  });

  function create() {
    setEditing(null); setName(""); setDescription(""); setStages("new | Payment confirmed\nphase_1_intake | Phase 1 intake\nphase_2_synthesis | Phase 2 synthesis\nphase_3_review | Phase 3 review\nphase_4_delivery | Phase 4 delivery\ndelivered | Delivered\nclosed | Closed"); setIsDefault(false); setActive(true); setOpen(true);
  }
  function edit(workflow: Workflow) {
    setEditing(workflow); setName(workflow.name); setDescription(workflow.description ?? ""); setStages(stageLines(workflow.stages)); setIsDefault(workflow.isDefault); setActive(workflow.active); setOpen(true);
  }
  const parsed = parseStages(stages);
  const columns: Column<Workflow>[] = [
    { key: "name", header: "Workflow", cell: (row) => <div><p className="font-medium text-ink">{row.name}</p><p className="mt-0.5 max-w-xl text-xs text-muted">{row.description || "No description"}</p></div> },
    { key: "stages", header: "Stages", cell: (row) => <span className="text-sm text-body">{(row.stages as Stage[]).length}</span> },
    { key: "state", header: "State", cell: (row) => <div className="flex gap-1.5">{row.isDefault ? <Badge tone="teal">Default</Badge> : null}<Badge tone={row.active ? "success" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge></div> },
    { key: "action", header: "", align: "right", cell: (row) => <Button size="sm" variant="outline" onClick={() => edit(row)}>Edit</Button> },
  ];

  return <><PageHeader title="Order workflows" description="Create and manage the ordered stages used by administrators to organize individual orders." actions={<Button leadingIcon={<Plus className="size-4" />} onClick={create}>New workflow</Button>} />
    <Alert tone="info" className="mb-5">The standard workflow remains available. Custom workflows organize order stages and are assigned per order; existing status, payment, and automation safeguards remain enforced by the platform.</Alert>
    {workflows.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div> : (workflows.data ?? []).length ? <DataTable caption="Order workflows" columns={columns} rows={(workflows.data ?? []) as Workflow[]} rowKey={(row) => row.id} /> : <EmptyState icon={ClipboardList} title="No workflows" description="Create a workflow before assigning one to an order." action={<Button onClick={create}>New workflow</Button>} />}
    <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit order workflow" : "New order workflow"} description="Enter one ordered stage per line as stage_key | Stage label." footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button busy={save.isPending} disabled={name.trim().length < 2 || parsed.length === 0 || new Set(parsed.map((stage) => stage.key)).size !== parsed.length} leadingIcon={<Save className="size-4" />} onClick={() => save.mutate({ id: editing?.id, name: name.trim(), description: description.trim() || undefined, stages: parsed, isDefault, active })}>Save workflow</Button></>}><div className="space-y-4"><Input label="Workflow name" value={name} onChange={(event) => setName(event.target.value)} required /><Textarea label="Description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /><Textarea label="Stages — one per line" help="Use a stable lowercase key, a vertical bar, and a readable label. For example: phase_2_synthesis | Phase 2 synthesis." rows={10} value={stages} onChange={(event) => setStages(event.target.value)} required /><Checkbox label="Use as the default workflow for new orders" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} /><Checkbox label="Active and available for assignment" checked={active} onChange={(event) => setActive(event.target.checked)} /></div></Modal>
  </>;
}
