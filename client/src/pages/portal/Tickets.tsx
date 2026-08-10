/**
 * Customer support: ticket list, creation, and the conversation thread.
 *
 * Replies marked internal by staff are filtered out on the server, so the client
 * never receives them; there is no "hidden" content in the payload that a curious
 * customer could read from the network tab.
 */
import { useState } from "react";
import { Link, useParams, useLocation, useSearchParams } from "wouter";
import {
  CheckCircle2,
  Inbox,
  LifeBuoy,
  MessageSquare,
  Plus,
  Send,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  type BadgeTone,
} from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

const STATUS_TONES: Record<string, BadgeTone> = {
  open: "info",
  pending: "warning",
  answered: "teal",
  resolved: "success",
  closed: "neutral",
};

const PRIORITY_TONES: Record<string, BadgeTone> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  order: "Order",
  billing: "Billing",
  technical: "Technical",
  deliverable: "Deliverable",
  account: "Account",
};

export function TicketsListPage() {
  const tickets = trpc.tickets.list.useQuery();
  const open = (tickets.data ?? []).filter((ticket) => ticket.status !== "closed");
  const closed = (tickets.data ?? []).filter((ticket) => ticket.status === "closed");

  const renderTicket = (ticket: NonNullable<typeof tickets.data>[number]) => (
    <li key={ticket.id}>
      <Link
        href={`/portal/tickets/${ticket.id}`}
        className="group block px-4 py-4 no-underline hover:bg-surface-soft"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-muted">
                {ticket.ticketNumber}
              </span>
              <Badge tone={STATUS_TONES[ticket.status] ?? "neutral"}>{ticket.status}</Badge>
              {ticket.priority !== "normal" ? (
                <Badge tone={PRIORITY_TONES[ticket.priority] ?? "neutral"}>{ticket.priority}</Badge>
              ) : null}
            </div>
            <p className="mt-1.5 truncate font-medium text-ink group-hover:text-teal-dark">
              {ticket.subject}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {CATEGORY_LABELS[ticket.category] ?? ticket.category} · opened{" "}
              {formatRelative(ticket.createdAt)}
              {ticket.lastReplyAt ? ` · last reply ${formatRelative(ticket.lastReplyAt)}` : ""}
            </p>
          </div>
          {ticket.status === "answered" ? (
            <Badge tone="teal" className="shrink-0">
              New reply
            </Badge>
          ) : null}
        </div>
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Support"
        description="Raise a question about an order, a deliverable, billing, or your account."
        actions={
          <LinkButton
            href="/portal/tickets/new"
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            New ticket
          </LinkButton>
        }
      />

      {tickets.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : (tickets.data ?? []).length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support tickets"
          description="When you raise a question it appears here, along with every reply, so nothing gets lost in email."
          action={<LinkButton href="/portal/tickets/new">Open a ticket</LinkButton>}
        />
      ) : (
        <div className="space-y-6">
          {open.length > 0 ? (
            <Card padded={false}>
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Open tickets ({open.length})</h2>
              </div>
              <ul className="divide-y divide-line">{open.map(renderTicket)}</ul>
            </Card>
          ) : null}

          {closed.length > 0 ? (
            <Card padded={false}>
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Closed tickets ({closed.length})</h2>
              </div>
              <ul className="divide-y divide-line">{closed.map(renderTicket)}</ul>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}

export function NewTicketPage() {
  const [, navigate] = useLocation();
  const [params] = useSearchParams();
  const toast = useToast();
  const meta = trpc.tickets.categories.useQuery();
  const orders = trpc.orders.list.useQuery();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(params.get("category") ?? "general");
  const [priority, setPriority] = useState("normal");
  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = trpc.tickets.create.useMutation({
    onSuccess(result) {
      toast.success(
        `Ticket ${result.ticketNumber} created`,
        "We reply to support tickets within one business day.",
      );
      navigate(`/portal/tickets/${result.ticketId}`);
    },
    onError(error) {
      toast.error("Could not create the ticket", errorMessage(error));
    },
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (subject.trim().length < 5) next.subject = "Give your ticket a short, descriptive subject.";
    if (body.trim().length < 20) next.body = "Please describe the issue in a little more detail.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    create.mutate({
      subject: subject.trim(),
      body: body.trim(),
      category: category as never,
      priority: priority as never,
      orderId: orderId ? Number(orderId) : undefined,
    });
  };

  return (
    <>
      <PageHeader
        title="Open a support ticket"
        description="Tell us what is happening and we will pick it up within one business day."
        breadcrumb={{ href: "/portal/tickets", label: "Support" }}
      />

      <Card className="max-w-2xl">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <Input
            label="Subject"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setErrors((current) => ({ ...current, subject: "" }));
            }}
            error={errors.subject || undefined}
            required
            maxLength={190}
            placeholder="e.g. Question about the Phase II call scheduling"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              options={(meta.data?.categories ?? []).map((value) => ({
                value,
                label: CATEGORY_LABELS[value] ?? value,
              }))}
            />
            <Select
              label="Priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              help="Urgent is for issues that block your engagement entirely."
              options={(meta.data?.priorities ?? []).map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              }))}
            />
          </div>

          <Select
            label="Related order"
            help="Optional, but it helps us find the context immediately."
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
          >
            <option value="">Not related to a specific order</option>
            {(orders.data ?? []).map((order) => (
              <option key={order.id} value={String(order.id)}>
                {order.orderNumber} — {order.projectName ?? "Untitled project"}
              </option>
            ))}
          </Select>

          <Textarea
            label="Description"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setErrors((current) => ({ ...current, body: "" }));
            }}
            error={errors.body || undefined}
            required
            rows={8}
            maxLength={10_000}
            showCount
            placeholder="What did you expect to happen, and what happened instead?"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              busy={create.isPending}
              leadingIcon={<Send className="size-4" aria-hidden="true" />}
            >
              Create ticket
            </Button>
            <LinkButton href="/portal/tickets" variant="outline">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Card>
    </>
  );
}

