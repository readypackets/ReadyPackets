/**
 * Admin support desk: the ticket queue and the staff-side conversation view.
 *
 * Internal notes are added through a separate mutation from customer-visible
 * replies, and are rendered in a visually distinct block, so the two cannot be
 * confused under time pressure.
 */
import { useState } from "react";
import { Link, useParams } from "wouter";
import { EyeOff, Inbox, Lock, MessageSquare, Send, UserCheck } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { Button, LinkButton } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  type BadgeTone,
} from "@/components/ui/Surface";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
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

interface TicketRow {
  id: number;
  ticketNumber: string;
  subject: string;
  customer: string;
  category: string;
  status: string;
  priority: string;
  createdAt: string | Date;
  lastReplyAt: string | Date | null;
}

export function AdminTicketsPage() {
  const [status, setStatus] = useState("");
  const tickets = trpc.admin.tickets.useQuery({ status: status || undefined, limit: 200 });
  const rows = (tickets.data ?? []) as unknown as TicketRow[];

  const columns: Column<TicketRow>[] = [
    {
      key: "ticket",
      header: "Ticket",
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-mono text-xs font-semibold text-muted">{row.ticketNumber}</span>
          <p className="mt-0.5 truncate font-medium text-ink">{row.subject}</p>
          <p className="mt-0.5 text-xs text-muted">
            {row.customer} · {row.category}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      hideOnMobile: true,
      cell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={STATUS_TONES[row.status] ?? "neutral"}>{row.status}</Badge>
          <Badge tone={PRIORITY_TONES[row.priority] ?? "neutral"}>{row.priority}</Badge>
        </div>
      ),
    },
    {
      key: "activity",
      header: "Last activity",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-xs text-muted">
          {formatRelative(row.lastReplyAt ?? row.createdAt)}
        </span>
      ),
    },
    {
      key: "go",
      header: <span className="sr-only">Open</span>,
      align: "right",
      cell: (row) => (
        <Link
          href={`/admin/tickets/${row.id}`}
          className="text-sm font-semibold text-teal-dark no-underline hover:text-teal"
        >
          Open
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Support desk"
        description="Every customer ticket across the platform."
      />

      <Card className="mb-5">
        <Select
          label="Status"
          className="sm:w-64"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={[
            { value: "", label: "All statuses" },
            { value: "open", label: "Open" },
            { value: "pending", label: "Pending" },
            { value: "answered", label: "Answered" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
          ]}
        />
      </Card>

      {tickets.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          caption="Support tickets"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Inbox}
              title="No tickets"
              description="Nothing is waiting in this queue."
            />
          }
        />
      )}
    </>
  );
}

