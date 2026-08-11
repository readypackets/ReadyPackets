/**
 * Admin Scheduling page — availability slots and meeting bookings.
 */
import { useState } from "react";
import { Calendar, Clock, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select } from "@/components/ui/Field";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/Surface";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

const BOOKING_STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "teal"> = {
  pending: "warning", confirmed: "teal", cancelled: "danger", completed: "success", no_show: "neutral",
};

export function AdminScheduling() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"slots" | "bookings">("slots");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteSlotId, setDeleteSlotId] = useState<number | null>(null);
  const [form, setForm] = useState({ slotType: "consultation", startsAt: "", endsAt: "", durationMinutes: 30, maxBookings: 1, notes: "" });

  const slots = trpc.tier3.scheduling.listSlots.useQuery();
  const bookings = trpc.tier3.scheduling.listBookings.useQuery({ limit: 100 });
  const utils = trpc.useUtils();

  const createSlot = trpc.tier3.scheduling.createSlot.useMutation({
    onSuccess: () => { utils.tier3.scheduling.listSlots.invalidate(); setCreateOpen(false); toast.success("Slot created"); },
    onError: (e) => toast.error("Error", e.message),
  });
  const deleteSlot = trpc.tier3.scheduling.deleteSlot.useMutation({
    onSuccess: () => { utils.tier3.scheduling.listSlots.invalidate(); setDeleteSlotId(null); toast.success("Slot deleted"); },
  });
  const updateBooking = trpc.tier3.scheduling.updateBookingStatus.useMutation({
    onSuccess: () => { utils.tier3.scheduling.listBookings.invalidate(); toast.success("Booking updated"); },
  });

  const slotList = slots.data ?? [];
  const bookingList = bookings.data ?? [];

  return (
    <>
      <PageHeader
        title="Scheduling"
        description="Manage availability slots and customer meeting bookings."
        actions={<Button onClick={() => setCreateOpen(true)} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New slot</Button>}
      />

      <div className="mb-4 flex gap-2 border-b border-line">
        {(["slots", "bookings"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? "border-teal text-teal" : "border-transparent text-muted hover:text-ink"}`}>
            {tab === "slots" ? `Availability slots (${slotList.length})` : `Bookings (${bookingList.length})`}
          </button>
        ))}
      </div>

      {activeTab === "slots" && (
        <Card>
          {slotList.length === 0 ? (
            <EmptyState icon={Calendar} title="No availability slots" description="Create slots to allow customers to book meetings." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Type</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Starts</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Ends</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Duration</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Bookings</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Available</th></tr></thead><tbody>
              {slotList.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-4 py-3"><Badge>{s.slotType}</Badge></td>
                  <td className="px-4 py-3 text-sm text-ink">{new Date(s.startsAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-body">{new Date(s.endsAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-body">{s.durationMinutes}m</td>
                  <td className="px-4 py-3 text-sm text-body">{s.currentBookings}/{s.maxBookings}</td>
                  <td className="px-4 py-3"><Badge tone={s.isAvailable ? "success" : "neutral"}>{s.isAvailable ? "Yes" : "No"}</Badge></td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setDeleteSlotId(s.id)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}

      {activeTab === "bookings" && (
        <Card>
          {bookingList.length === 0 ? (
            <EmptyState icon={Clock} title="No bookings" description="Customer bookings will appear here." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Slot</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Customer</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Created</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Actions</th></tr></thead><tbody>
              {bookingList.map((b) => (
                <tr key={b.id} className="border-t border-line">
                  <td className="px-4 py-3 text-sm text-ink">Slot #{b.slotId}</td>
                  <td className="px-4 py-3 text-sm text-body">User #{b.customerUserId}</td>
                  <td className="px-4 py-3"><Badge tone={BOOKING_STATUS_TONES[b.status] ?? "neutral"}>{b.status}</Badge></td>
                  <td className="px-4 py-3 text-sm text-muted">{new Date(b.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {b.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => updateBooking.mutate({ id: b.id, status: "confirmed" })}>Confirm</Button>
                      )}
                      {["pending", "confirmed"].includes(b.status) && (
                        <Button size="sm" variant="ghost" onClick={() => updateBooking.mutate({ id: b.id, status: "cancelled" })}>Cancel</Button>
                      )}
                      {b.status === "confirmed" && (
                        <Button size="sm" variant="ghost" onClick={() => updateBooking.mutate({ id: b.id, status: "completed" })}>Complete</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New availability slot" size="md">
        <div className="space-y-4">
          <FieldShell label="Slot type">
            <Select value={form.slotType} onChange={(e) => setForm((f) => ({ ...f, slotType: e.target.value }))}>
              {["consultation", "onboarding", "review", "support", "demo"].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FieldShell>
          <div className="grid grid-cols-2 gap-4">
            <FieldShell label="Starts at"><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} /></FieldShell>
            <FieldShell label="Ends at"><Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} /></FieldShell>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FieldShell label="Duration (minutes)"><Input type="number" min={5} max={480} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: +e.target.value }))} /></FieldShell>
            <FieldShell label="Max bookings"><Input type="number" min={1} max={100} value={form.maxBookings} onChange={(e) => setForm((f) => ({ ...f, maxBookings: +e.target.value }))} /></FieldShell>
          </div>
          <FieldShell label="Notes (optional)"><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></FieldShell>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createSlot.mutate({ ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() })} busy={createSlot.isPending} disabled={!form.startsAt || !form.endsAt}>Create slot</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteSlotId !== null}
        onClose={() => setDeleteSlotId(null)}
        onConfirm={() => { if (deleteSlotId !== null) deleteSlot.mutate({ id: deleteSlotId }); }}
        title="Delete slot"
        message="This will permanently delete this availability slot. Any existing bookings will not be automatically cancelled."
        confirmLabel="Delete"
        variant="danger"
        busy={deleteSlot.isPending}
      />
    </>
  );
}
