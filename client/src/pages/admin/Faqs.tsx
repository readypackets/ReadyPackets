import { useState } from "react";
import { CheckCircle2, HelpCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Textarea } from "@/components/ui/Field";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

type Faq = {
  id: number;
  question: string;
  answerMarkdown: string;
  category: string | null;
  sortOrder: number;
  isPublished: boolean;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};
type Form = { id?: number; question: string; answerMarkdown: string; category: string; sortOrder: string; isPublished: boolean };
const blank = (): Form => ({ question: "", answerMarkdown: "", category: "", sortOrder: "0", isPublished: false });

export function AdminFaqsPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const list = trpc.faqs.list.useQuery();
  const [editing, setEditing] = useState<Form | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const refresh = () => {
    void utils.faqs.list.invalidate();
    void utils.faqs.visible.invalidate();
  };
  const save = trpc.faqs.upsert.useMutation({
    onSuccess() { refresh(); setEditing(null); toast.success("FAQ saved"); },
    onError(error) { toast.error("Could not save FAQ", errorMessage(error)); },
  });
  const publish = trpc.faqs.setPublished.useMutation({
    onSuccess(_data, variables) { refresh(); toast.success(variables.isPublished ? "FAQ published" : "FAQ unpublished"); },
    onError(error) { toast.error("Could not change FAQ visibility", errorMessage(error)); },
  });
  const remove = trpc.faqs.remove.useMutation({
    onSuccess() { refresh(); setDeleteId(null); toast.success("FAQ deleted"); },
    onError(error) { toast.error("Could not delete FAQ", errorMessage(error)); },
  });
  const openEdit = (faq: Faq) => setEditing({ id: faq.id, question: faq.question, answerMarkdown: faq.answerMarkdown, category: faq.category ?? "", sortOrder: String(faq.sortOrder), isPublished: faq.isPublished });

  if (list.isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-96 w-full" /></div>;

  return <>
    <PageHeader title="Public FAQs" description="Create concise answers for the public website. A question remains private until you explicitly publish it." actions={<Button variant="primary" leadingIcon={<Plus className="size-4" />} onClick={() => setEditing(blank())}>New FAQ</Button>} />
    <Card>
      <CardHeader title="FAQ publishing workspace" description="Published questions appear at /faq. Drafts remain visible only to administrators." />
      {(list.data ?? []).length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Question</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Public site</th><th className="px-3 py-2">Actions</th></tr></thead><tbody>{(list.data as Faq[]).map((faq) => <tr key={faq.id} className="border-b border-line/70"><td className="max-w-[28rem] px-3 py-4 font-medium text-ink">{faq.question}</td><td className="px-3 py-4">{faq.category || "General"}</td><td className="px-3 py-4 tabular-nums">{faq.sortOrder}</td><td className="px-3 py-4"><Badge tone={faq.isPublished ? "success" : "neutral"}>{faq.isPublished ? "Published" : "Draft"}</Badge></td><td className="px-3 py-4"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => openEdit(faq)}>Edit</Button><Button size="sm" variant="outline" leadingIcon={faq.isPublished ? undefined : <CheckCircle2 className="size-3.5" />} busy={publish.isPending} onClick={() => publish.mutate({ id: faq.id, isPublished: !faq.isPublished })}>{faq.isPublished ? "Unpublish" : "Publish"}</Button><Button aria-label={`Delete ${faq.question}`} size="sm" variant="ghost" leadingIcon={<Trash2 className="size-3.5" />} onClick={() => setDeleteId(faq.id)}>Delete</Button></div></td></tr>)}</tbody></table></div> : <EmptyState icon={HelpCircle} title="No FAQs created" description="Create your first answer, then selectively publish it to the public website." action={<Button variant="primary" onClick={() => setEditing(blank())}>Create FAQ</Button>} />}
    </Card>

    {editing ? <Modal open onClose={() => setEditing(null)} title={editing.id ? "Edit public FAQ" : "New public FAQ"} description="Use plain text or concise Markdown-style formatting. Public answers are displayed as safe text on the website." size="lg" footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" busy={save.isPending} disabled={editing.question.trim().length < 8 || editing.answerMarkdown.trim().length < 8} onClick={() => save.mutate({ id: editing.id, question: editing.question.trim(), answerMarkdown: editing.answerMarkdown.trim(), category: editing.category.trim() || undefined, sortOrder: Number(editing.sortOrder) || 0, isPublished: editing.isPublished })}>{editing.isPublished ? "Save & publish" : "Save draft"}</Button></>}><div className="space-y-4"><Input label="Question" value={editing.question} onChange={(event) => setEditing({ ...editing, question: event.target.value })} required /><Input label="Category" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} placeholder="Payments, Orders, Account access" /><Input label="Display order" help="Lower numbers appear first. Questions with the same number are sorted alphabetically." type="number" value={editing.sortOrder} onChange={(event) => setEditing({ ...editing, sortOrder: event.target.value })} /><Textarea label="Answer" rows={10} value={editing.answerMarkdown} onChange={(event) => setEditing({ ...editing, answerMarkdown: event.target.value })} required /><Checkbox label="Publish this FAQ to the public website" checked={editing.isPublished} onChange={(event) => setEditing({ ...editing, isPublished: event.target.checked })} /></div></Modal> : null}
    <ConfirmDialog open={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId !== null) remove.mutate({ id: deleteId }); }} title="Delete this FAQ?" message="This permanently removes the question and immediately removes it from the public website if it is published." confirmLabel="Delete FAQ" variant="danger" busy={remove.isPending} />
  </>;
}
