/**
 * Order detail.
 *
 * The phase tracker is derived from the order's status rather than a separate
 * progress field, so it can never disagree with the authoritative lifecycle state
 * enforced by the server's state machine.
 */
import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSignature,
  FileText,
  Loader2,
  MessageSquarePlus,
  Package,
  Send,
} from "lucide-react";
import { INTEGRITY_CHOICE_LABELS } from "@shared/domain";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatBytes, formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui/Surface";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/DataDisplay";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";
import {
  PAYMENT_LABELS,
  PAYMENT_TONES,
  PHASE_SEQUENCE,
  STATUS_LABELS,
  STATUS_TONES,
  isTerminated,
  phaseIndexOf,
} from "./orderStatus";

export function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const toast = useToast();

  const detail = trpc.orders.detail.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const questions = trpc.orders.questions.useQuery(
    { orderId },
    { enabled: Number.isFinite(orderId) },
  );
  const mnda = trpc.intake.mndaStatus.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const intake = trpc.intake.get.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const shares = trpc.orders.shares.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });
  const workspaces = trpc.orders.workspaces.useQuery();

  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [downloading, setDownloading] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareScope, setShareScope] = useState("contributor");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceScope, setWorkspaceScope] = useState("contributor");

  const addNote = trpc.orders.addNote.useMutation({
    async onSuccess() {
      setNote("");
      await detail.refetch();
      toast.success("Message sent", "The project team has been notified.");
    },
    onError(error) {
      toast.error("Could not send your message", errorMessage(error));
    },
  });

  const answerQuestion = trpc.orders.answerQuestion.useMutation({
    async onSuccess() {
      await questions.refetch();
      toast.success("Answer saved", "Thank you — this unblocks the work on your packet.");
    },
    onError(error) {
      toast.error("Could not save your answer", errorMessage(error));
    },
  });

  const requestCancellation = trpc.orders.requestCancellation.useMutation({
    async onSuccess() {
      setCancelOpen(false);
      setCancelReason("");
      await detail.refetch();
      toast.info(
        "Cancellation requested",
        "A member of the team will review your request and reply within one business day.",
      );
    },
    onError(error) {
      toast.error("Could not submit your request", errorMessage(error));
    },
  });

  const shareOrder = trpc.orders.share.useMutation({
    async onSuccess() { setShareEmail(""); setShareOpen(false); await shares.refetch(); toast.success("Order shared"); },
    onError(error) { toast.error("Could not share order", errorMessage(error)); },
  });
  const revokeShare = trpc.orders.revokeShare.useMutation({
    async onSuccess() { await shares.refetch(); toast.success("Access removed"); },
    onError(error) { toast.error("Could not remove access", errorMessage(error)); },
  });

  const shareWithWorkspace = trpc.orders.shareOrderWithWorkspace.useMutation({
    async onSuccess(result) { setWorkspaceId(""); await shares.refetch(); toast.success("Packet Collective shared", `${result.memberCount} workspace member(s) can now access this order.`); },
    onError(error) { toast.error("Could not share with Packet Collective", errorMessage(error)); },
  });

  const requestDownload = trpc.files.requestDownload.useMutation({
    onSuccess(result) {
      setDownloading(null);
      // The server issues a short-lived single-use ticket; navigating to it starts
      // the download without exposing a permanent file URL.
      window.location.assign(result.url);
    },
    onError(error) {
      setDownloading(null);
      toast.error("Download failed", errorMessage(error));
    },
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <EmptyState
        icon={Package}
        title="Order not found"
        description="This order does not exist, or it is not associated with your account."
        action={
          <LinkButton href="/portal/orders" variant="outline">
            Back to my orders
          </LinkButton>
        }
      />
    );
  }

  const { order, items, history, deliverables, notes } = detail.data;
  const currentPhase = phaseIndexOf(order.status);
  const terminated = isTerminated(order.status);
  const openQuestions = (questions.data ?? []).filter(
    (question) => question.status !== "answered" && question.status !== "resolved",
  );
  const needsMnda = !mnda.data?.accepted;
  const intakeStatus = intake.data?.status ?? "draft";
  const needsIntake = intakeStatus !== "submitted";
  const canCancel = !terminated && order.status !== "closed" && order.status !== "delivered";

  return (
    <>
      <PageHeader
        title={order.projectName ?? `Order ${order.orderNumber}`}
        description={`Order ${order.orderNumber} · placed ${formatDate(order.createdAt)}`}
        breadcrumb={{ href: "/portal/orders", label: "My orders" }}
        actions={
          <>
            {deliverables.length > 0 ? (
              <LinkButton
                href="/portal/files"
                variant="outline"
                leadingIcon={<Download className="size-4" aria-hidden="true" />}
              >
                My Business Packets
              </LinkButton>
            ) : null}
            {canCancel ? (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                Request cancellation
              </Button>
            ) : null}
          </>
        }
      />

      {shares.data ? <Card className="mb-6"><CardHeader title="Shared access" description="Invite another customer to contribute to this order, or limit them to a specific capability." actions={<Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>Share order</Button>} /><div className="mt-4 space-y-2">{shares.data.filter((share) => !share.revokedAt).length === 0 ? <p className="text-sm text-muted">This order is private to you.</p> : shares.data.filter((share) => !share.revokedAt).map((share) => <div key={share.id} className="flex items-center justify-between gap-3 rounded border border-line p-3"><div><p className="text-sm font-medium text-ink">{share.name}</p><p className="text-xs text-muted">{share.email} · {share.scope.replace(/_/g, " ")}</p></div><Button size="sm" variant="ghost" busy={revokeShare.isPending} onClick={() => revokeShare.mutate({ orderId, shareId: share.id })}>Remove</Button></div>)}</div></Card> : null}

      {shares.data && (workspaces.data ?? []).some((workspace) => workspace.role === "owner") ? <Card className="mb-6"><CardHeader title="Share with a Packet Collective" description="Grant the active members of one of your organization workspaces the same order permission." /><div className="mt-4 grid gap-3 md:grid-cols-3"><Select label="Workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} options={[{ value: "", label: "Select Packet Collective" }, ...(workspaces.data ?? []).filter((workspace) => workspace.role === "owner").map((workspace) => ({ value: String(workspace.id), label: workspace.name }))]} /><Select label="Permission" value={workspaceScope} onChange={(event) => setWorkspaceScope(event.target.value)} options={[{ value: "view", label: "View only" }, { value: "upload_documents", label: "Upload documents" }, { value: "view_deliverables", label: "View final deliverables" }, { value: "record_business_pitch", label: "Record a Business Pitch Idea" }, { value: "contributor", label: "Contributor" }, { value: "manager", label: "Manager" }]} /><div className="flex items-end"><Button fullWidth busy={shareWithWorkspace.isPending} disabled={!workspaceId} onClick={() => shareWithWorkspace.mutate({ orderId, workspaceId: Number(workspaceId), scope: workspaceScope as never })}>Share with workspace</Button></div></div></Card> : null}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[order.status] ?? "neutral"}>
          {STATUS_LABELS[order.status] ?? order.status}
        </Badge>
        <Badge tone={PAYMENT_TONES[order.paymentStatus] ?? "neutral"}>
          {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
        </Badge>
        {order.bundleApplied ? <Badge tone="gold">All-In bundle</Badge> : null}
        {order.dueAt ? (
          <span className="text-xs text-muted">Target delivery {formatDate(order.dueAt)}</span>
        ) : null}
      </div>

      {/* Action required */}
      {needsMnda || needsIntake || openQuestions.length > 0 ? (
        <Card className="mb-6 border-warning/40 bg-warning/5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
            Action required from you
          </h2>
          <ul className="mt-3 space-y-3">
            {needsMnda ? (
              <li className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-body">
                  Sign the mutual NDA before we review your concept.
                </span>
                <LinkButton
                  size="sm"
                  href={`/portal/orders/${order.id}/mnda`}
                  leadingIcon={<FileSignature className="size-4" aria-hidden="true" />}
                >
                  Review and sign
                </LinkButton>
              </li>
            ) : null}
            {!needsMnda && needsIntake ? (
              <li className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-body">
                  {intakeStatus === "draft" && Object.keys(intake.data?.answers ?? {}).length > 0
                    ? "Finish and submit your Phase I intake form."
                    : "Complete your Phase I intake form so we can begin."}
                </span>
                <LinkButton
                  size="sm"
                  href={`/portal/orders/${order.id}/intake`}
                  leadingIcon={<ClipboardList className="size-4" aria-hidden="true" />}
                >
                  {Object.keys(intake.data?.answers ?? {}).length > 0 ? "Continue" : "Start intake"}
                </LinkButton>
              </li>
            ) : null}
            {openQuestions.length > 0 ? (
              <li className="text-sm text-body">
                {openQuestions.length} clarification{" "}
                {openQuestions.length === 1 ? "question" : "questions"} from the project team, below.
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="space-y-6">
          {/* Phase tracker */}
          <Card>
            <CardHeader
              title="Progress"
              description={
                terminated
                  ? "This engagement is closed."
                  : "Where your engagement currently stands."
              }
            />
            {terminated ? (
              <Alert tone="danger" className="mt-4">
                This order is {STATUS_LABELS[order.status]?.toLowerCase() ?? order.status}. Contact
                support if you believe this is incorrect.
              </Alert>
            ) : (
              <>
                <ProgressBar
                  className="mt-4"
                  value={order.completionPercent}
                  label={`${order.completionPercent}% complete`}
                />
                <ol className="mt-6 space-y-4">
                  {PHASE_SEQUENCE.map((phase, index) => {
                    const done = index < currentPhase;
                    const active = index === currentPhase;
                    return (
                      <li key={phase.status} className="flex gap-3.5">
                        <span
                          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            done
                              ? "bg-success text-white"
                              : active
                                ? "bg-teal text-white"
                                : "bg-surface-sunken text-muted"
                          }`}
                          aria-hidden="true"
                        >
                          {done ? <CheckCircle2 className="size-3.5" /> : index + 1}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-semibold ${
                              active ? "text-teal-dark" : done ? "text-ink" : "text-muted"
                            }`}
                          >
                            {phase.short}
                            {active ? (
                              <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-teal">
                                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                                current
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-body">{phase.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </Card>

          {/* Clarification questions */}
          {(questions.data ?? []).length > 0 ? (
            <Card>
              <CardHeader
                title="Clarification questions"
                description="Questions from the project team. Answering promptly keeps your delivery date on track."
              />
              <ul className="mt-5 space-y-5">
                {(questions.data ?? []).map((question) => {
                  const answered = question.answer !== null;
                  const draft = answers[question.id] ?? question.answer?.body ?? "";
                  return (
                    <li key={question.id} className="border-b border-line pb-5 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-ink">{question.question}</p>
                        <Badge tone={answered ? "success" : "warning"} className="shrink-0">
                          {answered ? "Answered" : "Awaiting reply"}
                        </Badge>
                      </div>
                      {answered ? (
                        <p className="mt-2 text-xs text-muted">
                          Version {question.answer?.version} · updated{" "}
                          {formatDateTime(question.answer?.updatedAt ?? null)}
                        </p>
                      ) : null}
                      <Textarea
                        label={answered ? "Update your answer" : "Your answer"}
                        className="mt-3"
                        rows={4}
                        maxLength={10_000}
                        showCount
                        value={draft}
                        onChange={(event) =>
                          setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                        }
                      />
                      <Button
                        size="sm"
                        className="mt-2.5"
                        busy={answerQuestion.isPending}
                        disabled={draft.trim().length === 0}
                        onClick={() =>
                          answerQuestion.mutate({ questionId: question.id, body: draft.trim() })
                        }
                        leadingIcon={<Send className="size-4" aria-hidden="true" />}
                      >
                        {answered ? "Update answer" : "Submit answer"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {/* Deliverables */}
          <Card>
            <CardHeader
              title="My Business Packets"
              description="Files published to this order. Every download is recorded in the audit trail."
            />
            {deliverables.length === 0 ? (
              <p className="mt-4 text-sm text-body">
                Nothing has been published yet. Files will appear here as they are completed.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {deliverables.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <FileText className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{file.originalName}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatBytes(file.sizeBytes)} · v{file.version} ·{" "}
                          {formatDate(file.createdAt)}
                          {file.isPlaceholder ? " · sample" : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      busy={downloading === file.id}
                      onClick={() => {
                        setDownloading(file.id);
                        requestDownload.mutate({ fileId: file.id });
                      }}
                      leadingIcon={<Download className="size-4" aria-hidden="true" />}
                    >
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Messages */}
          <Card>
            <CardHeader
              title="Messages"
              description="Notes exchanged with the project team about this order."
            />
            <div className="mt-4">
              <Textarea
                label="Add a message"
                rows={3}
                maxLength={5000}
                showCount
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Share an update, a constraint, or a question about this engagement."
              />
              <Button
                size="sm"
                className="mt-2.5"
                busy={addNote.isPending}
                disabled={note.trim().length === 0}
                onClick={() => addNote.mutate({ orderId: order.id, body: note.trim() })}
                leadingIcon={<MessageSquarePlus className="size-4" aria-hidden="true" />}
              >
                Send message
              </Button>
            </div>

            {notes.length > 0 ? (
              <ul className="mt-6 space-y-4 border-t border-line pt-5">
                {notes.map((entry) => (
                  <li key={entry.id}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">
                      {entry.body}
                    </p>
                    <p className="mt-1 text-xs text-muted">{formatDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>

        <div className="space-y-5">
          {/* Order summary */}
          <Card>
            <CardHeader title="Order summary" />
            <ul className="mt-4 space-y-3 border-b border-line pb-4">
              {items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-ink">{item.name}</span>
                    <span className="text-xs capitalize text-muted">
                      {item.tier}
                      {item.quantity > 1 ? ` · ×${item.quantity}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {formatMoney(item.lineTotalCents)}
                  </span>
                </li>
              ))}
            </ul>
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
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
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

          {/* Documents */}
          <Card>
            <CardHeader title="Documents" />
            <ul className="mt-4 space-y-2.5 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="text-body">Mutual NDA</span>
                {mnda.data?.accepted ? (
                  <Link href={`/portal/orders/${order.id}/mnda`} className="text-sm font-medium">
                    Signed {formatDate(mnda.data.acceptedAt)}
                  </Link>
                ) : (
                  <Link href={`/portal/orders/${order.id}/mnda`} className="text-sm font-medium">
                    Sign now
                  </Link>
                )}
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-body">Phase I intake</span>
                <Link href={`/portal/orders/${order.id}/intake`} className="text-sm font-medium">
                  {intakeStatus === "submitted" ? "View submission" : "Continue"}
                </Link>
              </li>
            </ul>
          </Card>

          {/* History */}
          <Card>
            <CardHeader title="Status history" />
            {history.length === 0 ? (
              <p className="mt-4 text-sm text-body">No status changes recorded yet.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {history.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <p className="flex flex-wrap items-center gap-1.5 text-ink">
                      <span className="text-muted">
                        {entry.fromStatus ? STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus : "Created"}
                      </span>
                      <ArrowRight className="size-3.5 text-muted" aria-hidden="true" />
                      <span className="font-medium">
                        {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{formatDateTime(entry.createdAt)}</p>
                    {entry.reason ? (
                      <p className="mt-1 text-xs italic text-body">{entry.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

            <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this order"><div className="space-y-4"><p className="text-sm text-body">Choose a customer account and the work they may perform. A contributor can view the order, upload supporting documents, and record a Business Pitch Idea.</p><Input label="Customer email" value={shareEmail} onChange={(event) => setShareEmail(event.target.value)} placeholder="collaborator@example.com" /><Select label="Permission" value={shareScope} onChange={(event) => setShareScope(event.target.value)} options={[{ value: "view", label: "View only" }, { value: "upload_documents", label: "Upload documents" }, { value: "view_deliverables", label: "View final deliverables" }, { value: "record_business_pitch", label: "Record a Business Pitch Idea" }, { value: "contributor", label: "Contributor — all Phase 1 contributions" }, { value: "manager", label: "Manager — full collaboration" }]} /><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button><Button busy={shareOrder.isPending} disabled={!shareEmail.trim()} onClick={() => shareOrder.mutate({ orderId, email: shareEmail, scope: shareScope as never })}>Share order</Button></div></div></Modal>

      <Modal open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Request cancellation"
        description="Cancellation is subject to the refund policy. Tell us why so we can process your request correctly."
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep my order
            </Button>
            <Button
              variant="danger"
              busy={requestCancellation.isPending}
              disabled={cancelReason.trim().length < 10}
              onClick={() =>
                requestCancellation.mutate({ orderId: order.id, reason: cancelReason.trim() })
              }
            >
              Submit request
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason for cancellation"
          rows={4}
          minLength={10}
          maxLength={2000}
          showCount
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          help="At least 10 characters."
        />
        <Alert tone="info" className="mt-4">
          Requesting cancellation does not cancel the order immediately. A member of the team will
          review your request against the refund policy and reply within one business day.
        </Alert>
      </Modal>
    </>
  );
}
