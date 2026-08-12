import { useState } from "react";
import { History, Newspaper, Plus, Send, Undo2 } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/Surface";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

interface ChangelogRow {
  id: number;
  version: string;
  title: string;
  bodyMarkdown: string;
  entryType: string;
  isPublic: boolean;
  releasedAt: string | Date;
  createdAt: string | Date;
}

const ENTRY_TYPES = [
  { value: "feature", label: "New feature" },
  { value: "improvement", label: "Improvement" },
  { value: "fix", label: "Bug fix" },
  { value: "security", label: "Security" },
];

const TYPE_TONE: Record<string, "success" | "teal" | "neutral" | "danger" | "warning"> = {
  feature: "success", improvement: "teal", fix: "neutral", security: "danger", breaking: "warning",
};

const emptyForm = { id: null as number | null, version: "", title: "", bodyMarkdown: "", entryType: "improvement", isPublic: false };

export function AdminChangelogPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [publication, setPublication] = useState<ChangelogRow | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);

  const list = trpc.admin.changelog.useQuery();
  const history = trpc.admin.changelogHistory.useQuery({ id: historyId ?? 0 }, { enabled: historyId !== null });
  const refresh = async () => { await utils.admin.changelog.invalidate(); await utils.admin.changelogHistory.invalidate(); };
  const create = trpc.admin.createChangelogEntry.useMutation({ onSuccess: async (result) => { toast.success(form.isPublic ? "Release published" : "Draft saved", form.isPublic ? "The update is now visible on the public changelog." : "Review and publish when it is ready."); setModalOpen(false); setForm({ ...emptyForm }); await refresh(); }, onError: (error) => toast.error("Could not save release", errorMessage(error)) });
  const update = trpc.admin.updateChangelogEntry.useMutation({ onSuccess: async () => { toast.success("Draft updated", "A new immutable revision has been recorded."); setModalOpen(false); setForm({ ...emptyForm }); await refresh(); }, onError: (error) => toast.error("Could not update release", errorMessage(error)) });
  const setPublic = trpc.admin.setChangelogEntryPublication.useMutation({ onSuccess: async (_result, variables) => { toast.success(variables.isPublic ? "Release published" : "Release unpublished", variables.isPublic ? "The update is now visible on the public changelog." : "The entry remains in the admin version history."); setPublication(null); await refresh(); }, onError: (error) => toast.error("Could not change publication", errorMessage(error)) });

  const rows = (list.data ?? []) as unknown as ChangelogRow[];
  const openCreate = () => { setForm({ ...emptyForm }); setModalOpen(true); };
  const openEdit = (row: ChangelogRow) => { setForm({ id: row.id, version: row.version, title: row.title, bodyMarkdown: row.bodyMarkdown, entryType: row.entryType, isPublic: row.isPublic }); setModalOpen(true); };
  const save = () => {
    const payload = { version: form.version.trim(), title: form.title.trim(), bodyMarkdown: form.bodyMarkdown.trim(), entryType: form.entryType as "feature" | "improvement" | "fix" | "security" };
    if (form.id) update.mutate({ id: form.id, ...payload });
    else create.mutate({ ...payload, isPublic: form.isPublic });
  };

  return <>
    <PageHeader title="Release history" description="Save feature and upgrade drafts, review their version history, then publish approved updates to the public website." actions={<Button onClick={openCreate} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New release draft</Button>} />
    <Card className="mb-6"><p className="text-sm text-ink"><strong>Publishing workflow:</strong> create a private draft, revise it as needed, inspect the immutable revision history, then publish it to <code>/changelog</code>. Unpublishing removes it from the public website but never removes its administrative history.</p></Card>

    {list.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : rows.length === 0 ? <EmptyState icon={Newspaper} title="No release entries" description="Create a private draft for the next feature, upgrade, or service update." action={<Button onClick={openCreate} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New release draft</Button>} /> : <div className="space-y-4">{rows.map((row) => <Card key={row.id}><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-muted">{row.version}</span><Badge tone={TYPE_TONE[row.entryType] ?? "neutral"}>{ENTRY_TYPES.find((type) => type.value === row.entryType)?.label ?? row.entryType}</Badge><Badge tone={row.isPublic ? "success" : "neutral"}>{row.isPublic ? "Published" : "Draft"}</Badge><span className="text-xs text-muted">{row.isPublic ? `Published ${formatDate(row.releasedAt)}` : `Created ${formatDate(row.createdAt)}`}</span></div><p className="mt-1 font-semibold text-ink">{row.title}</p>{row.bodyMarkdown ? <p className="mt-1 line-clamp-2 text-sm text-muted">{row.bodyMarkdown}</p> : null}</div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setHistoryId(row.id)} leadingIcon={<History className="size-3.5" aria-hidden="true" />}>History</Button><Button variant="ghost" size="sm" onClick={() => openEdit(row)}>Edit</Button><Button size="sm" variant={row.isPublic ? "outline" : "primary"} onClick={() => setPublication(row)} leadingIcon={row.isPublic ? <Undo2 className="size-3.5" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}>{row.isPublic ? "Unpublish" : "Publish"}</Button></div></div></Card>)}</div>}

    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? "Edit release draft" : "New release draft"} description={form.id ? "Saving creates an immutable revision. Publish separately after review." : "Drafts remain private until you explicitly publish them."}>
      <div className="space-y-4"><Input label="Release version" placeholder="v2.4.0" required value={form.version} onChange={(event) => setForm((value) => ({ ...value, version: event.target.value }))} /><Input label="Title" placeholder="What changed?" required value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} /><Select label="Type" value={form.entryType} onChange={(event) => setForm((value) => ({ ...value, entryType: event.target.value }))} options={ENTRY_TYPES} /><Textarea label="Details (Markdown)" rows={8} placeholder="Describe the feature, upgrade, or fix. Markdown is supported." value={form.bodyMarkdown} onChange={(event) => setForm((value) => ({ ...value, bodyMarkdown: event.target.value }))} />{!form.id ? <Checkbox label="Publish to the public website immediately" checked={form.isPublic} onChange={(event) => setForm((value) => ({ ...value, isPublic: event.target.checked }))} /> : null}<div className="flex justify-end gap-3 pt-2"><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button busy={create.isPending || update.isPending} disabled={!form.version.trim() || !form.title.trim() || form.bodyMarkdown.trim().length < 10} onClick={save}>{form.id ? "Save revision" : form.isPublic ? "Save and publish" : "Save draft"}</Button></div></div>
    </Modal>

    <Modal open={historyId !== null} onClose={() => setHistoryId(null)} title="Release version history" description="Each saved, published, and unpublished state is retained for audit and review." footer={<Button variant="outline" onClick={() => setHistoryId(null)}>Close</Button>}>
      {history.isLoading ? <Skeleton className="h-48 w-full" /> : <div className="space-y-3">{(history.data ?? []).map((revision) => <Card key={revision.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">Revision {revision.revisionNumber} · {revision.changeKind}</p><p className="mt-1 text-sm text-muted">{revision.version} — {revision.title}</p><Badge tone={revision.isPublic ? "success" : "neutral"}>{revision.isPublic ? "Public at this revision" : "Private at this revision"}</Badge></div><span className="text-xs text-muted">{formatDateTime(revision.createdAt)}</span></div></Card>)}</div>}
    </Modal>

    <ConfirmDialog open={publication !== null} onClose={() => setPublication(null)} onConfirm={() => { if (publication) setPublic.mutate({ id: publication.id, isPublic: !publication.isPublic }); }} title={publication?.isPublic ? "Unpublish this release?" : "Publish this release?"} message={publication?.isPublic ? "This removes the entry from the public website but keeps every revision in the admin history." : "This publishes the selected feature or upgrade to the public changelog immediately."} confirmLabel={publication?.isPublic ? "Unpublish release" : "Publish release"} cancelLabel="Cancel" variant={publication?.isPublic ? "danger" : "primary"} busy={setPublic.isPending} />
  </>;
}
