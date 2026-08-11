/**
 * Admin Support Permissions page — grant/revoke staff support access.
 */
import { useState } from "react";
import { ShieldCheck, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input } from "@/components/ui/Field";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/Surface";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

type PermRecord = { userId: number; canViewAllTickets: boolean; canCloseTickets: boolean; canAssignTickets: boolean; canViewCustomerPii: boolean; canIssueRefunds: boolean };

const emptyPerm: PermRecord = { userId: 0, canViewAllTickets: false, canCloseTickets: false, canAssignTickets: false, canViewCustomerPii: false, canIssueRefunds: false };

function PermToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-line accent-teal" />
      <span className="text-sm text-body">{label}</span>
    </label>
  );
}

export function AdminSupportPermissions() {
  const toast = useToast();
  const [editPerm, setEditPerm] = useState<PermRecord | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);

  const permissions = trpc.tier3.supportPermissions.list.useQuery();
  const utils = trpc.useUtils();

  const upsert = trpc.tier3.supportPermissions.upsert.useMutation({
    onSuccess: () => { utils.tier3.supportPermissions.list.invalidate(); setEditPerm(null); toast.success("Permissions saved"); },
    onError: (e) => toast.error("Error", e.message),
  });
  const deletePerm = trpc.tier3.supportPermissions.delete.useMutation({
    onSuccess: () => { utils.tier3.supportPermissions.list.invalidate(); setDeleteUserId(null); toast.success("Permissions revoked"); },
  });

  const permList = permissions.data ?? [];

  return (
    <>
      <PageHeader
        title="Support permissions"
        description="Grant staff members specific support access beyond their base role."
        actions={<Button onClick={() => setEditPerm({ ...emptyPerm })} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>Grant permissions</Button>}
      />

      <Card>
        {permList.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No custom permissions" description="Grant support permissions to staff members who need elevated access." />
        ) : (
          <div className="divide-y divide-line">
            {permList.map((p) => (
              <div key={p.userId} className="flex items-center gap-4 px-4 py-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">User #{p.userId}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.canViewAllTickets && <Badge>View all tickets</Badge>}
                    {p.canCloseTickets && <Badge>Close tickets</Badge>}
                    {p.canAssignTickets && <Badge>Assign tickets</Badge>}
                    {p.canViewCustomerPii && <Badge>View customer PII</Badge>}
                    {p.canIssueRefunds && <Badge>Issue refunds</Badge>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setEditPerm({ userId: p.userId, canViewAllTickets: p.canViewAllTickets, canCloseTickets: p.canCloseTickets, canAssignTickets: p.canAssignTickets, canViewCustomerPii: p.canViewCustomerPii, canIssueRefunds: p.canIssueRefunds })}>Edit</Button>
                  <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setDeleteUserId(p.userId)}>Revoke</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editPerm !== null && (
        <Modal open onClose={() => setEditPerm(null)} title={editPerm.userId ? `Edit permissions for User #${editPerm.userId}` : "Grant support permissions"} size="md">
          <div className="space-y-4">
            {!editPerm.userId && (
              <FieldShell label="User ID" required help="Enter the numeric user ID of the staff member">
                <Input type="number" min={1} value={editPerm.userId || ""} onChange={(e) => setEditPerm((p) => p && ({ ...p, userId: +e.target.value }))} />
              </FieldShell>
            )}
            <div className="space-y-3 rounded-lg border border-line p-4">
              <p className="text-sm font-semibold text-ink mb-3">Permissions</p>
              <PermToggle label="View all tickets (not just assigned)" checked={editPerm.canViewAllTickets} onChange={(v) => setEditPerm((p) => p && ({ ...p, canViewAllTickets: v }))} />
              <PermToggle label="Close tickets" checked={editPerm.canCloseTickets} onChange={(v) => setEditPerm((p) => p && ({ ...p, canCloseTickets: v }))} />
              <PermToggle label="Assign tickets to staff" checked={editPerm.canAssignTickets} onChange={(v) => setEditPerm((p) => p && ({ ...p, canAssignTickets: v }))} />
              <PermToggle label="View customer PII (name, email, phone)" checked={editPerm.canViewCustomerPii} onChange={(v) => setEditPerm((p) => p && ({ ...p, canViewCustomerPii: v }))} />
              <PermToggle label="Issue refunds" checked={editPerm.canIssueRefunds} onChange={(v) => setEditPerm((p) => p && ({ ...p, canIssueRefunds: v }))} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditPerm(null)}>Cancel</Button>
              <Button onClick={() => upsert.mutate(editPerm)} busy={upsert.isPending} disabled={!editPerm.userId}>Save permissions</Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={deleteUserId !== null}
        onClose={() => setDeleteUserId(null)}
        onConfirm={() => { if (deleteUserId !== null) deletePerm.mutate({ userId: deleteUserId }); }}
        title="Revoke permissions"
        message={`This will revoke all custom support permissions for User #${deleteUserId}. Their base role permissions will still apply.`}
        confirmLabel="Revoke"
        variant="danger"
        busy={deletePerm.isPending}
      />
    </>
  );
}
