/**
 * Client community: forum categories, topics, threads, and review submission.
 *
 * Post bodies are rendered through the safe markdown renderer, which builds React
 * elements from a restricted grammar. No user-supplied string is ever passed to
 * `dangerouslySetInnerHTML`, which is what makes stored XSS structurally
 * impossible here rather than merely filtered.
 */
import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Lock,
  MessageSquare,
  Pin,
  Plus,
  Send,
  Star,
  ThumbsUp,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
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
import { TabStrip } from "@/components/ui/DataDisplay";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

export function CommunityPage() {
  const [tab, setTab] = useState("forum");

  return (
    <>
      <PageHeader
        title="Community"
        description="Discussion between ReadyPackets clients, and the reviews you have published."
      />

      <TabStrip
        tabs={[
          { id: "forum", label: "Forum" },
          { id: "reviews", label: "My reviews" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-6">{tab === "forum" ? <ForumPanel /> : <ReviewsPanel />}</div>
    </>
  );
}

function ForumPanel() {
  const categories = trpc.community.categories.useQuery();
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const topics = trpc.community.topics.useQuery({ categoryId, limit: 50, offset: 0 });

  return (
    <>
      <Card className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Select
            label="Category"
            className="sm:w-72"
            value={categoryId ? String(categoryId) : ""}
            onChange={(event) =>
              setCategoryId(event.target.value ? Number(event.target.value) : undefined)
            }
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </Select>
          <LinkButton
            href="/portal/community/new"
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            Start a topic
          </LinkButton>
        </div>
      </Card>

      {topics.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : (topics.data ?? []).length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No topics yet"
          description="Be the first to start a discussion. Other founders are working through the same problems."
          action={<LinkButton href="/portal/community/new">Start a topic</LinkButton>}
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {(topics.data ?? []).map((topic) => (
              <li key={topic.id}>
                <Link
                  href={`/portal/community/${topic.slug}`}
                  className="group block px-4 py-4 no-underline hover:bg-surface-soft"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {topic.pinned ? (
                          <Badge tone="gold">
                            <Pin className="mr-1 size-3" aria-hidden="true" />
                            Pinned
                          </Badge>
                        ) : null}
                        {topic.locked ? (
                          <Badge tone="neutral">
                            <Lock className="mr-1 size-3" aria-hidden="true" />
                            Locked
                          </Badge>
                        ) : null}
                        <Badge tone="neutral">
                          {(categories.data ?? []).find(
                            (category) => category.id === topic.categoryId,
                          )?.name ?? "Discussion"}
                        </Badge>
                      </div>
                      <h3 className="mt-1.5 truncate font-medium text-ink group-hover:text-teal-dark">
                        {topic.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-body">{topic.excerpt}</p>
                      <p className="mt-1.5 text-xs text-muted">
                        {topic.author} · {formatRelative(topic.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted">
                      <p className="font-semibold tabular-nums text-ink">{topic.replyCount}</p>
                      <p>{topic.replyCount === 1 ? "reply" : "replies"}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function ReviewsPanel() {
  const toast = useToast();
  const reviewable = trpc.community.reviewableOrders.useQuery();
  const myReviews = trpc.community.myReviews.useQuery();

  const [orderId, setOrderId] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const create = trpc.community.createReview.useMutation({
    async onSuccess() {
      setOrderId("");
      setTitle("");
      setBody("");
      setDisplayName("");
      setRating(5);
      await Promise.all([reviewable.refetch(), myReviews.refetch()]);
      toast.success(
        "Review submitted",
        "Thank you. Reviews are published after a short moderation check.",
      );
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
      <Card>
        <CardHeader
          title="Write a review"
          description="Only delivered orders can be reviewed, which is what makes every published review verifiable."
        />

        {(reviewable.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-body">
            You do not have any delivered orders awaiting a review. Once a packet is delivered you
            will be able to review it here.
          </p>
        ) : (
          <form
            className="mt-5 space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              if (!orderId) {
                setFormError("Choose which order you are reviewing.");
                return;
              }
              if (body.trim().length < 30) {
                setFormError("Please write at least a couple of sentences.");
                return;
              }
              create.mutate({
                orderId: Number(orderId),
                rating,
                title: title.trim() || undefined,
                body: body.trim(),
                displayName: displayName.trim() || undefined,
              });
            }}
          >
            {formError ? <Alert tone="danger">{formError}</Alert> : null}

            <Select
              label="Order"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              required
            >
              <option value="">Choose an order…</option>
              {(reviewable.data ?? []).map((order) => (
                <option key={order.id} value={String(order.id)}>
                  {order.orderNumber}
                  {order.deliveredAt ? ` — delivered ${formatDate(order.deliveredAt)}` : ""}
                </option>
              ))}
            </Select>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink">Rating</legend>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className="rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                    aria-label={`${value} out of 5`}
                    aria-pressed={rating === value}
                  >
                    <Star
                      className={
                        value <= rating ? "size-6 fill-gold text-gold" : "size-6 text-line"
                      }
                      aria-hidden="true"
                    />
                  </button>
                ))}
                <span className="ml-2 text-sm text-body">{rating} of 5</span>
              </div>
            </fieldset>

            <Input
              label="Headline"
              help="Optional"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={190}
            />

            <Textarea
              label="Your review"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              maxLength={5000}
              showCount
              required
              placeholder="What did you commission, and what difference did the packet make?"
            />

            <Input
              label="Display name"
              help="How you would like to be credited publicly. Leave blank to appear as “Verified client”."
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={120}
            />

            <Button
              type="submit"
              busy={create.isPending}
              leadingIcon={<Send className="size-4" aria-hidden="true" />}
            >
              Submit review
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <CardHeader title="Your reviews" />
        {myReviews.isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (myReviews.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-body">You have not written a review yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {(myReviews.data ?? []).map((review) => (
              <li key={review.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Star
                        key={index}
                        className={
                          index < review.rating ? "size-4 fill-gold text-gold" : "size-4 text-line"
                        }
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <Badge
                    tone={
                      review.status === "published"
                        ? "success"
                        : review.status === "rejected"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {review.status}
                  </Badge>
                </div>
                {review.title ? (
                  <h3 className="mt-2 text-sm font-semibold text-ink">{review.title}</h3>
                ) : null}
                <p className="mt-1.5 text-sm leading-relaxed text-body">{review.body}</p>
                <p className="mt-1.5 text-xs text-muted">
                  Submitted {formatDate(review.createdAt)}
                  {review.publishedAt ? ` · published ${formatDate(review.publishedAt)}` : ""}
                </p>
                {review.moderationNote ? (
                  <Alert tone="info" className="mt-2.5">
                    Moderator note: {review.moderationNote}
                  </Alert>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function NewTopicPage() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const categories = trpc.community.categories.useQuery();

  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const create = trpc.community.createTopic.useMutation({
    onSuccess(result) {
      toast.success("Topic posted");
      navigate(`/portal/community/${result.slug}`);
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  return (
    <>
      <PageHeader
        title="Start a topic"
        description="Ask a question or share what you have learned. Markdown formatting is supported."
        breadcrumb={{ href: "/portal/community", label: "Community" }}
      />

      <Card className="max-w-2xl">
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setFormError(null);
            if (!categoryId) {
              setFormError("Choose a category.");
              return;
            }
            if (title.trim().length < 8) {
              setFormError("Give your topic a clearer title — at least 8 characters.");
              return;
            }
            if (body.trim().length < 30) {
              setFormError("Please add a little more detail — at least 30 characters.");
              return;
            }
            create.mutate({
              categoryId: Number(categoryId),
              title: title.trim(),
              body: body.trim(),
            });
          }}
        >
          {formError ? <Alert tone="danger">{formError}</Alert> : null}

          <Select
            label="Category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            required
          >
            <option value="">Choose a category…</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </Select>

          <Input
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={190}
          />

          <Textarea
            label="Your post"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={10}
            maxLength={20_000}
            showCount
            required
            help="Markdown is supported: **bold**, _italic_, lists, links, and code blocks."
          />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={create.isPending}>
              Post topic
            </Button>
            <LinkButton href="/portal/community" variant="outline">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Card>
    </>
  );
}

export function TopicDetailPage() {
  const params = useParams<{ slug: string }>();
  const toast = useToast();
  const detail = trpc.community.topic.useQuery({ slug: params.slug ?? "" }, {
    enabled: Boolean(params.slug),
  });

  const [reply, setReply] = useState("");

  const createPost = trpc.community.createPost.useMutation({
    async onSuccess() {
      setReply("");
      await detail.refetch();
    },
    onError(error) {
      toast.error("Could not post your reply", errorMessage(error));
    },
  });

  const react = trpc.community.react.useMutation({
    async onSuccess() {
      await detail.refetch();
    },
    onError(error) {
      toast.error("Could not record your reaction", errorMessage(error));
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
        icon={MessageSquare}
        title="Topic not found"
        description="This discussion may have been removed by a moderator."
        action={
          <LinkButton href="/portal/community" variant="outline">
            Back to the community
          </LinkButton>
        }
      />
    );
  }

  const { topic, posts } = detail.data;

  return (
    <>
      <Link
        href="/portal/community"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal-dark no-underline hover:text-teal"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Community
      </Link>

      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          {topic.pinned ? <Badge tone="gold">Pinned</Badge> : null}
          {topic.locked ? <Badge tone="neutral">Locked</Badge> : null}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{topic.title}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {topic.author} · {formatDateTime(topic.createdAt)}
        </p>

        <Card className="mt-5">
          <Markdown source={topic.body} className="prose-rp text-sm" />
          <div className="mt-4 border-t border-line pt-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => react.mutate({ topicId: topic.id })}
              leadingIcon={<ThumbsUp className="size-4" aria-hidden="true" />}
            >
              Helpful ({topic.reactions})
            </Button>
          </div>
        </Card>

        {posts.length > 0 ? (
          <ul className="mt-6 space-y-4">
            {posts.map((post) => (
              <li key={post.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{post.author}</p>
                    <span className="text-xs text-muted">{formatDateTime(post.createdAt)}</span>
                  </div>
                  <Markdown source={post.body} className="prose-rp mt-3 text-sm" />
                  <div className="mt-3 border-t border-line pt-2.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => react.mutate({ topicId: topic.id, postId: post.id })}
                      leadingIcon={<ThumbsUp className="size-4" aria-hidden="true" />}
                    >
                      Helpful ({post.reactions})
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : null}

        {topic.locked ? (
          <Alert tone="info" className="mt-6" title="This topic is locked">
            A moderator has closed this discussion to new replies.
          </Alert>
        ) : (
          <Card className="mt-6">
            <CardHeader title="Add a reply" />
            <Textarea
              label="Your reply"
              className="mt-4"
              rows={5}
              maxLength={20_000}
              showCount
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              help="Markdown is supported."
            />
            <Button
              className="mt-3"
              busy={createPost.isPending}
              disabled={reply.trim().length < 2}
              onClick={() => createPost.mutate({ topicId: topic.id, body: reply.trim() })}
              leadingIcon={<Send className="size-4" aria-hidden="true" />}
            >
              Post reply
            </Button>
          </Card>
        )}
      </div>
    </>
  );
}
