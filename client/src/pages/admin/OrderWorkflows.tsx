import { useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, ClipboardList, Copy, FileAudio, FileQuestion, FileText, GripVertical, Mic, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Textarea } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

type Workflow = { id: number; name: string; description: string | null; stages: unknown[]; isDefault: boolean; active: boolean; createdAt: Date | string };
type StageCapability = "documents" | "questions" | "recording" | "audio_upload";
type Stage = { key: string; label: string; order: number; capabilities: StageCapability[] };

const CAPABILITIES: { key: StageCapability; label: string; description: string; icon: typeof FileText }[] = [
  { key: "documents", label: "Upload documents", description: "Customer may upload supporting files.", icon: FileText },
  { key: "questions", label: "Answer questions", description: "Customer sees questions assigned to this stage.", icon: FileQuestion },
  { key: "recording", label: "Record audio", description: "Customer may record WebM audio in the browser.", icon: Mic },
  { key: "audio_upload", label: "Upload audio file", description: "Customer and staff may attach approved prerecorded audio.", icon: FileAudio },
];

const STANDARD_STAGES: Stage[] = [
  { key: "new", label: "Payment confirmed", order: 1, capabilities: ["questions"] },
  { key: "phase_1_intake", label: "Phase 1 intake", order: 2, capabilities: ["documents", "questions", "recording"] },
  { key: "phase_2_synthesis", label: "Phase 2 synthesis", order: 3, capabilities: ["documents", "questions", "recording"] },
  { key: "phase_3_review", label: "Phase 3 review", order: 4, capabilities: ["documents", "questions"] },
  { key: "phase_4_delivery", label: "Phase 4 delivery", order: 5, capabilities: ["documents"] },
  { key: "delivered", label: "Delivered", order: 6, capabilities: ["documents"] },
  { key: "closed", label: "Closed", order: 7, capabilities: [] },
];

function normalizeStages(value: unknown[]): Stage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { key?: unknown; label?: unknown; order?: unknown; capabilities?: unknown } => Boolean(item) && typeof item === "object")
    .filter((item) => typeof item.key === "string" && typeof item.label === "string")
    .map((item, index) => ({
      key: item.key as string,
      label: item.label as string,
      order: typeof item.order === "number" ? item.order : index + 1,
      capabilities: Array.isArray(item.capabilities)
        ? item.capabilities.filter((capability): capability is StageCapability => capability === "documents" || capability === "questions" || capability === "recording" || capability === "audio_upload")
        : ["documents", "questions", "recording"] as StageCapability[],
    }))
    .sort((left, right) => left.order - right.order);
}

function cloneStages(stages: Stage[]): Stage[] {
  return stages.map((stage, index) => ({ ...stage, order: index + 1, capabilities: [...stage.capabilities] }));
}

function stageKey(label: string, index: number) {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || `stage_${index + 1}`;
}

export function AdminOrderWorkflowsPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const workflows = trpc.admin.orderWorkflows.useQuery();
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [active, setActive] = useState(true);
  const [draggedStage, setDraggedStage] = useState<number | null>(null);

  const save = trpc.admin.upsertOrderWorkflow.useMutation({
    async onSuccess() { await utils.admin.orderWorkflows.invalidate(); setOpen(false); toast.success(editing ? "Workflow updated" : "Workflow created", "Assigned order workspaces refresh from the current workflow automatically."); },
    onError(error) { toast.error("Could not save workflow", errorMessage(error)); },
  });

  function startNew() {
    setEditing(null); setName(""); setDescription(""); setStages(cloneStages(STANDARD_STAGES)); setIsDefault(false); setActive(true); setDraggedStage(null); setOpen(true);
  }
  function startEdit(workflow: Workflow) {
    setEditing(workflow); setName(workflow.name); setDescription(workflow.description ?? ""); setStages(normalizeStages(workflow.stages)); setIsDefault(workflow.isDefault); setActive(workflow.active); setDraggedStage(null); setOpen(true);
  }
  function startClone(workflow: Workflow) {
    setEditing(null); setName(`${workflow.name} copy`); setDescription(workflow.description ?? ""); setStages(cloneStages(normalizeStages(workflow.stages))); setIsDefault(false); setActive(true); setDraggedStage(null); setOpen(true);
  }
  function updateStage(index: number, patch: Partial<Stage>) {
    setStages((current) => current.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage));
  }
  function toggleCapability(index: number, capability: StageCapability) {
    setStages((current) => current.map((stage, stageIndex) => {
      if (stageIndex !== index) return stage;
      return { ...stage, capabilities: stage.capabilities.includes(capability) ? stage.capabilities.filter((item) => item !== capability) : [...stage.capabilities, capability] };
    }));
  }
  function moveStage(from: number, to: number) {
    if (to < 0 || to >= stages.length || from === to) return;
    setStages((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      if (!item) return current;
      next.splice(to, 0, item);
      return next.map((stage, index) => ({ ...stage, order: index + 1 }));
    });
  }
  function addStage() {
    setStages((current) => [...current, { key: `stage_${current.length + 1}`, label: `New stage ${current.length + 1}`, order: current.length + 1, capabilities: ["documents"] }]);
  }
  function removeStage(index: number) {
    setStages((current) => current.filter((_, stageIndex) => stageIndex !== index).map((stage, stageIndex) => ({ ...stage, order: stageIndex + 1 })));
  }

  const normalizedStages = stages.map((stage, index) => ({ ...stage, key: stageKey(stage.key, index), label: stage.label.trim(), order: index + 1 }));
  const duplicateKeys = new Set(normalizedStages.map((stage) => stage.key)).size !== normalizedStages.length;
  const invalidStages = normalizedStages.some((stage) => stage.label.length < 2 || stage.key.length < 2 || stage.capabilities.length === 0);
  const columns: Column<Workflow>[] = [
    { key: "name", header: "Workflow", cell: (row) => <div><p className="font-medium text-ink">{row.name}</p><p className="mt-0.5 max-w-xl text-xs text-muted">{row.description || "No description"}</p></div> },
    { key: "stages", header: "Stages", cell: (row) => <span className="text-sm text-body">{normalizeStages(row.stages).length}</span> },
    { key: "state", header: "State", cell: (row) => <div className="flex gap-1.5">{row.isDefault ? <Badge tone="teal">Default</Badge> : null}<Badge tone={row.active ? "success" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge></div> },
    { key: "action", header: "", align: "right", cell: (row) => <div className="flex justify-end gap-2"><Button size="sm" variant="outline" leadingIcon={<Copy className="size-3.5" />} onClick={() => startClone(row)}>Clone</Button><Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => startEdit(row)}>Edit</Button></div> },
  ];

  return <>
    <PageHeader title="Order workflows" description="Build connected order stages, assign phase requirements, and reuse a workflow across any number of orders." actions={<Button leadingIcon={<Plus className="size-4" />} onClick={startNew}>New workflow</Button>} />
    <Alert tone="info" className="mb-5">Workflow changes are live definitions: every order assigned to a workflow refreshes its customer and administrator phase workspaces from the saved stage labels and capabilities. Existing phase files and questions remain associated with their stable stage key.</Alert>
    {workflows.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div> : (workflows.data ?? []).length ? <DataTable caption="Order workflows" columns={columns} rows={(workflows.data ?? []) as Workflow[]} rowKey={(row) => row.id} /> : <EmptyState icon={ClipboardList} title="No workflows" description="Create a workflow before assigning one to an order." action={<Button onClick={startNew}>New workflow</Button>} />}
    <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit order workflow" : "New order workflow"} description="Use a visual stage builder. Drag cards or use the arrows to set the connected order flow." footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button busy={save.isPending} disabled={name.trim().length < 2 || normalizedStages.length === 0 || invalidStages || duplicateKeys} leadingIcon={<Save className="size-4" />} onClick={() => save.mutate({ id: editing?.id, name: name.trim(), description: description.trim() || undefined, stages: normalizedStages, isDefault, active })}>Save workflow</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2"><Input label="Workflow name" value={name} onChange={(event) => setName(event.target.value)} required /><Input label="Workflow description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
        <Alert tone="info">Stage keys are stable technical references. Rename the <strong>stage label</strong> freely; keep a stage key when it already has customer files or questions so those materials remain visible in its updated workspace.</Alert>
        <div className="rounded-xl border border-line bg-surface-soft p-3"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-ink">Connected phase builder</p><p className="text-xs text-muted">Drag a stage card to reorder it, or use the arrow buttons.</p></div><Button size="sm" variant="outline" leadingIcon={<Plus className="size-3.5" />} onClick={addStage}>Add phase</Button></div>
          <div className="space-y-2">{stages.map((stage, index) => <div key={`${stage.key}-${index}`} draggable onDragStart={() => setDraggedStage(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedStage !== null) moveStage(draggedStage, index); setDraggedStage(null); }} className={`rounded-xl border bg-white p-4 shadow-sm ${draggedStage === index ? "border-teal ring-2 ring-teal/20" : "border-line"}`}>
            <div className="flex gap-3"><div className="flex flex-col items-center text-muted"><GripVertical className="mt-1 size-5 cursor-grab" /><span className="mt-2 rounded-full bg-teal px-2 py-0.5 text-xs font-bold text-white">{index + 1}</span>{index < stages.length - 1 ? <ArrowDown className="mt-2 size-4 text-teal" /> : null}</div><div className="min-w-0 flex-1"><div className="grid gap-3 md:grid-cols-[minmax(8rem,0.6fr)_minmax(12rem,1fr)]"><Input label="Stable stage key" value={stage.key} onChange={(event) => updateStage(index, { key: stageKey(event.target.value, index) })} help="Lowercase letters, numbers, and underscores." /><Input label="Customer-facing stage label" value={stage.label} onChange={(event) => updateStage(index, { label: event.target.value })} /></div><p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Customer actions enabled in this phase</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{CAPABILITIES.map((capability) => { const Icon = capability.icon; return <label key={capability.key} className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm ${stage.capabilities.includes(capability.key) ? "border-teal/50 bg-teal/5" : "border-line"}`}><Checkbox checked={stage.capabilities.includes(capability.key)} onChange={() => toggleCapability(index, capability.key)} label="" /><span><span className="flex items-center gap-1.5 font-medium text-ink"><Icon className="size-3.5 text-teal" />{capability.label}</span><span className="mt-0.5 block text-xs text-muted">{capability.description}</span></span></label>; })}</div></div><div className="flex flex-col gap-1"><Button size="sm" variant="ghost" aria-label="Move stage up" disabled={index === 0} onClick={() => moveStage(index, index - 1)}><ArrowUp className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Move stage down" disabled={index === stages.length - 1} onClick={() => moveStage(index, index + 1)}><ArrowDownUp className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Remove stage" disabled={stages.length === 1} onClick={() => removeStage(index)}><Trash2 className="size-4 text-danger" /></Button></div></div>
          </div>)}</div>
        </div>
        {duplicateKeys ? <Alert tone="danger">Each stage must use a unique stable key.</Alert> : null}{invalidStages ? <Alert tone="warning">Every stage needs a readable label, a stable key, and at least one enabled customer action.</Alert> : null}
        <div className="grid gap-3 md:grid-cols-2"><Checkbox label="Use as the default workflow for new orders" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} /><Checkbox label="Active and available for assignment" checked={active} onChange={(event) => setActive(event.target.checked)} /></div>
      </div>
    </Modal>
  </>;
}
