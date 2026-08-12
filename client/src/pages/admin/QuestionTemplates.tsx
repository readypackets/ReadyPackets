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
type QuestionPhase = "phase_1" | "phase_2" | "both" | "unassigned";
const phaseLabel = (phase: string) => ({ phase_1: "Phase 1", phase_2: "Phase 2", both: "Both phases", unassigned: "No phase" }[phase] ?? "No phase");

export function AdminQuestionTemplates() {
  const toast = useToast(); const utils = trpc.useUtils();
  const list = trpc.admin.questionTemplates.useQuery({ includeInactive: true });
  const [editing, setEditing] = useState<Template | null>(null); const [open, setOpen] = useState(false); const [bulkOpen, setBulkOpen] = useState(false);
  const [name, setName] = useState(""); const [question, setQuestion] = useState(""); const [phase, setPhase] = useState<QuestionPhase>("unassigned"); const [required, setRequired] = useState(true); const [active, setActive] = useState(true);
  const [bulkPrefix, setBulkPrefix] = useState("Question"); const [bulkQuestions, setBulkQuestions] = useState(""); const [bulkPhase, setBulkPhase] = useState<QuestionPhase>("phase_1"); const [bulkRequired, setBulkRequired] = useState(true);
  const save = trpc.admin.upsertQuestionTemplate.useMutation({ onSuccess() { void utils.admin.questionTemplates.invalidate(); toast.success("Question template saved"); close(); }, onError(e) { toast.error("Could not save template", errorMessage(e)); } });
  const bulkCreate = trpc.admin.bulkCreateQuestionTemplates.useMutation({ onSuccess(result) { void utils.admin.questionTemplates.invalidate(); setBulkOpen(false); setBulkQuestions(""); toast.success("Question templates created", `${result.count} question(s) were added to the bank.`); }, onError(e) { toast.error("Could not create question templates", errorMessage(e)); } });
  function close() { setOpen(false); setEditing(null); }
  function create() { setEditing(null); setName(""); setQuestion(""); setPhase("unassigned"); setRequired(true); setActive(true); setOpen(true); }
  function edit(t: Template) { setEditing(t); setName(t.name); setQuestion(t.question); setPhase((["phase_1", "phase_2", "both", "unassigned"].includes(t.phase) ? t.phase : "unassigned") as QuestionPhase); setRequired(t.required); setActive(t.isActive); setOpen(true); }
  const columns: Column<Template>[] = [
    { key: "name", header: "Template", cell: row => <div><p className="font-medium text-ink">{row.name}</p><p className="mt-1 line-clamp-2 text-sm text-body">{row.question}</p></div> },
    { key: "phase", header: "Phase", cell: row => <Badge tone={row.phase === "phase_2" ? "teal" : row.phase === "unassigned" ? "neutral" : "gold"}>{phaseLabel(row.phase)}</Badge> },
    { key: "required", header: "Customer answer", cell: row => <Badge tone={row.required ? "warning" : "neutral"}>{row.required ? "Required" : "Optional"}</Badge> },
    { key: "active", header: "Availability", cell: row => <Badge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Hidden"}</Badge> },
    { key: "actions", header: "", cell: row => <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => edit(row)}>Edit</Button> },
  ];
    return <><PageHeader title="Order Question Banks" description="Maintain reusable Phase 1 and Phase 2 questions that staff can apply to any order." actions={<div className="flex gap-2"><Button variant="outline" onClick={() => setBulkOpen(true)}>Bulk add questions</Button><Button variant="primary" leadingIcon={<Plus className="size-4" />} onClick={create}>New template</Button></div>} />
    <Card><CardHeader title="Question bank" description="Templates are copied into an order so later edits never alter its historical questions." />{(list.data ?? []).length ? <DataTable caption="Order question bank" rows={(list.data ?? []) as Template[]} columns={columns} rowKey={row => row.id} /> : <EmptyState icon={ClipboardList} title="No templates yet" description="Create a reusable Phase 1 or Phase 2 question that staff can apply to an order." action={<Button variant="primary" onClick={create}>Create template</Button>} />}</Card>
    <Modal open={open} onClose={close} title={editing ? "Edit question template" : "New question template"} footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button variant="primary" busy={save.isPending} disabled={name.trim().length < 2 || question.trim().length < 5} onClick={() => save.mutate({ id: editing?.id, name: name.trim(), question: question.trim(), phase, required, isActive: active, sortOrder: editing?.sortOrder ?? 0 })}>Save template</Button></>}><div className="space-y-4"><Input label="Template name" value={name} onChange={e => setName(e.target.value)} required /><Select label="Order phase" help="Both phases creates one assigned question in Phase 1 and another in Phase 2. No phase keeps the question as a general order question." value={phase} onChange={e => setPhase(e.target.value as QuestionPhase)} options={[{ value: "unassigned", label: "No phase" }, { value: "phase_1", label: "Phase 1" }, { value: "phase_2", label: "Phase 2" }, { value: "both", label: "Both phases" }]} /><Textarea label="Question" value={question} onChange={e => setQuestion(e.target.value)} rows={6} required /><Checkbox label="Require an answer before delivery" checked={required} onChange={e => setRequired(e.target.checked)} /><Checkbox label="Available to staff" checked={active} onChange={e => setActive(e.target.checked)} /></div></Modal>
    <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk add question templates" description="Each nonblank line becomes one independently editable template." footer={<><Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button><Button busy={bulkCreate.isPending} disabled={bulkPrefix.trim().length < 2 || bulkQuestions.trim().length < 5} onClick={() => bulkCreate.mutate({ namePrefix: bulkPrefix.trim(), questions: bulkQuestions, phase: bulkPhase, required: bulkRequired, isActive: true })}>Create one template per line</Button></>}><div className="space-y-4"><Input label="Template name prefix" value={bulkPrefix} onChange={e => setBulkPrefix(e.target.value)} help="Names are numbered automatically, for example “Discovery 1”." /><Select label="Order phase" value={bulkPhase} onChange={e => setBulkPhase(e.target.value as QuestionPhase)} options={[{ value: "unassigned", label: "No phase" }, { value: "phase_1", label: "Phase 1" }, { value: "phase_2", label: "Phase 2" }, { value: "both", label: "Both phases" }]} /><Textarea label="Questions — one per line" rows={10} value={bulkQuestions} onChange={e => setBulkQuestions(e.target.value)} help="Blank lines and duplicate questions are ignored. A maximum of 100 questions is created at once." /><Checkbox label="Require an answer before delivery" checked={bulkRequired} onChange={e => setBulkRequired(e.target.checked)} /></div></Modal>
  </>;
}
