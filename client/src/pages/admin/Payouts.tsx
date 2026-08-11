/**
 * Payout management — review and process referral/affiliate payouts.
 */
import { useState } from "react";
import { DollarSign } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/Surface";
import { DataTable, StatTile, type Column } from "@/components/ui/DataDisplay";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

interface PayoutRow {
  id: number;
  userId: number;
  userName: string;
  amountCents: number;
  status: string;
  method: string;
  processedAt: string | Date | null;
  createdAt: string | Date;
}

const STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  requested: "warning",
  processing: "neutral",
  paid: "success",
  rejected: "danger",
};

export function AdminPayoutsPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [processId, setProcessId] = useState<number | null>(null);

  const list = trpc.stripe.payouts.useQuery({ page: 1 });
  const processMut = trpc.stripe.processPayout.useMutation({
    async onSuccess() {
      toast.success("Payout processed");
      setProcessId(null);
      await utils.stripe.payouts.invalidate();
    },
    onError(error) {
      toast.error("Could not process payout", errorMessage(error));
    },
  });

  const data = list.data as unknown as { rows: PayoutRow[]; total: number } | undefined;
  const rows = data?.rows ?? [];
  const pending = rows.filter((r) => r.status === "requested");
  const totalPaid = rows
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.amountCents, 0);

  const columns: Column<PayoutRow>[] = [
    {
      key: "user",
      header: "Recipient",
      cell: (row) => (
        <div>
          <p className="font-medium text-ink">{row.userName}</p>
          <p className="mt-0.5 text-xs text-muted">User #{row.userId}</p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      cell: (row) => (
        <span className="font-semibold tabular-nums text-ink">
          {formatMoney(row.amountCents)}
        </span>
      ),
    },
    {
      key: "method",
      header: "Method",
      hideOnMobile: true,
      cell: (row) => <span className="text-sm text-ink capitalize">{row.method}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? "neutral"} className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    {
      key: "date",
      header: "Requested",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (row) =>
        row.status === "requested" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProcessId(row.id)}
          >
            Process
          </Button>
        ) : row.processedAt ? (
          <span className="text-xs text-muted">{formatDate(row.processedAt)}</span>
        ) : null,
    },
  ];

  return (
    <>
      <ConfirmDialog
        open={processId !== null}
        onClose={() => setProcessId(null)}
        onConfirm={() => { if (processId !== null) processMut.mutate({ payoutId: processId, status: "completed" }); }}
        title="Mark payout as paid"
        message="Confirm that you have sent this payment to the recipient outside the platform."
        confirmLabel="Mark as paid"
        busy={processMut.isPending}
      />

      <PageHeader
        title="Payouts"
        description="Referral and affiliate payouts awaiting processing."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile icon={DollarSign} label="Pending payouts" value={String(pending.length)} />
        <StatTile
          icon={DollarSign}
          label="Pending amount"
          value={formatMoney(pending.reduce((s, r) => s + r.amountCents, 0))}
        />
        <StatTile icon={DollarSign} label="Total paid out" value={formatMoney(totalPaid)} />
      </div>

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          caption="Payouts"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={DollarSign}
              title="No payouts"
              description="Payout requests from the referral programme will appear here."
            />
          }
        />
      )}
    </>
  );
}
