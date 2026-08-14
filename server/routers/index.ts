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
import { adminNavigationRouter } from "./adminNavigation.js";
import { authRouter } from "./auth.js";
import { communityRouter } from "./community.js";
import { filesRouter } from "./files.js";
import { intakeRouter } from "./intake.js";
import { ordersRouter } from "./orders.js";
import { publicRouter } from "./public.js";
import { ticketsRouter } from "./tickets.js";
import { stripeRouter } from "./stripe.js";
import { integrationsRouter } from "./integrations.js";
import { emailAutomationsRouter } from "./emailAutomations.js";
import { siemExportRouter } from "./siemExport.js";
import { crmRouter } from "./crm.js";
import { tier3Router } from "./tier3.js";
import { tier4Router } from "./tier4.js";
import { knowledgeBaseRouter } from "./knowledgeBase.js";
import { platformUpdatesRouter } from "./platformUpdates.js";
import { faqsRouter } from "./faqs.js";
import { marketingRouter } from "./marketing.js";
import { invoicesRouter } from "./invoices.js";
import { platformSetupRouter } from "./platformSetup.js";
import { messagesRouter } from "./messages.js";

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
  adminNavigation: adminNavigationRouter,
  stripe: stripeRouter,
  integrations: integrationsRouter,
  emailAutomations: emailAutomationsRouter,
  siemExport: siemExportRouter,
  crm: crmRouter,
  tier3: tier3Router,
  tier4: tier4Router,
  knowledgeBase: knowledgeBaseRouter,
  platformUpdates: platformUpdatesRouter,
  faqs: faqsRouter,
  marketing: marketingRouter,
  invoices: invoicesRouter,
  platformSetup: platformSetupRouter,
  messages: messagesRouter,
});

export type AppRouter = typeof appRouter;
