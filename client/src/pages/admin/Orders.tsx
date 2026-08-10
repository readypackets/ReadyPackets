/**
 * Admin order queue and order detail.
 *
 * Status changes are offered only for transitions the server's state machine
 * accepts, so the UI cannot present an action that would be rejected. Internal
 * notes are visually separated from shared notes to make an accidental disclosure
 * to the customer difficult.
 */
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "wouter";
import {
  ArrowRight,
  ClipboardList,
  Download,
  Lock,
  MessageSquarePlus,
  Save,
  Search,
  Send,
  Trash2,
  Unlock,
} from "lucide-react";
import { ORDER_TRANSITIONS, INTEGRITY_CHOICE_LABELS } from "@shared/domain";
import { trpc, errorMessage } from "@/lib/trpc";
import { useSession } from "@/lib/session";
import { formatBytes, formatDate, formatDateTime, formatMoney, humanizeKey } from "@/lib/utils";
import { Button, LinkButton } from "@/components/ui/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui/Surface";
import { DataTable, ProgressBar, TabStrip, type Column } from "@/components/ui/DataDisplay";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";
import {
  PAYMENT_LABELS,
  PAYMENT_TONES,
  STATUS_LABELS,
  STATUS_TONES,
} from "../portal/orderStatus";

interface AdminOrderRow {
  id: number;
  orderNumber: string;
  customer: string;
  userId: number;
  status: string;
  paymentStatus: string;
  totalCents: number;
  bundleApplied: boolean;
  completionPercent: number;
  projectName: string | null;
  createdAt: string | Date;
  dueAt: string | Date | null;
}