export function AdminTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = Number(params.id);
  const toast = useToast();

  const detail = trpc.tickets.detail.useQuery({ ticketId }, { enabled: Number.isFinite(ticketId) });
  const staff = trpc.admin.staffDirectory.useQuery();

  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const refetch = async () => {
    await detail.refetch();
  };

  const sendReply = trpc.tickets.reply.useMutation({
    async onSuccess() {
      setReply("");
      await refetch();
      toast.success("Reply sent", "The customer has been notified by email.");
    },
    onError(error) {
      toast.error("Could not send the reply", errorMessage(error));
    },
  });

  const addNote = trpc.admin.addInternalTicketNote.useMutation({
    async onSuccess() {
      setInternalNote("");
      await refetch();
      toast.success("Internal note saved");
    },
    onError(error) {
      toast.error("Could not save the note", errorMessage(error));
    },
  });

  const updateTicket = trpc.admin.updateTicket.useMutation({
    async onSuccess() {
      await refetch();
      toast.success("Ticket updated");
    },
    onError(error) {
      toast.error("Could not update the ticket", errorMessage(error));
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
        description="This ticket may have been removed."
        action={
          <LinkButton href="/admin/tickets" variant="outline">
            Back to the desk
          </LinkButton>
        }
      />
    );
  }

  const { ticket, replies } = detail.data;

  return (
    <>
      <PageHeader
        title={ticket.subject}
        description={`${ticket.ticketNumber} · opened ${formatDateTime(ticket.createdAt)}`}
        breadcrumb={{ href: "/admin/tickets", label: "Support desk" }}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr] lg:items-start">
        <div className="space-y-4">
          {replies.map((entry) => (
            <Card
              key={entry.id}
              className={
                entry.internalOnly
                  ? "border-gold/40 bg-gold/[0.05]"
                  : entry.isStaffReply
                    ? "border-teal/30 bg-teal/[0.04]"
                    : undefined
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <MessageSquare
                    className={`size-4 ${entry.internalOnly ? "text-gold-dark" : entry.isStaffReply ? "text-teal" : "text-muted"}`}
                    aria-hidden="true"
                  />
                  {entry.author}
                  {entry.internalOnly ? (
                    <Badge tone="gold">
                      <EyeOff className="mr-1 size-3" aria-hidden="true" />
                      Internal
                    </Badge>
                  ) : entry.isStaffReply ? (
                    <Badge tone="teal">Support</Badge>
                  ) : null}
                </p>
                <span className="text-xs text-muted">{formatDateTime(entry.createdAt)}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-body">
                {entry.body}
              </p>
            </Card>
          ))}

          <Card>
            <CardHeader
              title="Reply to the customer"
              description="Sent by email and shown in their portal."
            />
            <Textarea
              label="Reply"
              className="mt-4"
              rows={6}
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

          <Card className="border-gold/40">
            <CardHeader
              title="Internal note"
              description="Never sent to the customer and never returned to their client."
            />
            <Textarea
              label="Note"
              className="mt-4"
              rows={4}
              maxLength={10_000}
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
            />
            <Button
              className="mt-3"
              variant="outline"
              busy={addNote.isPending}
              disabled={internalNote.trim().length === 0}
              onClick={() => addNote.mutate({ ticketId, body: internalNote.trim() })}
              leadingIcon={<Lock className="size-4" aria-hidden="true" />}
            >
              Save internal note
            </Button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Triage" />
            <div className="mt-4 space-y-4">
              <Select
                label="Status"
                value={ticket.status}
                onChange={(event) =>
                  updateTicket.mutate({ ticketId, status: event.target.value as never })
                }
                options={[
                  { value: "open", label: "Open" },
                  { value: "pending", label: "Pending customer" },
                  { value: "answered", label: "Answered" },
                  { value: "resolved", label: "Resolved" },
                  { value: "closed", label: "Closed" },
                ]}
              />
              <Select
                label="Priority"
                value={ticket.priority}
                onChange={(event) =>
                  updateTicket.mutate({ ticketId, priority: event.target.value as never })
                }
                options={[
                  { value: "low", label: "Low" },
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                ]}
              />
              <Select
                label="Assigned to"
                value=""
                onChange={(event) =>
                  updateTicket.mutate({
                    ticketId,
                    assignedToUserId: event.target.value ? Number(event.target.value) : null,
                  })
                }
              >
                <option value="">Unassigned</option>
                {(staff.data ?? []).map((member) => (
                  <option key={member.id} value={String(member.id)}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Category</dt>
                <dd className="text-ink">{ticket.category}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Status</dt>
                <dd>
                  <Badge tone={STATUS_TONES[ticket.status] ?? "neutral"}>{ticket.status}</Badge>
                </dd>
              </div>
              {ticket.orderId ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Related order</dt>
                  <dd>
                    <Link href={`/admin/orders/${ticket.orderId}`}>Open order</Link>
                  </dd>
                </div>
              ) : null}
              {ticket.resolvedAt ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Resolved</dt>
                  <dd className="text-ink">{formatDateTime(ticket.resolvedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Alert tone="info" title="Assignment">
            <span className="flex items-start gap-2">
              <UserCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Assigning a ticket does not restrict who may reply; it records ownership so nothing is
              left unattended.
            </span>
          </Alert>
        </div>
      </div>
    </>
  );
}