export function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = Number(params.id);
  const toast = useToast();

  const detail = trpc.tickets.detail.useQuery({ ticketId }, { enabled: Number.isFinite(ticketId) });
  const [reply, setReply] = useState("");

  const sendReply = trpc.tickets.reply.useMutation({
    async onSuccess() {
      setReply("");
      await detail.refetch();
      toast.success("Reply sent");
    },
    onError(error) {
      toast.error("Could not send your reply", errorMessage(error));
    },
  });

  const close = trpc.tickets.close.useMutation({
    async onSuccess() {
      await detail.refetch();
      toast.info("Ticket closed", "Open a new ticket if you need to continue the conversation.");
    },
    onError(error) {
      toast.error("Could not close the ticket", errorMessage(error));
    },
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <EmptyState
        icon={Inbox}
        title="Ticket not found"
        description="This ticket does not exist, or it is not associated with your account."
        action={
          <LinkButton href="/portal/tickets" variant="outline">
            Back to support
          </LinkButton>
        }
      />
    );
  }

  const { ticket, replies } = detail.data;
  const isClosed = ticket.status === "closed";

  return (
    <>
      <PageHeader
        title={ticket.subject}
        description={`Ticket ${ticket.ticketNumber} · opened ${formatDateTime(ticket.createdAt)}`}
        breadcrumb={{ href: "/portal/tickets", label: "Support" }}
        actions={
          !isClosed ? (
            <Button
              variant="outline"
              busy={close.isPending}
              onClick={() => close.mutate({ ticketId })}
              leadingIcon={<CheckCircle2 className="size-4" aria-hidden="true" />}
            >
              Close ticket
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[ticket.status] ?? "neutral"}>{ticket.status}</Badge>
        <Badge tone={PRIORITY_TONES[ticket.priority] ?? "neutral"}>{ticket.priority}</Badge>
        <Badge tone="neutral">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</Badge>
        {ticket.orderId ? (
          <Link href={`/portal/orders/${ticket.orderId}`} className="text-sm font-medium">
            View related order
          </Link>
        ) : null}
      </div>

      <div className="max-w-3xl space-y-4">
        {replies.map((entry) => (
          <Card
            key={entry.id}
            className={entry.isStaffReply ? "border-teal/30 bg-teal/[0.04]" : undefined}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <MessageSquare
                  className={`size-4 ${entry.isStaffReply ? "text-teal" : "text-muted"}`}
                  aria-hidden="true"
                />
                {entry.author}
                {entry.isStaffReply ? <Badge tone="teal">Support</Badge> : null}
              </p>
              <span className="text-xs text-muted">{formatDateTime(entry.createdAt)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-body">
              {entry.body}
            </p>
          </Card>
        ))}

        {isClosed ? (
          <Alert tone="info" title="This ticket is closed">
            {ticket.resolvedAt ? `Closed ${formatDateTime(ticket.resolvedAt)}. ` : ""}
            Open a new ticket if you need further help with this topic.
            <div className="mt-3">
              <LinkButton href="/portal/tickets/new" size="sm" variant="outline">
                Open a new ticket
              </LinkButton>
            </div>
          </Alert>
        ) : (
          <Card>
            <CardHeader title="Add a reply" />
            <Textarea
              label="Your reply"
              className="mt-4"
              rows={5}
              maxLength={10_000}
              showCount
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
            <Button
              className="mt-3"
              busy={sendReply.isPending}
              disabled={reply.trim().length === 0}
              onClick={() => sendReply.mutate({ ticketId, body: reply.trim() })}
              leadingIcon={<Send className="size-4" aria-hidden="true" />}
            >
              Send reply
            </Button>
          </Card>
        )}
      </div>
    </>
  );
}
