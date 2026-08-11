/**
 * Admin Referral Management page.
 * Lists referrals, shows stats, allows status updates.
 */
import { useState, useMemo } from "react";
import { Gift, DollarSign, CheckCircle, Clock, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Badge, EmptyState, Skeleton } from "@/components/ui/Surface";
import { StatTile, TabStrip } from "@/components/ui/DataDisplay";
import { ConfirmDialog } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatMoney } from "@/lib/utils";

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "teal"> = {
  pending: "warning",
  approved: "teal",
  paid: "success",
  rejected: "danger",
};

export function AdminReferrals() {
  const toast = useToast();
  const [tab, setTab] = useState("list");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [updateTarget, setUpdateTarget] = useState<{ id: number; status: string } | null>(null);
  const utils = trpc.useUtils();

  const stats = trpc.tier4.referral.stats.useQuery();
  const list = trpc.tier4.referral.list.useQuery({ page, status: statusFilter });

  const updateStatus = trpc.tier4.referral.updateStatus.useMutation({
    onSuccess: () => {
      utils.tier4.referral.list.invalidate();
      utils.tier4.referral.stats.invalidate();
      setUpdateTarget(null);
      toast.success("Updated", "Referral status updated.");
    },
    onError: (e) => toast.error("Error", e.message),
  });

  const tabItems = useMemo(() => [
    { id: "list", label: "Referrals" },
    { id: "stats", label: "Stats" },
  ], []);

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <>
      <PageHeader
        title="Referral programme"
        description="Track referrals, approve commissions, and manage payouts."
      />

      <TabStrip tabs={tabItems} active={tab} onChange={setTab} />

      <div className="mt-6">
        {tab === "list" && (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {(["all", "pending", "approved", "paid", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s === "all" ? undefined : s); setPage(1); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    (s === "all" && !statusFilter) || statusFilter === s
                      ? "bg-teal text-white"
                      : "bg-surface-sunken text-muted hover:bg-surface-raised"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Card padded={false}>
              {list.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={Gift}
                  title="No referrals found"
                  description="Referrals are created when customers use a referral code at checkout."
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Referrer</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Code</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Order</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Reward</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Date</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {rows.map((row) => (
                          <tr key={row.id} className="hover:bg-surface-raised transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-ink">{row.referrerName}</td>
                            <td className="px-4 py-3 font-mono text-xs text-muted">{row.code}</td>
                            <td className="px-4 py-3 text-sm text-muted">{row.orderId ? `#${row.orderId}` : "—"}</td>
                            <td className="px-4 py-3 text-sm font-medium text-ink">{formatMoney(row.rewardCents)}</td>
                            <td className="px-4 py-3">
                              <Badge tone={STATUS_TONES[row.status] ?? "neutral"}>{row.status}</Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">{formatDateTime(row.createdAt)}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {row.status === "pending" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setUpdateTarget({ id: row.id, status: "approved" })}
                                  >
                                    Approve
                                  </Button>
                                )}
                                {row.status === "approved" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setUpdateTarget({ id: row.id, status: "paid" })}
                                  >
                                    Mark paid
                                  </Button>
                                )}
                                {(row.status === "pending" || row.status === "approved") && (
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => setUpdateTarget({ id: row.id, status: "rejected" })}
                                  >
                                    Reject
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-line px-4 py-3">
                      <p className="text-sm text-muted">Page {page} of {totalPages}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                        <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          </>
        )}

        {tab === "stats" && (
          <div className="space-y-6">
            {stats.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Total referrals" value={stats.data?.total ?? 0} icon={Gift} tone="teal" />
                <StatTile label="Pending" value={stats.data?.pending ?? 0} icon={Clock} tone="warning" />
                <StatTile label="Paid" value={stats.data?.paid ?? 0} icon={CheckCircle} tone="success" />
                <StatTile label="Total rewards" value={formatMoney(stats.data?.totalRewardCents)} icon={DollarSign} tone="gold" />
              </div>
            )}
            <Card>
              <CardHeader title="How referrals work" />
              <p className="mt-2 text-sm text-body">
                Each customer can generate a unique referral code from their portal profile. When
                another customer uses that code at checkout, a 5% commission is automatically
                recorded as a pending referral. Approve and mark as paid once you have processed
                the payout.
              </p>
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={updateTarget !== null}
        onClose={() => setUpdateTarget(null)}
        onConfirm={() => {
          if (updateTarget) {
            updateStatus.mutate({
              id: updateTarget.id,
              status: updateTarget.status as "pending" | "approved" | "paid" | "rejected",
            });
          }
        }}
        title={`${updateTarget?.status === "rejected" ? "Reject" : updateTarget?.status === "paid" ? "Mark as paid" : "Approve"} referral`}
        message={`Are you sure you want to change this referral status to "${updateTarget?.status}"?`}
        confirmLabel="Confirm"
        variant={updateTarget?.status === "rejected" ? "danger" : "primary"}
        busy={updateStatus.isPending}
      />
    </>
  );
}
