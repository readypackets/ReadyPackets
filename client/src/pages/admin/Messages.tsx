import { useState } from "react";
import { CheckCheck, Inbox, MessageSquare, ExternalLink } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDateTime } from "@/lib/utils";
import { Button, LinkButton } from "@/components/ui/Button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";

export function AdminMessagesPage() {
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const messages = trpc.messages.list.useQuery({ unreadOnly, limit: 150 }, { refetchInterval: 30_000 });
  const utils = trpc.useUtils();
  const markRead = trpc.messages.markRead.useMutation({
    async onSuccess() { await Promise.all([messages.refetch(), utils.messages.unread.invalidate()]); },
    onError(error) { toast.error("Could not update the message", errorMessage(error)); },
  });
  const markAllRead = trpc.messages.markAllRead.useMutation({
    async onSuccess() { await Promise.all([messages.refetch(), utils.messages.unread.invalidate()]); toast.success("Messages marked as read"); },
    onError(error) { toast.error("Could not update the message center", errorMessage(error)); },
  });
  const rows = messages.data?.messages ?? [];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold text-ink">Message center</h1><p className="mt-1 text-sm text-body">Order conversations for customers, collaborators, and the ReadyPackets team.</p></div><div className="flex gap-2"><Button variant={unreadOnly ? "outline" : "ghost"} onClick={() => setUnreadOnly((current) => !current)}>{unreadOnly ? "Show all" : "Unread only"}</Button><Button variant="outline" busy={markAllRead.isPending} disabled={(messages.data?.unreadCount ?? 0) === 0} onClick={() => markAllRead.mutate()} leadingIcon={<CheckCheck className="size-4" aria-hidden="true" />}>Mark all read</Button></div></div>
    <Card>
      <CardHeader title="Order messages" description={`${messages.data?.unreadCount ?? 0} unread message${(messages.data?.unreadCount ?? 0) === 1 ? "" : "s"}. Shared messages are visible to customers; internal notes remain staff-only.`} />
      {messages.isLoading ? <div className="mt-5 space-y-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28 w-full" />)}</div> : rows.length === 0 ? <EmptyState icon={Inbox} title={unreadOnly ? "No unread messages" : "No order messages yet"} description={unreadOnly ? "The team is caught up." : "Order Notes messages will appear here as soon as they are sent."} /> : <ul className="mt-5 space-y-3">{rows.map((message) => <li key={message.id} className={`rounded-lg border p-4 ${message.unread ? "border-teal/35 bg-teal/[0.045]" : "border-line bg-surface-soft"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-muted">{message.orderNumber}</span>{message.unread ? <Badge tone="teal">Unread</Badge> : <Badge tone="neutral">Read</Badge>}<Badge tone={message.visibility === "shared" ? "teal" : "warning"}>{message.visibility === "shared" ? "Shared" : "Internal"}</Badge></div><p className="mt-1 text-sm font-semibold text-ink">{message.projectName}</p></div><p className="text-xs text-muted">{formatDateTime(message.createdAt)}</p></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-body">{message.body}</p><div className="mt-4 flex flex-wrap items-center gap-2"><LinkButton size="sm" variant="outline" href={`/admin/orders/${message.orderId}`} leadingIcon={<ExternalLink className="size-3.5" aria-hidden="true" />}>Open order</LinkButton>{message.unread ? <Button size="sm" variant="ghost" busy={markRead.isPending} onClick={() => markRead.mutate({ noteId: message.id })}>Mark read</Button> : null}<span className="text-xs text-muted">From {message.authorRole === "customer" ? "customer or collaborator" : message.authorRole}</span></div></li>)}</ul>}
    </Card>
    <Card className="border-teal/30 bg-teal/5"><div className="flex items-start gap-3"><MessageSquare className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden="true" /><p className="text-sm text-body">Use an order’s Notes tab to send a shared customer message or save a staff-only internal note. Both are collected here without separating conversation context from the order.</p></div></Card>
  </div>;
}
