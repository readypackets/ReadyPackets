/**
 * Admin Backups page — system backup history, manual trigger, and status.
 */
import { useState } from "react";
import { Database, HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/Surface";
import { DataTable } from "@/components/ui/DataDisplay";
import { ConfirmDialog } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success", running: "warning", failed: "danger", deleted: "neutral",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function AdminBackups() {
  const toast = useToast();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const backups = trpc.tier3.systemBackups.list.useQuery({ limit: 100 });
  const utils = trpc.useUtils();

  const markDeleted = trpc.tier3.systemBackups.markDeleted.useMutation({
    onSuccess: () => { utils.tier3.systemBackups.list.invalidate(); setDeleteId(null); toast.success("Backup record removed"); },
    onError: (e) => toast.error("Error", e.message),
  });

  const backupList = backups.data ?? [];

  return (
    <>
      <PageHeader
        title="Backup management"
        description="View backup history and manage backup records. Run backups manually via SSH using deploy/backup.sh."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4 p-4">
          <Database className="size-8 text-teal shrink-0" />
          <div>
            <p className="text-sm text-muted">Total backups</p>
            <p className="text-2xl font-bold text-ink">{backupList.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <HardDrive className="size-8 text-navy shrink-0" />
          <div>
            <p className="text-sm text-muted">Total stored</p>
            <p className="text-2xl font-bold text-ink">{formatBytes(backupList.filter((b) => b.status !== "deleted").reduce((s, b) => s + (b.sizeBytes ?? 0), 0))}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <RefreshCw className="size-8 text-success shrink-0" />
          <div>
            <p className="text-sm text-muted">Last backup</p>
            <p className="text-sm font-semibold text-ink">{backupList[0] ? new Date(backupList[0].createdAt).toLocaleString() : "Never"}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Backup history" description="Nightly backups run automatically via systemd timer. Run deploy/backup.sh manually for on-demand backups." />
        {backupList.length === 0 ? (
          <EmptyState icon={Database} title="No backups recorded" description="Backup records will appear here after the first backup runs." />
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Filename</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Type</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Size</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Triggered by</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Date</th></tr></thead><tbody>
            {backupList.map((b) => (
              <tr key={b.id} className="border-t border-line">
                <td className="px-4 py-3 text-sm font-mono text-ink max-w-xs truncate">{b.filename}</td>
                <td className="px-4 py-3"><Badge>{b.backupType}</Badge></td>
                <td className="px-4 py-3 text-sm text-body">{formatBytes(b.sizeBytes ?? 0)}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONES[b.status] ?? "neutral"}>{b.status}</Badge></td>
                <td className="px-4 py-3 text-sm text-body">{b.triggeredBy}</td>
                <td className="px-4 py-3 text-sm text-muted">{new Date(b.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setDeleteId(b.id)}>Remove</Button>
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Card>

      <div className="mt-6 rounded-lg border border-line bg-surface-raised p-4">
        <h3 className="text-sm font-semibold text-ink mb-2">Manual backup</h3>
        <p className="text-sm text-body mb-3">To run a backup immediately, SSH into the server and run:</p>
        <pre className="rounded bg-ink/5 px-4 py-3 text-xs font-mono text-ink overflow-x-auto">sudo bash /opt/readypackets/deploy/backup.sh</pre>
        <p className="mt-3 text-sm text-muted">The backup will be saved to <code className="text-xs bg-ink/5 px-1 rounded">/var/backups/readypackets/</code> and a record will appear in this list automatically on the next page load.</p>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) markDeleted.mutate({ id: deleteId }); }}
        title="Remove backup record"
        message="This removes the record from the database. It does not delete the actual backup file from disk."
        confirmLabel="Remove record"
        variant="danger"
        busy={markDeleted.isPending}
      />
    </>
  );
}
