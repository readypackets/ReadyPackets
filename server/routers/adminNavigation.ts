import { z } from "zod";
import { router, adminProcedure } from "../trpc/trpc.js";
import { getSettingJson, setSetting } from "../services/settings.js";

const navItemSchema = z.object({
  href: z.string().trim().min(1).max(512).refine((value) => value.startsWith("/admin") || /^https:\/\//i.test(value), "Navigation links must be internal admin paths or HTTPS URLs."),
  label: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(80),
  hidden: z.boolean().default(false),
  order: z.number().int().min(0).max(10_000).default(0),
  custom: z.boolean().default(false),
});

export type AdminNavigationItem = z.infer<typeof navItemSchema>;

export const adminNavigationRouter = router({
  get: adminProcedure.query(async () =>
    getSettingJson<AdminNavigationItem[]>("admin_navigation_config", []),
  ),
  save: adminProcedure.input(z.object({ items: z.array(navItemSchema).max(150) })).mutation(async ({ ctx, input }) => {
    const hrefs = new Set<string>();
    for (const item of input.items) {
      if (hrefs.has(item.href)) throw new Error("Each navigation link can only appear once.");
      hrefs.add(item.href);
    }
    await setSetting("admin_navigation_config", JSON.stringify(input.items), { valueType: "json", category: "admin_navigation", userId: ctx.session.user.id });
    return { ok: true as const };
  }),
});
