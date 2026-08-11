/**
 * Admin CRM page — contacts, notes, and tags.
 */
import { useState } from "react";
import { Search, Plus, Trash2, MessageSquare, Tag } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/Surface";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "teal" | "navy"> = {
  lead: "teal", prospect: "navy", customer: "success", churned: "neutral", blocked: "danger",
};

function ContactRow({ contact, onSelect }: { contact: { id: number; firstName: string | null; lastName: string | null; company: string | null; status: string; createdAt: Date | string }; onSelect: () => void }) {
  return (
    <tr className="cursor-pointer hover:bg-surface-raised transition-colors" onClick={onSelect}>
      <td className="px-4 py-3 text-sm font-medium text-ink">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</td>
      <td className="px-4 py-3 text-sm text-body">{contact.company ?? "—"}</td>
      <td className="px-4 py-3"><Badge tone={STATUS_TONES[contact.status] ?? "neutral"}>{contact.status}</Badge></td>
      <td className="px-4 py-3 text-sm text-muted">{new Date(contact.createdAt).toLocaleDateString()}</td>
    </tr>
  );
}

export function AdminCRM() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selected, setSelected] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", company: "", email: "", source: "", status: "lead" });

  const contacts = trpc.crm.listContacts.useQuery({ search: search || undefined, status: (statusFilter as "lead" | "prospect" | "customer" | "churned" | "blocked") || undefined });
  const detail = trpc.crm.getContact.useQuery({ id: selected! }, { enabled: selected !== null });
  const tags = trpc.crm.listTags.useQuery();
  const utils = trpc.useUtils();

  const createContact = trpc.crm.createContact.useMutation({ onSuccess: () => { utils.crm.listContacts.invalidate(); setCreateOpen(false); setForm({ firstName: "", lastName: "", company: "", email: "", source: "", status: "lead" }); toast.success("Contact created"); } });
  const deleteContact = trpc.crm.deleteContact.useMutation({ onSuccess: () => { utils.crm.listContacts.invalidate(); setSelected(null); setDeleteId(null); toast.success("Contact deleted"); } });
  const addNote = trpc.crm.addNote.useMutation({ onSuccess: () => { utils.crm.getContact.invalidate({ id: selected! }); setNoteBody(""); toast.success("Note added"); } });

  const contactList = contacts.data?.contacts ?? [];

  return (
    <>
      <PageHeader
        title="CRM"
        description="Manage contacts, leads, and customer relationships."
        actions={<Button onClick={() => setCreateOpen(true)} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New contact</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts…" className="pl-9" />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
          <option value="">All statuses</option>
          {["lead", "prospect", "customer", "churned", "blocked"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          {contactList.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No contacts" description="Create your first CRM contact to get started." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Name</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Company</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Created</th></tr></thead><tbody>
              {contactList.map((c) => (
                <ContactRow key={c.id} contact={c} onSelect={() => setSelected(c.id)} />
              ))}
            </tbody></table></div>
          )}
        </Card>

        {selected !== null && detail.data ? (
          <Card>
            <CardHeader
              title={[detail.data.contact.firstName, detail.data.contact.lastName].filter(Boolean).join(" ") || "Contact"}
              actions={
                <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setDeleteId(selected)}>Delete</Button>
              }
            />
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Company</dt><dd className="text-ink">{detail.data.contact.company ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Status</dt><dd><Badge tone={STATUS_TONES[detail.data.contact.status] ?? "neutral"}>{detail.data.contact.status}</Badge></dd></div>
              <div className="flex justify-between"><dt className="text-muted">Source</dt><dd className="text-ink">{detail.data.contact.source ?? "—"}</dd></div>
            </dl>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-ink mb-3">Notes ({detail.data.notes.length})</h3>
              {detail.data.notes.length === 0 ? (
                <p className="text-sm text-muted">No notes yet.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.data.notes.map((n) => (
                    <li key={n.id} className="rounded-lg border border-line p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge>{n.noteType}</Badge>
                        <span className="text-xs text-muted">{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-body whitespace-pre-wrap">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 space-y-2">
                <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note…" rows={3} />
                <Button size="sm" onClick={() => addNote.mutate({ contactId: selected, body: noteBody })} busy={addNote.isPending} disabled={!noteBody.trim()}>Add note</Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex h-40 items-center justify-center text-sm text-muted">Select a contact to view details.</div>
          </Card>
        )}
      </div>

      {/* Create contact modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New contact" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FieldShell label="First name"><Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></FieldShell>
            <FieldShell label="Last name"><Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></FieldShell>
          </div>
          <FieldShell label="Company"><Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} /></FieldShell>
          <FieldShell label="Email"><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></FieldShell>
          <FieldShell label="Source"><Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder="e.g. referral, website, event" /></FieldShell>
          <FieldShell label="Status">
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {["lead", "prospect", "customer", "churned", "blocked"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FieldShell>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createContact.mutate({ ...form, status: form.status as "lead" | "prospect" | "customer" | "churned" | "blocked" })} busy={createContact.isPending}>Create</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deleteContact.mutate({ id: deleteId }); }}
        title="Delete contact"
        message="This will permanently delete the contact and all associated notes. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        busy={deleteContact.isPending}
      />
    </>
  );
}
