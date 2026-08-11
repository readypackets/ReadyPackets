/**
 * Admin Newsletter Management page.
 * Lists subscribers, shows stats, allows export and unsubscribe/delete.
 */
import { useState, useMemo } from "react";
import { Mail, Download, Trash2, UserX, BarChart3 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Badge, EmptyState, Skeleton } from "@/components/ui/Surface";
import { StatTile, TabStrip } from "@/components/ui/DataDisplay";
import { ConfirmDialog } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatRelative } from "@/lib/utils";

export function AdminNewsletter() {
  const toast = useToast();
  const [tab, setTab] = useState("subscribers");
  const [page, setPage] = useState(1);
  const [unsubscribeId, setUnsubscribeId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const stats = trpc.tier4.newsletter.stats.useQuery();
  const subscribers = trpc.tier4.newsletter.list.useQuery({ page });
  const exportQuery = trpc.tier4.newsletter.export.useQuery(
    { confirmedOnly: true },
    { enabled: false },
  );

  const unsubscribeMut = trpc.tier4.newsletter.unsubscribe.useMutation({
    onSuccess: () => {
      utils.tier4.newsletter.list.invalidate();
      utils.tier4.newsletter.stats.invalidate();
      setUnsubscribeId(null);
      toast.success("Unsubscribed", "Subscriber has been unsubscribed.");
    },
    onError: (e) => toast.error("Error", e.message),
  });

  const deleteMut = trpc.tier4.newsletter.delete.useMutation({
    onSuccess: () => {
      utils.tier4.newsletter.list.invalidate();
      utils.tier4.newsletter.stats.invalidate();
      setDeleteId(null);
      toast.success("Deleted", "Subscriber record deleted.");
    },
    onError: (e) => toast.error("Error", e.message),
  });

  const handleExport = async () => {
    const result = await exportQuery.refetch();
    if (!result.data) return;
    const csv = [
      "email,confirmed,subscribed_at",
      ...result.data.map((row) => `${row.email},${row.confirmed},${row.subscribedAt}`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported", `${result.data.length} subscribers exported.`);
  };

  const tabItems = useMemo(() => [
    { id: "subscribers", label: "Subscribers" },
    { id: "stats", label: "Stats" },
  ], []);

  const rows = subscribers.data?.rows ?? [];
  const total = subscribers.data?.total ?? 0;
  const totalPages = Math.ceil(total / 100);

  return (
    <>
      <PageHeader
        title="Newsletter"
        description="Manage newsletter subscribers, view stats, and export lists."
        actions={
          <Button
            onClick={handleExport}
            variant="outline"
            leadingIcon={<Download className="size-4" aria-hidden="true" />}
          >
            Export CSV
          </Button>
        }
      />

      <TabStrip tabs={tabItems} active={tab} onChange={setTab} />

      <div className="mt-6">
        {tab === "subscribers" && (
          <Card padded={false}>
            {subscribers.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No subscribers yet"
                description="Subscribers will appear here when visitors sign up from the homepage."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Email</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Subscribed</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((row) => (
                        <tr key={row.id} className="hover:bg-surface-raised transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-ink">{row.email}</td>
                          <td className="px-4 py-3">
                            {row.unsubscribedAt ? (
                              <Badge tone="neutral">Unsubscribed</Badge>
                            ) : row.confirmed ? (
                              <Badge tone="success">Confirmed</Badge>
                            ) : (
                              <Badge tone="warning">Pending</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted">{formatRelative(row.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {!row.unsubscribedAt && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  leadingIcon={<UserX className="size-3.5" aria-hidden="true" />}
                                  onClick={() => setUnsubscribeId(row.id)}
                                >
                                  Unsub
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="danger"
                                leadingIcon={<Trash2 className="size-3.5" aria-hidden="true" />}
                                onClick={() => setDeleteId(row.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-line px-4 py-3">
                    <p className="text-sm text-muted">
                      Page {page} of {totalPages} ({total} total)
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                      <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {tab === "stats" && (
          <div className="space-y-6">
            {stats.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <StatTile
                  label="Total subscribers"
                  value={stats.data?.total ?? 0}
                  icon={Mail}
                  tone="teal"
                />
                <StatTile
                  label="Confirmed"
                  value={stats.data?.confirmed ?? 0}
                  icon={Mail}
                  tone="success"
                />
                <StatTile
                  label="Unsubscribed"
                  value={stats.data?.unsubscribed ?? 0}
                  icon={UserX}
                  tone="neutral"
                />
              </div>
            )}
            <Card>
              <CardHeader title="About the newsletter" />
              <p className="mt-2 text-sm text-body">
                Subscribers sign up via the homepage footer. A double opt-in confirmation email is
                sent before they are added to the confirmed list. Export the confirmed list to send
                campaigns via your preferred email platform.
              </p>
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={unsubscribeId !== null}
        onClose={() => setUnsubscribeId(null)}
        onConfirm={() => { if (unsubscribeId !== null) unsubscribeMut.mutate({ id: unsubscribeId }); }}
        title="Unsubscribe"
        message="This will mark the subscriber as unsubscribed. They will no longer receive newsletters."
        confirmLabel="Unsubscribe"
        variant="outline"
        busy={unsubscribeMut.isPending}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deleteMut.mutate({ id: deleteId }); }}
        title="Delete subscriber"
        message="This will permanently delete the subscriber record. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        busy={deleteMut.isPending}
      />
    </>
  );
}
