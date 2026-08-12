import { useState } from "react";
import { Plus, Pencil, ClipboardList } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, EmptyState, Badge } from "@/components/ui/Surface";
import { Input, Textarea, Checkbox, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

type Template = { id: number; name: string; question: string; phase: string; required: boolean; sortOrder: number; isActive: boolean };

export function AdminQuestionTemplates() {
  const toast = useToast(); const utils = trpc.useUtils();
  const list = trpc.admin.questionTemplates.useQuery({ includeInactive: true });
  const [editing, setEditing] = useState<Template | null>(null); const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [question, setQuestion] = useState(""); const [phase, setPhase] = useState<"phase_1" | "phase_2">("phase_1"); const [required, setRequired] = useState(true); const [active, setActive] = useState(true);
  const save = trpc.admin.upsertQuestionTemplate.useMutation({ onSuccess() { void utils.admin.questionTemplates.invalidate(); toast.success("Question template saved"); close(); }, onError(e) { toast.error("Could not save template", errorMessage(e)); } });
  function close() { setOpen(false); setEditing(null); }
  function create() { setEditing(null); setName(""); setQuestion(""); setPhase("phase_1"); setRequired(true); setActive(true); setOpen(true); }
  function edit(t: Template) { setEditing(t); setName(t.name); setQuestion(t.question); setPhase(t.phase === "phase_2" ? "phase_2" : "phase_1"); setRequired(t.required); setActive(t.isActive); setOpen(true); }
  const columns: Column<Template>[] = [
    { key: "name", header: "Template", cell: row => <div><p className="font-medium text-ink">{row.name}</p><p className="mt-1 line-clamp-2 text-sm text-body">{row.question}</p></div> },
    { key: "phase", header: "Phase", cell: row => <Badge tone={row.phase === "phase_2" ? "teal" : "gold"}>{row.phase === "phase_2" ? "Phase 2" : "Phase 1"}</Badge> },
    { key: "required", header: "Customer answer", cell: row => <Badge tone={row.required ? "warning" : "neutral"}>{row.required ? "Required" : "Optional"}</Badge> },
    { key: "active", header: "Availability", cell: row => <Badge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Hidden"}</Badge> },
    { key: "actions", header: "", cell: row => <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => edit(row)}>Edit</Button> },
  ];
    return <><PageHeader title="Order Question Banks" description="Maintain reusable Phase 1 and Phase 2 questions that staff can apply to any order." actions={<Button variant="primary" leadingIcon={<Plus className="size-4" />} onClick={create}>New template</Button>} />
    <Card><CardHeader title="Question bank" description="Templates are copied into an order so later edits never alter its historical questions." />{(list.data ?? []).length ? <DataTable caption="Order question bank" rows={(list.data ?? []) as Template[]} columns={columns} rowKey={row => row.id} /> : <EmptyState icon={ClipboardList} title="No templates yet" description="Create a reusable Phase 1 or Phase 2 question that staff can apply to an order." action={<Button variant="primary" onClick={create}>Create template</Button>} />}</Card>
    <Modal open={open} onClose={close} title={editing ? "Edit question template" : "New question template"} footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button variant="primary" busy={save.isPending} disabled={name.trim().length < 2 || question.trim().length < 5} onClick={() => save.mutate({ id: editing?.id, name: name.trim(), question: question.trim(), phase, required, isActive: active, sortOrder: editing?.sortOrder ?? 0 })}>Save template</Button></>}><div className="space-y-4"><Input label="Template name" value={name} onChange={e => setName(e.target.value)} required /><Select label="Order phase" value={phase} onChange={e => setPhase(e.target.value as "phase_1" | "phase_2")} options={[{ value: "phase_1", label: "Phase 1" }, { value: "phase_2", label: "Phase 2" }]} /><Textarea label="Question" value={question} onChange={e => setQuestion(e.target.value)} rows={6} required /><Checkbox label="Require an answer before delivery" checked={required} onChange={e => setRequired(e.target.checked)} /><Checkbox label="Available to staff" checked={active} onChange={e => setActive(e.target.checked)} /></div></Modal>
  </>;
}
