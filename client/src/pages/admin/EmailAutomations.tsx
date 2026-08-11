import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Card, EmptyState } from "../../components/ui/Surface";
import { Button } from "../../components/ui/Button";
import { FieldShell, Input, Select } from "../../components/ui/Field";
import { Modal, ConfirmDialog } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Surface";
import { useToast } from "../../components/ui/Toast";

const TRIGGER_EVENTS = [
  { value: "user.registered", label: "New user registration" },
  { value: "user.email_verified", label: "Email address verified" },
  { value: "order.created", label: "Order created" },
  { value: "order.phase_changed", label: "Order phase changed" },
  { value: "order.delivered", label: "Order delivered" },
  { value: "order.closed", label: "Order closed" },
  { value: "ticket.created", label: "Support ticket opened" },
  { value: "ticket.replied", label: "Support ticket reply" },
  { value: "payment.succeeded", label: "Payment succeeded" },
  { value: "payment.failed", label: "Payment failed" },
  { value: "review.approved", label: "Review approved" },
];

interface AutomationForm {
  name: string;
  description: string;
  triggerEvent: string;
  templateKey: string;
  delayMinutes: string;
  enabled: boolean;
}

const emptyForm: AutomationForm = {
  name: "",
  description: "",
  triggerEvent: "user.registered",
  templateKey: "",
  delayMinutes: "0",
  enabled: true,
};

export default function EmailAutomations() {
  const { success, error } = useToast();
  const utils = trpc.useUtils();
  const list = trpc.emailAutomations.list.useQuery();
  const createMut = trpc.emailAutomations.create.useMutation();
  const updateMut = trpc.emailAutomations.update.useMutation();
  const deleteMut = trpc.emailAutomations.delete.useMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AutomationForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(a: NonNullable<typeof list.data>[number]) {
    setEditId(a.id);
    setForm({
      name: a.name,
      description: a.description ?? "",
      triggerEvent: a.triggerEvent,
      templateKey: a.templateKey,
      delayMinutes: String(a.delayMinutes),
      enabled: a.enabled,
    });
    setModalOpen(true);
  }

  async function save() {
    const delay = parseInt(form.delayMinutes, 10);
    if (editId !== null) {
      await updateMut.mutateAsync({
        id: editId,
        name: form.name,
        description: form.description || undefined,
        triggerEvent: form.triggerEvent,
        templateKey: form.templateKey,
        delayMinutes: isNaN(delay) ? 0 : delay,
        enabled: form.enabled,
      });
      success("Automation updated.");
    } else {
      await createMut.mutateAsync({
        name: form.name,
        description: form.description || undefined,
        triggerEvent: form.triggerEvent,
        templateKey: form.templateKey,
        delayMinutes: isNaN(delay) ? 0 : delay,
        enabled: form.enabled,
      });
      success("Automation created.");
    }
    setModalOpen(false);
    void utils.emailAutomations.list.invalidate();
  }

  async function confirmDelete() {
    if (deleteId === null) return;
    await deleteMut.mutateAsync({ id: deleteId });
    success("Automation deleted.");
    setDeleteId(null);
    void utils.emailAutomations.list.invalidate();
  }

  const eventLabel = (v: string) => TRIGGER_EVENTS.find((e) => e.value === v)?.label ?? v;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Automations</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Automatically send emails when platform events occur.
          </p>
        </div>
        <Button onClick={openCreate} variant="primary">Add automation</Button>
      </div>

      {list.isLoading ? (
        <Card className="p-8 text-center text-gray-400">Loading…</Card>
      ) : !list.data?.length ? (
        <EmptyState
          title="No automations yet"
          description="Create an automation to send emails automatically when events occur."
          action={<Button onClick={openCreate} variant="primary">Add automation</Button>}
        />
      ) : (
        <div className="space-y-3">
          {list.data.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">{a.name}</span>
                    <Badge tone={a.enabled ? "success" : "neutral"}>
                      {a.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                  {a.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{a.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                    <span>
                      <span className="font-medium">Trigger:</span> {eventLabel(a.triggerEvent)}
                    </span>
                    <span>
                      <span className="font-medium">Template:</span>{" "}
                      <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{a.templateKey}</code>
                    </span>
                    <span>
                      <span className="font-medium">Delay:</span>{" "}
                      {a.delayMinutes === 0 ? "Immediate" : `${a.delayMinutes} min`}
                    </span>
                    <span>
                      <span className="font-medium">Sent:</span> {a.runCount} times
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(a)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(a.id)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId !== null ? "Edit automation" : "New automation"}
      >
        <div className="space-y-4 p-1">
          <FieldShell label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Welcome email"
            />
          </FieldShell>
          <FieldShell label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
            />
          </FieldShell>
          <FieldShell label="Trigger event" required>
            <Select
              value={form.triggerEvent}
              onChange={(e) => setForm((f) => ({ ...f, triggerEvent: e.target.value }))}
            >
              {TRIGGER_EVENTS.map((ev) => (
                <option key={ev.value} value={ev.value}>{ev.label}</option>
              ))}
            </Select>
          </FieldShell>
          <FieldShell label="Email template key" required>
            <Input
              value={form.templateKey}
              onChange={(e) => setForm((f) => ({ ...f, templateKey: e.target.value }))}
              placeholder="welcome_email"
            />
          </FieldShell>
          <FieldShell label="Delay (minutes)">
            <Input
              value={form.delayMinutes}
              onChange={(e) => setForm((f) => ({ ...f, delayMinutes: e.target.value }))}
              type="number"
              min={0}
              placeholder="0 = immediate"
            />
          </FieldShell>
          <FieldShell label="Status">
            <Select
              value={form.enabled ? "true" : "false"}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.value === "true" }))}
            >
              <option value="true">Active</option>
              <option value="false">Disabled</option>
            </Select>
          </FieldShell>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={save}
              busy={createMut.isPending || updateMut.isPending}
              disabled={!form.name || !form.triggerEvent || !form.templateKey}
            >
              {editId !== null ? "Save changes" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete automation"
        message="This automation will be permanently deleted and will no longer fire. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setDeleteId(null)}
        busy={deleteMut.isPending}
        variant="danger"
      />
    </div>
  );
}
