import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { knowledgeBaseArticles } from "../db/schema.js";
import { recordActivity } from "../observability/audit.js";
import { insertedId } from "../db/result.js";
import { adminProcedure, protectedProcedure, staffProcedure, router } from "../trpc/trpc.js";

const articleInput = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(3).max(255),
  slug: z.string().trim().min(3).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens."),
  category: z.string().trim().max(96).optional(),
  excerpt: z.string().trim().max(1_000).optional(),
  bodyMarkdown: z.string().trim().min(20).max(100_000),
  submitForApproval: z.boolean().default(false),
});

export const knowledgeBaseRouter = router({
  /** Published help articles available inside the authenticated customer portal. */
  visible: protectedProcedure
    .input(z.object({ query: z.string().trim().max(160).optional(), category: z.string().trim().max(96).optional() }).optional())
    .query(async ({ input }) => {
      const conditions = [eq(knowledgeBaseArticles.status, "published")];
      if (input?.category) conditions.push(eq(knowledgeBaseArticles.category, input.category));
      if (input?.query) {
        const value = `%${input.query}%`;
        conditions.push(or(like(knowledgeBaseArticles.title, value), like(knowledgeBaseArticles.excerpt, value), like(knowledgeBaseArticles.bodyMarkdown, value))!);
      }
      return db.select({
        id: knowledgeBaseArticles.id,
        title: knowledgeBaseArticles.title,
        slug: knowledgeBaseArticles.slug,
        category: knowledgeBaseArticles.category,
        excerpt: knowledgeBaseArticles.excerpt,
        bodyMarkdown: knowledgeBaseArticles.bodyMarkdown,
        publishedAt: knowledgeBaseArticles.publishedAt,
        updatedAt: knowledgeBaseArticles.updatedAt,
      }).from(knowledgeBaseArticles).where(and(...conditions)).orderBy(desc(knowledgeBaseArticles.publishedAt), desc(knowledgeBaseArticles.updatedAt));
    }),

  article: protectedProcedure
    .input(z.object({ slug: z.string().trim().max(160) }))
    .query(async ({ input }) => {
      const [article] = await db.select({
        id: knowledgeBaseArticles.id,
        title: knowledgeBaseArticles.title,
        slug: knowledgeBaseArticles.slug,
        category: knowledgeBaseArticles.category,
        excerpt: knowledgeBaseArticles.excerpt,
        bodyMarkdown: knowledgeBaseArticles.bodyMarkdown,
        publishedAt: knowledgeBaseArticles.publishedAt,
        updatedAt: knowledgeBaseArticles.updatedAt,
      }).from(knowledgeBaseArticles).where(and(eq(knowledgeBaseArticles.slug, input.slug), eq(knowledgeBaseArticles.status, "published"))).limit(1);
      if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge base article not found." });
      return article;
    }),

  list: staffProcedure.query(async () =>
    db.select().from(knowledgeBaseArticles).orderBy(desc(knowledgeBaseArticles.updatedAt)),
  ),

  upsert: staffProcedure.input(articleInput).mutation(async ({ ctx, input }) => {
    const values = {
      title: input.title,
      slug: input.slug,
      category: input.category || null,
      excerpt: input.excerpt || null,
      bodyMarkdown: input.bodyMarkdown,
      ...(input.submitForApproval ? { status: "pending_review", submittedAt: new Date() } : {}),
    };
    if (input.id) {
      const [existing] = await db.select().from(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge base article not found." });
      if (ctx.session.user.role !== "admin" && existing.authorUserId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own knowledge base drafts." });
      await db.update(knowledgeBaseArticles).set(values).where(eq(knowledgeBaseArticles.id, input.id));
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: ctx.session.user.role, action: "knowledge_base.article_updated", entityType: "knowledge_base_article", entityId: input.id, summary: `Updated knowledge base article ${input.title}`, ipAddress: ctx.clientIp });
      return { id: input.id };
    }
    const result = await db.insert(knowledgeBaseArticles).values({ ...values, status: input.submitForApproval ? "pending_review" : "draft", authorUserId: ctx.session.user.id, submittedAt: input.submitForApproval ? new Date() : null });
    const id = insertedId(result);
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: ctx.session.user.role, action: "knowledge_base.article_created", entityType: "knowledge_base_article", entityId: id, summary: `Created knowledge base article ${input.title}`, ipAddress: ctx.clientIp });
    return { id };
  }),

  review: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["draft", "pending_review", "published", "rejected"]) }))
    .mutation(async ({ ctx, input }) => {
      const [article] = await db.select().from(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.id, input.id)).limit(1);
      if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge base article not found." });
      const now = new Date();
      await db.update(knowledgeBaseArticles).set({
        status: input.status,
        reviewedByUserId: ctx.session.user.id,
        reviewedAt: now,
        publishedAt: input.status === "published" ? article.publishedAt ?? now : input.status === "draft" || input.status === "rejected" ? null : article.publishedAt,
      }).where(eq(knowledgeBaseArticles.id, input.id));
      void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "knowledge_base.article_reviewed", entityType: "knowledge_base_article", entityId: input.id, summary: `Set knowledge base article ${input.id} to ${input.status}`, changes: { status: input.status }, ipAddress: ctx.clientIp });
      return { ok: true as const };
    }),

  remove: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await db.delete(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.id, input.id));
    void recordActivity({ actorUserId: ctx.session.user.id, actorRole: "admin", action: "knowledge_base.article_deleted", entityType: "knowledge_base_article", entityId: input.id, severity: "warning", summary: `Deleted knowledge base article ${input.id}`, ipAddress: ctx.clientIp });
    return { ok: true as const };
  }),
});
