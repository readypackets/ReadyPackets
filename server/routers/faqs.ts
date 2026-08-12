import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { publicFaqs } from "../db/schema.js";
import { insertedId } from "../db/result.js";
import { recordActivity } from "../observability/audit.js";
import { adminProcedure, publicProcedure, router } from "../trpc/trpc.js";

const faqInput = z.object({
  id: z.number().int().positive().optional(),
  question: z.string().trim().min(8, "Enter a complete question.").max(500),
  answerMarkdown: z.string().trim().min(8, "Enter a complete answer.").max(100_000),
  category: z.string().trim().max(96).optional(),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
  isPublished: z.boolean().default(false),
});

/**
 * Public FAQs deliberately use a dedicated table rather than the knowledge-base
 * workflow: FAQs are compact, selectively publishable marketing answers, while
 * articles are longer customer-portal documentation with staff review states.
 */
export const faqsRouter = router({
  visible: publicProcedure
    .input(z.object({ category: z.string().trim().max(96).optional() }).optional())
    .query(async ({ input }) => {
      const conditions = [eq(publicFaqs.isPublished, true)];
      if (input?.category) conditions.push(eq(publicFaqs.category, input.category));
      return db
        .select({
          id: publicFaqs.id,
          question: publicFaqs.question,
          answerMarkdown: publicFaqs.answerMarkdown,
          category: publicFaqs.category,
          sortOrder: publicFaqs.sortOrder,
          updatedAt: publicFaqs.updatedAt,
        })
        .from(publicFaqs)
        .where(and(...conditions))
        .orderBy(asc(publicFaqs.sortOrder), asc(publicFaqs.question));
    }),

  list: adminProcedure.query(async () =>
    db.select().from(publicFaqs).orderBy(desc(publicFaqs.isPublished), asc(publicFaqs.sortOrder), asc(publicFaqs.question)),
  ),

  upsert: adminProcedure.input(faqInput).mutation(async ({ ctx, input }) => {
    const now = new Date();
    const values = {
      question: input.question,
      answerMarkdown: input.answerMarkdown,
      category: input.category || null,
      sortOrder: input.sortOrder,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? now : null,
      updatedByUserId: ctx.session.user.id,
    };

    if (input.id) {
      await db.update(publicFaqs).set(values).where(eq(publicFaqs.id, input.id));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "faq.updated",
        entityType: "public_faq",
        entityId: input.id,
        summary: `Updated FAQ: ${input.question}`,
        changes: { isPublished: input.isPublished, category: input.category || null },
        ipAddress: ctx.clientIp,
      });
      return { id: input.id };
    }

    const result = await db.insert(publicFaqs).values({
      ...values,
      createdByUserId: ctx.session.user.id,
      publishedAt: input.isPublished ? now : null,
    });
    const id = insertedId(result);
    void recordActivity({
      actorUserId: ctx.session.user.id,
      actorRole: "admin",
      action: "faq.created",
      entityType: "public_faq",
      entityId: id,
      summary: `Created FAQ: ${input.question}`,
      changes: { isPublished: input.isPublished, category: input.category || null },
      ipAddress: ctx.clientIp,
    });
    return { id };
  }),

  setPublished: adminProcedure
    .input(z.object({ id: z.number().int().positive(), isPublished: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(publicFaqs)
        .set({
          isPublished: input.isPublished,
          publishedAt: input.isPublished ? new Date() : null,
          updatedByUserId: ctx.session.user.id,
        })
        .where(eq(publicFaqs.id, input.id));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: input.isPublished ? "faq.published" : "faq.unpublished",
        entityType: "public_faq",
        entityId: input.id,
        summary: `${input.isPublished ? "Published" : "Unpublished"} FAQ ${input.id}`,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  remove: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await db.delete(publicFaqs).where(eq(publicFaqs.id, input.id));
    void recordActivity({
      actorUserId: ctx.session.user.id,
      actorRole: "admin",
      action: "faq.deleted",
      entityType: "public_faq",
      entityId: input.id,
      severity: "warning",
      summary: `Deleted FAQ ${input.id}`,
      ipAddress: ctx.clientIp,
    });
    return { ok: true as const };
  }),
});