export function AdminOrdersPage() {
  const [params] = useSearchParams();
  const statusParam = params.get("status") ?? "";
  const [status, setStatus] = useState(statusParam);
  const [search, setSearch] = useState("");

  const orders = trpc.admin.orders.useQuery({
    status: (status || undefined) as never,
    limit: 200,
    offset: 0,
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = (orders.data ?? []) as unknown as AdminOrderRow[];
    if (!needle) return list;
    return list.filter(
      (order) =>
        order.orderNumber.toLowerCase().includes(needle) ||
        order.customer.toLowerCase().includes(needle) ||
        (order.projectName ?? "").toLowerCase().includes(needle),
    );
  }, [orders.data, search]);

  const exportCsv = trpc.admin.exportOrdersCsv.useMutation({
    onSuccess(result) {
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  const columns: Column<AdminOrderRow>[] = [
    {
      key: "order",
      header: "Order",
      cell: (order) => (
        <div className="min-w-0">
          <span className="font-mono text-xs font-semibold text-muted">{order.orderNumber}</span>
          <p className="mt-0.5 truncate font-medium text-ink">
            {order.projectName ?? "Untitled project"}
          </p>
          <p className="mt-0.5 text-xs text-muted">{order.customer}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      hideOnMobile: true,
      cell: (order) => (
        <div className="space-y-1.5">
          <Badge tone={STATUS_TONES[order.status] ?? "neutral"}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
          <ProgressBar value={order.completionPercent} className="w-24" />
        </div>
      ),
    },
    {
      key: "payment",
      header: "Payment",
      hideOnMobile: true,
      cell: (order) => (
        <Badge tone={PAYMENT_TONES[order.paymentStatus] ?? "neutral"}>
          {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
        </Badge>
      ),
    },
    {
      key: "due",
      header: "Due",
      hideOnMobile: true,
      cell: (order) => (
        <span className="text-xs text-muted">
          {order.dueAt ? formatDate(order.dueAt) : "—"}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (order) => (
        <div className="text-right">
          <p className="font-semibold tabular-nums text-ink">{formatMoney(order.totalCents)}</p>
          {order.bundleApplied ? (
            <Badge tone="gold" className="mt-1">
              Bundle
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "go",
      header: <span className="sr-only">Open</span>,
      align: "right",
      cell: (order) => (
        <Link
          href={`/admin/orders/${order.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-teal-dark no-underline hover:text-teal"
          aria-label={`Open order ${order.orderNumber}`}
        >
          Open
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Order queue"
        description="All orders across the platform, newest first."
        actions={
          <Button
            variant="outline"
            busy={exportCsv.isPending}
            onClick={() => exportCsv.mutate({})}
            leadingIcon={<Download className="size-4" aria-hidden="true" />}
          >
            Export CSV
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Input
            label="Search"
            placeholder="Order number, customer, or project"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leadingIcon={<Search className="size-4" aria-hidden="true" />}
          />
          <Select
            label="Status"
            className="sm:w-60"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: "", label: "All statuses" },
              ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
      </Card>

      {orders.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          caption="Orders"
          columns={columns}
          rows={rows}
          rowKey={(order) => order.id}
          empty={
            <EmptyState
              icon={ClipboardList}
              title="No orders match"
              description="Adjust the status filter or search term."
            />
          }
        />
      )}
    </>
  );
}

export function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const toast = useToast();
  const session = useSession();

  const detail = trpc.admin.orderDetail.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const files = trpc.adminFiles.list.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });

  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"internal" | "shared">("internal");
  const [question, setQuestion] = useState("");
  const [questionRequired, setQuestionRequired] = useState(true);
  const [transitionTo, setTransitionTo] = useState("");
  const [transitionReason, setTransitionReason] = useState("");
  const [completion, setCompletion] = useState<number | null>(null);
  const [dueAt, setDueAt] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [internalNotes, setInternalNotes] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  const refetchAll = async () => {
    await Promise.all([detail.refetch(), files.refetch()]);
  };

  const transition = trpc.admin.transitionOrder.useMutation({
    async onSuccess() {
      setTransitionTo("");
      setTransitionReason("");
      await refetchAll();
      toast.success("Status updated", "The customer has been notified by email.");
    },
    onError(error) {
      toast.error("Transition rejected", errorMessage(error));
    },
  });

  const updateOrder = trpc.admin.updateOrder.useMutation({
    async onSuccess() {
      await refetchAll();
      toast.success("Order updated");
    },
    onError(error) {
      toast.error("Could not update the order", errorMessage(error));
    },
  });

  const addNote = trpc.admin.addOrderNote.useMutation({
    async onSuccess() {
      setNote("");
      await refetchAll();
      toast.success(
        noteVisibility === "shared" ? "Note shared with the customer" : "Internal note saved",
      );
    },
    onError(error) {
      toast.error("Could not save the note", errorMessage(error));
    },
  });

  const addQuestion = trpc.admin.addOrderQuestion.useMutation({
    async onSuccess() {
      setQuestion("");
      await refetchAll();
      toast.success("Clarification question sent");
    },
    onError(error) {
      toast.error("Could not send the question", errorMessage(error));
    },
  });

  const setVisibility = trpc.adminFiles.setVisibility.useMutation({
    async onSuccess() {
      await files.refetch();
    },
    onError(error) {
      toast.error("Could not change visibility", errorMessage(error));
    },
  });

  const softDelete = trpc.admin.softDeleteOrder.useMutation({
    async onSuccess() {
      setDeleteOpen(false);
      toast.info("Order archived", "It can be restored from the database within the retention window.");
    },
    onError(error) {
      toast.error("Could not archive the order", errorMessage(error));
    },
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Order not found"
        description="This order may have been archived."
        action={
          <LinkButton href="/admin/orders" variant="outline">
            Back to the queue
          </LinkButton>
        }
      />
    );
  }

  const { order, customer, notes, questions, attachments, intakeSubmission } = detail.data;
  const allowedNext = ORDER_TRANSITIONS[order.status as keyof typeof ORDER_TRANSITIONS] ?? [];

  return (
    <>
      <PageHeader
        title={order.projectName ?? `Order ${order.orderNumber}`}
        description={`${order.orderNumber} · ${customer?.name ?? "Unknown customer"} · placed ${formatDate(order.createdAt)}`}
        breadcrumb={{ href: "/admin/orders", label: "Order queue" }}
        actions={
          session.isAdmin ? (
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
            >
              Archive
            </Button>
          ) : null
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[order.status] ?? "neutral"}>
          {STATUS_LABELS[order.status] ?? order.status}
        </Badge>
        <Badge tone={PAYMENT_TONES[order.paymentStatus] ?? "neutral"}>
          {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
        </Badge>
        {order.bundleApplied ? <Badge tone="gold">All-In bundle</Badge> : null}
        <span className="text-sm font-semibold tabular-nums text-ink">
          {formatMoney(order.totalCents)}
        </span>
      </div>

      <TabStrip
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "intake", label: "Intake" },
          { id: "notes", label: `Notes (${notes.length})` },
          { id: "questions", label: `Questions (${questions.length})` },
          { id: "files", label: `Files (${attachments.length})` },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-6">
        {tab === "overview" ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Advance the order"
                  description="Only transitions permitted by the lifecycle are offered."
                />
                {allowedNext.length === 0 ? (
                  <Alert tone="info" className="mt-4">
                    This order is in a terminal state; no further transitions are possible.
                  </Alert>
                ) : (
                  <div className="mt-4 space-y-4">
                    <Select
                      label="New status"
                      value={transitionTo}
                      onChange={(event) => setTransitionTo(event.target.value)}
                      options={[
                        { value: "", label: "Choose a status…" },
                        ...allowedNext.map((value) => ({
                          value,
                          label: STATUS_LABELS[value] ?? value,
                        })),
                      ]}
                    />
                    <Input
                      label="Reason"
                      help="Recorded in the order history and the audit log."
                      value={transitionReason}
                      onChange={(event) => setTransitionReason(event.target.value)}
                      maxLength={255}
                    />
                    <Button
                      busy={transition.isPending}
                      disabled={!transitionTo}
                      onClick={() =>
                        transition.mutate({
                          orderId,
                          to: transitionTo as never,
                          reason: transitionReason.trim() || undefined,
                        })
                      }
                    >
                      Apply transition
                    </Button>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader title="Delivery and payment" />
                <div className="mt-4 space-y-4">
                  <div>
                    <label
                      htmlFor="completion-range"
                      className="mb-1.5 block text-sm font-medium text-ink"
                    >
                      Completion: {completion ?? order.completionPercent}%
                    </label>
                    <input
                      id="completion-range"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={completion ?? order.completionPercent}
                      onChange={(event) => setCompletion(Number(event.target.value))}
                      className="w-full accent-teal"
                    />
                  </div>

                  <Input
                    label="Target delivery date"
                    type="date"
                    value={
                      dueAt ||
                      (order.dueAt ? new Date(order.dueAt).toISOString().slice(0, 10) : "")
                    }
                    onChange={(event) => setDueAt(event.target.value)}
                  />

                  <Select
                    label="Payment status"
                    value={paymentStatus || order.paymentStatus}
                    onChange={(event) => setPaymentStatus(event.target.value)}
                    options={Object.entries(PAYMENT_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                  />

                  <Button
                    busy={updateOrder.isPending}
                    onClick={() =>
                      updateOrder.mutate({
                        orderId,
                        completionPercent: completion ?? undefined,
                        dueAt: dueAt ? new Date(`${dueAt}T12:00:00Z`).toISOString() : undefined,
                        paymentStatus: (paymentStatus || undefined) as never,
                      })
                    }
                    leadingIcon={<Save className="size-4" aria-hidden="true" />}
                  >
                    Save changes
                  </Button>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Internal notes"
                  description="Never visible to the customer."
                />
                <Textarea
                  label="Notes"
                  className="mt-4"
                  rows={6}
                  maxLength={20_000}
                  value={internalNotes ?? order.internalNotesText ?? ""}
                  onChange={(event) => setInternalNotes(event.target.value)}
                />
                <Button
                  className="mt-3"
                  variant="outline"
                  busy={updateOrder.isPending}
                  onClick={() =>
                    updateOrder.mutate({ orderId, internalNotes: internalNotes ?? "" })
                  }
                  leadingIcon={<Save className="size-4" aria-hidden="true" />}
                >
                  Save internal notes
                </Button>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader title="Customer" />
                {customer ? (
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted">Name</dt>
                      <dd className="mt-0.5">
                        <Link href={`/admin/customers/${customer.id}`}>{customer.name}</Link>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted">Email</dt>
                      <dd className="mt-0.5 break-all text-ink">{customer.email}</dd>
                    </div>
                    {customer.company ? (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted">Company</dt>
                        <dd className="mt-0.5 text-ink">{customer.company}</dd>
                      </div>
                    ) : null}
                    {customer.phone ? (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted">Phone</dt>
                        <dd className="mt-0.5 text-ink">{customer.phone}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="mt-4 text-sm text-body">The customer record has been deleted.</p>
                )}
              </Card>

              <Card>
                <CardHeader title="Financials" />
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-body">Subtotal</dt>
                    <dd className="tabular-nums text-ink">{formatMoney(order.subtotalCents)}</dd>
                  </div>
                  {order.discountCents > 0 ? (
                    <div className="flex justify-between text-success">
                      <dt>Bundle reduction</dt>
                      <dd className="tabular-nums">−{formatMoney(order.discountCents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-line pt-2 font-semibold">
                    <dt className="text-ink">Total</dt>
                    <dd className="tabular-nums text-ink">{formatMoney(order.totalCents)}</dd>
                  </div>
                </dl>
                {order.integrityChoice ? (
                  <div className="mt-4 rounded-lg border border-gold/30 bg-gold/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">
                      Integrity clause
                    </p>
                    <p className="mt-1 text-sm text-body">
                      {INTEGRITY_CHOICE_LABELS[
                        order.integrityChoice as keyof typeof INTEGRITY_CHOICE_LABELS
                      ] ?? order.integrityChoice}
                    </p>
                  </div>
                ) : null}
              </Card>
            </div>
          </div>
        ) : null}

        {tab === "intake" ? (
          <Card>
            <CardHeader
              title="Phase I intake submission"
              description={
                intakeSubmission
                  ? `${intakeSubmission.status === "submitted" ? "Submitted" : "Draft"}${
                      intakeSubmission.submittedAt
                        ? ` ${formatDateTime(intakeSubmission.submittedAt)}`
                        : ""
                    }`
                  : "The customer has not started the intake form."
              }
            />
            {!intakeSubmission ? (
              <Alert tone="info" className="mt-4">
                Nothing has been submitted yet. The customer must sign the mutual NDA before the
                intake form becomes available.
              </Alert>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {((intakeSubmission.desiredOutcomes as string[] | null) ?? []).map((outcome) => (
                    <Badge key={outcome} tone="teal">
                      {outcome}
                    </Badge>
                  ))}
                  {intakeSubmission.integrityChoice ? (
                    <Badge tone="gold">
                      {INTEGRITY_CHOICE_LABELS[
                        intakeSubmission.integrityChoice as keyof typeof INTEGRITY_CHOICE_LABELS
                      ] ?? intakeSubmission.integrityChoice}
                    </Badge>
                  ) : null}
                </div>

                <dl className="mt-6 space-y-5">
                  {Object.entries(intakeSubmission.answers ?? {}).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-sm font-semibold text-ink">{humanizeKey(key)}</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-body">
                        {value ?? "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Card>
        ) : null}

        {tab === "notes" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
            <Card>
              <CardHeader title="Add a note" />
              <Textarea
                label="Note"
                className="mt-4"
                rows={5}
                maxLength={10_000}
                showCount
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Select
                label="Visibility"
                className="mt-4"
                value={noteVisibility}
                onChange={(event) =>
                  setNoteVisibility(event.target.value as "internal" | "shared")
                }
                options={[
                  { value: "internal", label: "Internal — staff only" },
                  { value: "shared", label: "Shared — visible to the customer" },
                ]}
              />
              {noteVisibility === "shared" ? (
                <Alert tone="warning" className="mt-3">
                  This note will be visible to the customer in their portal.
                </Alert>
              ) : null}
              <Button
                className="mt-4"
                busy={addNote.isPending}
                disabled={note.trim().length === 0}
                onClick={() =>
                  addNote.mutate({ orderId, body: note.trim(), visibility: noteVisibility })
                }
                leadingIcon={<MessageSquarePlus className="size-4" aria-hidden="true" />}
              >
                Save note
              </Button>
            </Card>

            <Card>
              <CardHeader title="Note history" />
              {notes.length === 0 ? (
                <p className="mt-4 text-sm text-body">No notes recorded yet.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {notes.map((entry) => (
                    <li
                      key={entry.id}
                      className={`rounded-lg border p-3.5 ${
                        entry.visibility === "shared"
                          ? "border-teal/30 bg-teal/[0.04]"
                          : "border-line bg-surface-soft"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone={entry.visibility === "shared" ? "teal" : "neutral"}>
                          {entry.visibility === "shared" ? "Shared" : "Internal"}
                        </Badge>
                        <span className="text-xs text-muted">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-body">
                        {entry.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        ) : null}

        {tab === "questions" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
            <Card>
              <CardHeader
                title="Ask a clarification question"
                description="The customer sees this in their portal and is notified by email."
              />
              <Textarea
                label="Question"
                className="mt-4"
                rows={4}
                maxLength={2000}
                showCount
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <Checkbox
                className="mt-3"
                label="An answer is required before delivery"
                checked={questionRequired}
                onChange={(event) => setQuestionRequired(event.target.checked)}
              />
              <Button
                className="mt-4"
                busy={addQuestion.isPending}
                disabled={question.trim().length < 5}
                onClick={() =>
                  addQuestion.mutate({
                    orderId,
                    question: question.trim(),
                    required: questionRequired,
                  })
                }
                leadingIcon={<Send className="size-4" aria-hidden="true" />}
              >
                Send question
              </Button>
            </Card>

            <Card>
              <CardHeader title="Questions asked" />
              {questions.length === 0 ? (
                <p className="mt-4 text-sm text-body">No questions have been raised.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {questions.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-line p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-ink">{entry.question}</p>
                        <Badge
                          tone={entry.status === "answered" ? "success" : "warning"}
                          className="shrink-0"
                        >
                          {entry.status}
                        </Badge>
                      </div>
                      {entry.required ? (
                        <p className="mt-1.5 text-xs text-muted">Required before delivery</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        ) : null}

        {tab === "files" ? (
          <Card>
            <CardHeader
              title="Files on this order"
              description="Toggle visibility to publish a deliverable to the customer."
              actions={
                <LinkButton href="/admin/files" size="sm" variant="outline">
                  File manager
                </LinkButton>
              }
            />
            {(files.data ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-body">No files have been uploaded to this order.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {(files.data ?? []).map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{file.originalName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatBytes(file.sizeBytes)} · v{file.version} ·{" "}
                        {formatDate(file.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={file.visibleToCustomer ? "outline" : "primary"}
                      busy={setVisibility.isPending}
                      onClick={() =>
                        setVisibility.mutate({
                          fileId: file.id,
                          visibleToCustomer: !file.visibleToCustomer,
                        })
                      }
                      leadingIcon={
                        file.visibleToCustomer ? (
                          <Unlock className="size-4" aria-hidden="true" />
                        ) : (
                          <Lock className="size-4" aria-hidden="true" />
                        )
                      }
                    >
                      {file.visibleToCustomer ? "Visible to customer" : "Publish"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          softDelete.mutate({
            orderId,
            reason: deleteReason.trim() || "Archived by an administrator from the order detail view.",
          })
        }
        title="Archive this order?"
        message={
          <>
            <p>
              The order is soft-deleted and hidden from both the customer and the queue. It remains
              recoverable in the database for the retention period before permanent purge.
            </p>
            <Input
              label="Reason"
              className="mt-4"
              help="Recorded in the audit trail."
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              maxLength={255}
            />
          </>
        }
        confirmLabel="Archive order"
        variant="danger"
        busy={softDelete.isPending}
      />
    </>
  );
}
