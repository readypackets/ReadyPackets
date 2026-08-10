/**
 * Root router. The type exported here is the single source of truth for the
 * client's API surface, which is what removes an entire class of drift bugs
 * between server and browser.
 */
import { router } from "../trpc/trpc.js";
import { accountRouter } from "./account.js";
import { adminRouter } from "./admin.js";
import { adminFilesRouter } from "./adminFiles.js";
import { adminSecurityRouter } from "./adminSecurity.js";
import { authRouter } from "./auth.js";
import { communityRouter } from "./community.js";
import { filesRouter } from "./files.js";
import { intakeRouter } from "./intake.js";
import { ordersRouter } from "./orders.js";
import { publicRouter } from "./public.js";
import { ticketsRouter } from "./tickets.js";

export const appRouter = router({
  auth: authRouter,
  public: publicRouter,
  orders: ordersRouter,
  intake: intakeRouter,
  files: filesRouter,
  tickets: ticketsRouter,
  community: communityRouter,
  account: accountRouter,
  admin: adminRouter,
  adminFiles: adminFilesRouter,
  adminSecurity: adminSecurityRouter,
});

export type AppRouter = typeof appRouter;
