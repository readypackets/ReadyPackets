/**
 * Member community: forum topics, replies, reactions, and client reviews.
 *
 * Bodies are stored as plain Markdown text and rendered on the client with a
 * strict sanitiser; no HTML is accepted from users. Reviews require a delivered
 * order, which prevents fabricated testimonials.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  forumCategories,
  forumPosts,
  forumReactions,
  forumTopics,
  orders,
  reviews,
} from "../db/schema.js";
import { displayNameOf, getUserById } from "../db/users.js";
import { recordActivity } from "../observability/audit.js";
import { isFeatureEnabled } from "../services/settings.js";
import { protectedProcedure, router } from "../trpc/trpc.js";
import { insertedId } from "../db/result.js";

/** Slugify a title, appending a short random suffix to guarantee uniqueness. */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  const suffix = Math.floor(Math.random() * 1_679_616)
    .toString(36)
    .padStart(4, "0");
  return `${base || "topic"}-${suffix}`;
}

async function assertForumEnabled(): Promise<void> {
  if (!(await isFeatureEnabled("forum", true))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The community forum is currently unavailable.",
    });
  }
}

async function authorNames(userIds: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(userIds)];
  const map = new Map<number, string>();
  for (const userId of unique) {
    const user = await getUserById(userId);
    map.set(userId, user ? displayNameOf(user) : "Former member");
  }
  return map;
}

