/**
 * Moderation: pending reviews, forum housekeeping, and inbound contact enquiries.
 *
 * Reviews are held until approved rather than published optimistically, which is
 * what allows the public site to describe every visible review as verified.
 */
import { useState } from "react";
import {
  CheckCircle2,
  Flag,
  Mail,
  MessageSquare,
  Star,
  ThumbsDown,
  Trash2,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui/Surface";
import { TabStrip } from "@/components/ui/DataDisplay";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

export function AdminModerationPage() {
  const [tab, setTab] = useState("reviews");

  return (
    <>
      <PageHeader
        title="Moderation"
        description="Reviews awaiting a decision, forum housekeeping, and inbound enquiries."
      />

      <TabStrip
        tabs={[
          { id: "reviews", label: "Reviews" },
          { id: "forum", label: "Forum" },
          { id: "messages", label: "Enquiries" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-6">
        {tab === "reviews" ? <ReviewQueue /> : null}
        {tab === "forum" ? <ForumModeration /> : null}
        {tab === "messages" ? <ContactQueue /> : null}
      </div>
    </>
  );
}

function ReviewQueue() {
  const toast = useToast();
  const pending = trpc.admin.pendingReviews.useQuery();
  const [notes, setNotes] = useState<Record<number, string>>({});

  const moderate = trpc.admin.moderateReview.useMutation({
    async onSuccess() {
      await pending.refetch();
      toast.success("Decision recorded");
    },
    onError(error) {
      toast.error("Could not record the decision", errorMessage(error));
    },
  });

  if (pending.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if ((pending.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing awaiting moderation"
        description="Every submitted review has been decided."
      />
    );
  }

  return (
    <div className="space-y-4">
      {(pending.data ?? []).map((review) => (
        <Card key={review.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      className={
                        index < review.rating ? "size-4 fill-gold text-gold" : "size-4 text-line"
                      }
                      aria-hidden="true"
                    />
                  ))}
                </span>
                {review.status === "flagged" ? <Badge tone="danger">flagged</Badge> : null}
              </div>
              {review.title ? (
                <h3 className="mt-2 font-semibold text-ink">{review.title}</h3>
              ) : null}
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-body">
                {review.body}
              </p>
              <p className="mt-2 text-xs text-muted">
                {review.author}
                {review.displayName ? ` · will appear as “${review.displayName}”` : ""} · order #
                {review.orderId} · submitted {formatRelative(review.createdAt)}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <Input
              label="Moderation note"
              help="Shown to the customer alongside their review."
              value={notes[review.id] ?? ""}
              onChange={(event) =>
                setNotes((current) => ({ ...current, [review.id]: event.target.value }))
              }
              maxLength={500}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                busy={moderate.isPending}
                onClick={() =>
                  moderate.mutate({
                    reviewId: review.id,
                    decision: "approved",
                    note: notes[review.id]?.trim() || undefined,
                  })
                }
                leadingIcon={<CheckCircle2 className="size-4" aria-hidden="true" />}
              >
                Approve and publish
              </Button>
              <Button
                size="sm"
                variant="outline"
                busy={moderate.isPending}
                onClick={() =>
                  moderate.mutate({
                    reviewId: review.id,
                    decision: "rejected",
                    note: notes[review.id]?.trim() || undefined,
                  })
                }
                leadingIcon={<ThumbsDown className="size-4" aria-hidden="true" />}
              >
                Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                busy={moderate.isPending}
                onClick={() =>
                  moderate.mutate({
                    reviewId: review.id,
                    decision: "flagged",
                    note: notes[review.id]?.trim() || undefined,
                  })
                }
                leadingIcon={<Flag className="size-4" aria-hidden="true" />}
              >
                Flag for later
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ForumModeration() {
  const toast = useToast();
  const topics = trpc.community.topics.useQuery({ limit: 50, offset: 0 });

  const moderate = trpc.admin.moderateForumTopic.useMutation({
    async onSuccess() {
      await topics.refetch();
      toast.success("Topic updated");
    },
    onError(error) {
      toast.error("Could not moderate the topic", errorMessage(error));
    },
  });

  if (topics.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if ((topics.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No topics"
        description="The forum has no published topics yet."
      />
    );
  }

  return (
    <Card padded={false}>
      <ul className="divide-y divide-line">
        {(topics.data ?? []).map((topic) => (
          <li key={topic.id} className="px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {topic.pinned ? <Badge tone="gold">pinned</Badge> : null}
                  {topic.locked ? <Badge tone="neutral">locked</Badge> : null}
                </div>
                <p className="mt-1 font-medium text-ink">{topic.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-body">{topic.excerpt}</p>
                <p className="mt-1.5 text-xs text-muted">
                  {topic.author} · {topic.replyCount} replies · {formatRelative(topic.createdAt)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    moderate.mutate({
                      topicId: topic.id,
                      action: topic.pinned ? "unpin" : "pin",
                    })
                  }
                >
                  {topic.pinned ? "Unpin" : "Pin"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    moderate.mutate({
                      topicId: topic.id,
                      action: topic.locked ? "unlock" : "lock",
                    })
                  }
                >
                  {topic.locked ? "Unlock" : "Lock"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => moderate.mutate({ topicId: topic.id, action: "delete" })}
                  leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
                >
                  Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ContactQueue() {
  const toast = useToast();
  const [status, setStatus] = useState("new");
  const messages = trpc.admin.contactMessages.useQuery({
    status: (status || undefined) as never,
    limit: 100,
  });

  const setContactStatus = trpc.admin.setContactStatus.useMutation({
    async onSuccess() {
      await messages.refetch();
    },
    onError(error) {
      toast.error("Could not update the enquiry", errorMessage(error));
    },
  });

  return (
    <>
      <Card className="mb-5">
        <Select
          label="Status"
          className="sm:w-64"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={[
            { value: "", label: "All enquiries" },
            { value: "new", label: "New" },
            { value: "in_progress", label: "In progress" },
            { value: "closed", label: "Closed" },
          ]}
        />
      </Card>

      {messages.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (messages.data ?? []).length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No enquiries"
          description="Nothing is waiting in this queue."
        />
      ) : (
        <div className="space-y-4">
          {(messages.data ?? []).map((message) => (
            <Card key={message.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        message.status === "new"
                          ? "warning"
                          : message.status === "in_progress"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {message.status.replace("_", " ")}
                    </Badge>
                    <Badge tone="neutral">{message.topic}</Badge>
                  </div>
                  <p className="mt-2 font-medium text-ink">{message.name}</p>
                  <p className="text-sm text-muted">
                    <a href={`mailto:${message.email}`}>{message.email}</a>
                    {message.company ? ` · ${message.company}` : ""}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-body">
                    {message.message}
                  </p>
                  <p className="mt-2 text-xs text-muted">{formatDateTime(message.createdAt)}</p>
                </div>

                <div className="flex flex-col gap-2">
                  {message.status !== "in_progress" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setContactStatus.mutate({ messageId: message.id, status: "in_progress" })
                      }
                    >
                      Mark in progress
                    </Button>
                  ) : null}
                  {message.status !== "closed" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setContactStatus.mutate({ messageId: message.id, status: "closed" })
                      }
                    >
                      Close
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Alert tone="info" className="mt-6" title="Reply by email">
        Enquiries are answered from your own mail client so the reply comes from a real mailbox. The
        portal records the enquiry and its handling state for continuity.
      </Alert>
    </>
  );
}
