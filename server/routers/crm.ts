/**
 * CRM router — contacts, notes, and tags.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { crmContacts, crmNotes, crmTags } from "../db/schema.js";
import { encryptField, blindIndex } from "../security/crypto.js";
import { adminProcedure, staffProcedure, router } from "../trpc/trpc.js";
import { recordActivity } from "../observability/audit.js";

const CRM_STATUSES = ["lead", "prospect", "customer", "churned", "blocked"] as const;
const NOTE_TYPES = ["call", "email", "meeting", "note", "task"] as const;

export const crmRouter = router({
  /* ── Contacts ─────────────────────────────────────────────────── */

  listContacts: staffProcedure
    .input(z.object({
      status: z.enum(CRM_STATUSES).optional(),
      search: z.string().trim().max(100).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [isNull(crmContacts.deletedAt)];
      if (input?.status) conditions.push(eq(crmContacts.status, input.status));
      if (input?.search) {
        const q = `%${input.search}%`;
        conditions.push(or(
          like(crmContacts.firstName, q),
          like(crmContacts.lastName, q),
          like(crmContacts.company, q),
        )!);
      }

      const [rows, total] = await Promise.all([
        db.select().from(crmContacts)
          .where(and(...conditions))
          .orderBy(desc(crmContacts.createdAt))
          .limit(input?.limit ?? 50)
          .offset(input?.offset ?? 0),
        db.select({ total: count() }).from(crmContacts).where(and(...conditions)),
      ]);

      return { contacts: rows, total: Number(total[0]?.total ?? 0) };
    }),

  getContact: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [contact] = await db.select().from(crmContacts)
        .where(and(eq(crmContacts.id, input.id), isNull(crmContacts.deletedAt)));
      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });
      const notes = await db.select().from(crmNotes)
        .where(eq(crmNotes.contactId, input.id))
        .orderBy(desc(crmNotes.createdAt));
      return { contact, notes };
    }),

  createContact: staffProcedure
    .input(z.object({
      firstName: z.string().trim().max(100).optional(),
      lastName: z.string().trim().max(100).optional(),
      company: z.string().trim().max(200).optional(),
      email: z.string().email().max(255).optional(),
      source: z.string().trim().max(64).optional(),
      status: z.enum(CRM_STATUSES).default("lead"),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const emailEnc = input.email ? encryptField(input.email, "crm_contacts:email") : null;
      const emailIndex = input.email ? blindIndex(input.email) : null;
      const [result] = await db.insert(crmContacts).values({
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        company: input.company ?? null,
        emailEnc,
        emailIndex,
        source: input.source ?? null,
        status: input.status,
        tags: input.tags ? JSON.stringify(input.tags) : null,
      });
      const id = (result as { insertId: number }).insertId;
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "crm.contact.create",
        entityType: "crm_contact",
        entityId: id,
        summary: `CRM contact created: ${input.firstName ?? ""} ${input.lastName ?? ""}`.trim(),
        ipAddress: ctx.clientIp,
      });
      return { id };
    }),

  updateContact: staffProcedure
    .input(z.object({
      id: z.number().int().positive(),
      firstName: z.string().trim().max(100).optional(),
      lastName: z.string().trim().max(100).optional(),
      company: z.string().trim().max(200).optional(),
      status: z.enum(CRM_STATUSES).optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      if (input.firstName !== undefined) patch.firstName = input.firstName;
      if (input.lastName !== undefined) patch.lastName = input.lastName;
      if (input.company !== undefined) patch.company = input.company;
      if (input.status !== undefined) patch.status = input.status;
      if (input.tags !== undefined) patch.tags = JSON.stringify(input.tags);
      if (Object.keys(patch).length === 0) return { ok: true as const };
      await db.update(crmContacts).set(patch).where(eq(crmContacts.id, input.id));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: ctx.session.user.role,
        action: "crm.contact.update",
        entityType: "crm_contact",
        entityId: input.id,
        summary: `CRM contact updated`,
        changes: patch,
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  deleteContact: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(crmContacts).set({ deletedAt: new Date() }).where(eq(crmContacts.id, input.id));
      void recordActivity({
        actorUserId: ctx.session.user.id,
        actorRole: "admin",
        action: "crm.contact.delete",
        entityType: "crm_contact",
        entityId: input.id,
        summary: "CRM contact deleted",
        ipAddress: ctx.clientIp,
      });
      return { ok: true as const };
    }),

  /* ── Notes ────────────────────────────────────────────────────── */

  addNote: staffProcedure
    .input(z.object({
      contactId: z.number().int().positive(),
      body: z.string().trim().min(1).max(10_000),
      noteType: z.enum(NOTE_TYPES).default("note"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [result] = await db.insert(crmNotes).values({
        contactId: input.contactId,
        authorUserId: ctx.session.user.id,
        body: input.body,
        noteType: input.noteType,
      });
      return { id: (result as { insertId: number }).insertId };
    }),

  deleteNote: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.delete(crmNotes).where(eq(crmNotes.id, input.id));
      return { ok: true as const };
    }),

  /* ── Tags ─────────────────────────────────────────────────────── */

  listTags: staffProcedure.query(async () =>
    db.select().from(crmTags).orderBy(asc(crmTags.name)),
  ),

  createTag: adminProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(64),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6b7280"),
    }))
    .mutation(async ({ input }) => {
      const [result] = await db.insert(crmTags).values({ name: input.name, color: input.color });
      return { id: (result as { insertId: number }).insertId };
    }),

  deleteTag: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.delete(crmTags).where(eq(crmTags.id, input.id));
      return { ok: true as const };
    }),
});
