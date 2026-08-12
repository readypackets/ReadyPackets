import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/Surface";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

type Audience = "all" | "customers" | "staff" | "selected";
type Form = { id?: number; title: string; bodyMarkdown: string; audience: Audience; recipientUserIds: number[]; isActive: boolean; startsAt: string; endsAt: string };
const emptyForm: Form = { title: "", bodyMarkdown: "", audience: "all", recipientUserIds: [], isActive: true, startsAt: "", endsAt: "" };
type CustomerOption = { id: number; name: string; email: string; role: string };

export function AdminAnnouncementsPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Form | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const list = trpc.tier3.announcements.list.useQuery();
  const customers = trpc.admin.customers.useQuery({ limit: 200 });
  const save = trpc.tier3.announcements.upsert.useMutation({
    async onSuccess() { await utils.tier3.announcements.list.invalidate(); setForm(null); toast.success("Announcement saved"); },
    onError(error) { toast.error("Could not save announcement", errorMessage(error)); },
  });
  const remove = trpc.tier3.announcements.remove.useMutation({
    async onSuccess() { await utils.tier3.announcements.list.invalidate(); setRemoveId(null); toast.success("Announcement removed"); },
    onError(error) { toast.error("Could not remove announcement", errorMessage(error)); },
  });
  const customerRows = (customers.data ?? []) as unknown as CustomerOption[];
  const open = (item?: NonNullable<typeof list.data>[number]) => setForm(item ? {
    id: item.id,
    title: item.title,
    bodyMarkdown: item.bodyMarkdown,
    audience: item.audience as Audience,
    recipientUserIds: item.recipientUserIds ?? [],
    isActive: item.isActive,
    startsAt: item.startsAt ? new Date(item.startsAt).toISOString().slice(0, 16) : "",
    endsAt: item.endsAt ? new Date(item.endsAt).toISOString().slice(0, 16) : "",
  } : { ...emptyForm });
  const toggleRecipient = (id: number, checked: boolean) => setForm((value) => value && ({ ...value, recipientUserIds: checked ? [...new Set([...value.recipientUserIds, id])] : value.recipientUserIds.filter((userId) => userId !== id) }));

  return <>
    <PageHeader title="Portal announcements" description="Publish updates to all portal users, a role-based audience, or selected accounts." actions={<Button onClick={() => open()} leadingIcon={<Plus className="size-4" />}>New announcement</Button>} />
    {(list.data ?? []).length === 0 ? <Card><EmptyState icon={Plus} title="No announcements" description="Create an announcement to communicate with customers in their portal." /></Card> : <div className="space-y-3">{(list.data ?? []).map((item) => <Card key={item.id} className="flex items-start gap-4 p-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{item.title}</p><Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Active" : "Inactive"}</Badge><Badge>{item.audience === "selected" ? `${item.recipientUserIds.length} selected account(s)` : item.audience}</Badge></div><p className="mt-1 whitespace-pre-wrap text-sm text-body">{item.bodyMarkdown}</p></div><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => open(item)} leadingIcon={<Pencil className="size-4" />}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setRemoveId(item.id)} leadingIcon={<Trash2 className="size-4" />}>Delete</Button></div></Card>)}</div>}
    {form ? <Modal open onClose={() => setForm(null)} title={form.id ? "Edit announcement" : "New announcement"} size="lg"><div className="space-y-4"><FieldShell label="Title" required><Input value={form.title} onChange={(event) => setForm((value) => value && { ...value, title: event.target.value })} /></FieldShell><FieldShell label="Message" required><Textarea rows={7} value={form.bodyMarkdown} onChange={(event) => setForm((value) => value && { ...value, bodyMarkdown: event.target.value })} /></FieldShell><div className="grid gap-4 sm:grid-cols-2"><FieldShell label="Audience"><Select value={form.audience} onChange={(event) => setForm((value) => value && { ...value, audience: event.target.value as Audience, recipientUserIds: event.target.value === "selected" ? value.recipientUserIds : [] })}><option value="all">All portal users</option><option value="customers">All customers</option><option value="staff">Staff and administrators</option><option value="selected">Selected accounts</option></Select></FieldShell><FieldShell label="Status"><Select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((value) => value && { ...value, isActive: event.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></Select></FieldShell></div>
      {form.audience === "selected" ? <Card className="border-teal/30 bg-surface-soft"><CardHeader title={<span className="flex items-center gap-2"><Users className="size-4 text-teal" />Selected recipients</span>} description="Choose individual accounts or select every currently listed account. Only these users will see this announcement." /><div className="mt-4 flex items-center justify-between border-b border-line pb-3"><Checkbox label="Select all listed accounts" checked={customerRows.length > 0 && customerRows.every((user) => form.recipientUserIds.includes(user.id))} onChange={(event) => setForm((value) => value && ({ ...value, recipientUserIds: event.target.checked ? customerRows.map((user) => user.id) : [] }))} /><span className="text-xs text-muted">{form.recipientUserIds.length} selected</span></div><div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{customerRows.map((user) => <Checkbox key={user.id} label={`${user.name} — ${user.email}`} checked={form.recipientUserIds.includes(user.id)} onChange={(event) => toggleRecipient(user.id, event.target.checked)} />)}</div></Card> : null}
      <div className="grid gap-4 sm:grid-cols-2"><FieldShell label="Starts (optional)"><Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((value) => value && { ...value, startsAt: event.target.value })} /></FieldShell><FieldShell label="Ends (optional)"><Input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((value) => value && { ...value, endsAt: event.target.value })} /></FieldShell></div><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button busy={save.isPending} disabled={!form.title.trim() || !form.bodyMarkdown.trim() || (form.audience === "selected" && form.recipientUserIds.length === 0)} onClick={() => save.mutate({ id: form.id, title: form.title, bodyMarkdown: form.bodyMarkdown, audience: form.audience, recipientUserIds: form.recipientUserIds, isActive: form.isActive, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined, endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined })}>Save announcement</Button></div></div></Modal> : null}
    <ConfirmDialog open={removeId !== null} onClose={() => setRemoveId(null)} onConfirm={() => { if (removeId !== null) remove.mutate({ id: removeId }); }} title="Delete announcement?" message="This removes it from the customer portal." confirmLabel="Delete" variant="danger" busy={remove.isPending} />
  </>;
}