export const communityRouter = router({
  categories: protectedProcedure.query(async () => {
    await assertForumEnabled();
    return db
      .select({
        id: forumCategories.id,
        slug: forumCategories.slug,
        name: forumCategories.name,
        description: forumCategories.description,
      })
      .from(forumCategories)
      .orderBy(asc(forumCategories.sortOrder));
  }),

  topics: protectedProcedure
    .input(
      z
        .object({
          categoryId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(50).default(25),
          offset: z.number().int().min(0).max(5_000).default(0),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      await assertForumEnabled();
      const conditions = [eq(forumTopics.status, "published"), isNull(forumTopics.deletedAt)];
      if (input?.categoryId) conditions.push(eq(forumTopics.categoryId, input.categoryId));

      const rows = await db
        .select({
          id: forumTopics.id,
          categoryId: forumTopics.categoryId,
          slug: forumTopics.slug,
          title: forumTopics.title,
          body: forumTopics.body,
          pinned: forumTopics.pinned,
          locked: forumTopics.locked,
          replyCount: forumTopics.replyCount,
          viewCount: forumTopics.viewCount,
          userId: forumTopics.userId,
          lastPostAt: forumTopics.lastPostAt,
          createdAt: forumTopics.createdAt,
        })
        .from(forumTopics)
        .where(and(...conditions))
        .orderBy(desc(forumTopics.pinned), desc(forumTopics.createdAt))
        .limit(input?.limit ?? 25)
        .offset(input?.offset ?? 0);

      const names = await authorNames(rows.map((row) => row.userId));
      return rows.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        slug: row.slug,
        title: row.title,
        excerpt: row.body.length > 220 ? `${row.body.slice(0, 220).trimEnd()}…` : row.body,
        pinned: row.pinned,
        locked: row.locked,
        replyCount: row.replyCount,
        viewCount: row.viewCount,
        author: names.get(row.userId) ?? "Member",
        lastPostAt: row.lastPostAt,
        createdAt: row.createdAt,
      }));
    }),

  topic: protectedProcedure
    .input(z.object({ slug: z.string().trim().min(3).max(190) }))
    .query(async ({ input }) => {
      await assertForumEnabled();
      const rows = await db
        .select()
        .from(forumTopics)
        .where(and(eq(forumTopics.slug, input.slug), isNull(forumTopics.deletedAt)))
        .limit(1);
      const topic = rows[0];
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found." });

      // Fire-and-forget view counter; accuracy here is not worth blocking on.
      void db
        .update(forumTopics)
        .set({ viewCount: sql`${forumTopics.viewCount} + 1` })
        .where(eq(forumTopics.id, topic.id))
        .catch(() => undefined);

      const posts = await db
        .select()
        .from(forumPosts)
        .where(
          and(
            eq(forumPosts.topicId, topic.id),
            eq(forumPosts.status, "published"),
            isNull(forumPosts.deletedAt),
          ),
        )
        .orderBy(asc(forumPosts.createdAt));

      const names = await authorNames([topic.userId, ...posts.map((post) => post.userId)]);

      const reactionRows = await db
        .select({
          postId: forumReactions.postId,
          total: sql<number>`COUNT(*)`,
        })
        .from(forumReactions)
        .where(eq(forumReactions.topicId, topic.id))
        .groupBy(forumReactions.postId);
      const reactionMap = new Map(
        reactionRows.map((row) => [row.postId ?? 0, Number(row.total)]),
      );

      return {
        topic: {
          id: topic.id,
          slug: topic.slug,
          title: topic.title,
          body: topic.body,
          locked: topic.locked,
          pinned: topic.pinned,
          author: names.get(topic.userId) ?? "Member",
          createdAt: topic.createdAt,
          reactions: reactionMap.get(0) ?? 0,
        },
        posts: posts.map((post) => ({
          id: post.id,
          body: post.body,
          author: names.get(post.userId) ?? "Member",
          createdAt: post.createdAt,
          reactions: reactionMap.get(post.id) ?? 0,
        })),
      };
    }),

  createTopic: protectedProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        title: z.string().trim().min(8).max(190),
        body: z.string().trim().min(30, "Please add a little more detail.").max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertForumEnabled();
      const category = await db
        .select({ id: forumCategories.id })
        .from(forumCategories)
        .where(eq(forumCategories.id, input.categoryId))
        .limit(1);
      if (!category[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid category." });
      }

      const slug = slugify(input.title);
      const inserted = await db.insert(forumTopics).values({
        categoryId: input.categoryId,
        userId: ctx.session.user.id,
        slug,
        title: input.title,
        body: input.body,
        lastPostAt: new Date(),
      });
      const topicId = insertedId(inserted);

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "forum.create_topic",
        entityType: "forum_topic",
        entityId: topicId,
        summary: `Member started topic "${input.title}"`,
        ipAddress: ctx.clientIp,
      });

      return { ok: true as const, topicId, slug };
    }),

  createPost: protectedProcedure
    .input(
      z.object({
        topicId: z.number().int().positive(),
        body: z.string().trim().min(2).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertForumEnabled();
      const rows = await db
        .select({ id: forumTopics.id, locked: forumTopics.locked })
        .from(forumTopics)
        .where(and(eq(forumTopics.id, input.topicId), isNull(forumTopics.deletedAt)))
        .limit(1);
      const topic = rows[0];
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found." });
      if (topic.locked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This topic is locked." });
      }

      const inserted = await db.insert(forumPosts).values({
        topicId: input.topicId,
        userId: ctx.session.user.id,
        body: input.body,
      });
      await db
        .update(forumTopics)
        .set({
          replyCount: sql`${forumTopics.replyCount} + 1`,
          lastPostAt: new Date(),
        })
        .where(eq(forumTopics.id, input.topicId));

      return {
        ok: true as const,
        postId: insertedId(inserted),
      };
    }),

  /** Toggle a reaction. A member may react once per post. */
  react: protectedProcedure
    .input(
      z.object({
        topicId: z.number().int().positive(),
        postId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertForumEnabled();
      const conditions = [
        eq(forumReactions.userId, ctx.session.user.id),
        eq(forumReactions.topicId, input.topicId),
      ];
      conditions.push(
        input.postId === undefined
          ? isNull(forumReactions.postId)
          : eq(forumReactions.postId, input.postId),
      );

      const existing = await db
        .select({ id: forumReactions.id })
        .from(forumReactions)
        .where(and(...conditions))
        .limit(1);

      if (existing[0]) {
        await db.delete(forumReactions).where(eq(forumReactions.id, existing[0].id));
        return { ok: true as const, reacted: false };
      }

      await db.insert(forumReactions).values({
        topicId: input.topicId,
        postId: input.postId ?? null,
        userId: ctx.session.user.id,
      });
      return { ok: true as const, reacted: true };
    }),

  /* ---------------------------------------------------------------- */
  /* Reviews                                                           */
  /* ---------------------------------------------------------------- */

  /** Orders that are delivered and not yet reviewed. */
  reviewableOrders: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        deliveredAt: orders.deliveredAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.userId, ctx.session.user.id),
          isNull(orders.deletedAt),
          sql`${orders.status} IN ('delivered','closed')`,
        ),
      );

    if (rows.length === 0) return [];
    const reviewed = await db
      .select({ orderId: reviews.orderId })
      .from(reviews)
      .where(eq(reviews.userId, ctx.session.user.id));
    const reviewedIds = new Set(reviewed.map((row) => row.orderId));
    return rows.filter((row) => !reviewedIds.has(row.id));
  }),

  myReviews: protectedProcedure.query(async ({ ctx }) =>
    db
      .select({
        id: reviews.id,
        orderId: reviews.orderId,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        status: reviews.status,
        moderationNote: reviews.moderationNote,
        createdAt: reviews.createdAt,
        publishedAt: reviews.publishedAt,
      })
      .from(reviews)
      .where(eq(reviews.userId, ctx.session.user.id))
      .orderBy(desc(reviews.createdAt)),
  ),

  createReview: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int().positive(),
        rating: z.number().int().min(1).max(5),
        title: z.string().trim().max(190).optional(),
        body: z.string().trim().min(30, "Please write at least a couple of sentences.").max(5000),
        displayName: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await isFeatureEnabled("reviews", true))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Reviews are currently disabled." });
      }

      // A review requires a delivered order belonging to the caller.
      const rows = await db
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.userId, ctx.session.user.id),
            isNull(orders.deletedAt),
          ),
        )
        .limit(1);
      const order = rows[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      if (order.status !== "delivered" && order.status !== "closed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can review an order once it has been delivered.",
        });
      }

      const existing = await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(eq(reviews.orderId, input.orderId))
        .limit(1);
      if (existing[0]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You have already submitted a review for this order.",
        });
      }

      const inserted = await db.insert(reviews).values({
        userId: ctx.session.user.id,
        orderId: input.orderId,
        rating: input.rating,
        title: input.title ?? null,
        body: input.body,
        displayName: input.displayName ?? null,
        status: "pending",
      });

      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "review.create",
        entityType: "review",
        entityId: insertedId(inserted),
        summary: `Customer submitted a ${input.rating}-star review awaiting moderation`,
        ipAddress: ctx.clientIp,
      });

      return {
        ok: true as const,
        message: "Thank you. Your review will appear once it has been reviewed by our team.",
      };
    }),
});
