/**
 * Application router.
 *
 * Route grouping mirrors the trust boundary: public routes need no session,
 * portal routes require an authenticated customer, and admin routes require a
 * staff or administrator role. The server enforces the same rules on every
 * procedure, so the client-side guards here are a usability measure rather than
 * the security control.
 */
import { useEffect, type ReactNode } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import {
  ClipboardList,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  MessagesSquare,
  ScrollText,
  ShieldCheck,
  Gift,
  UsersRound,
  UserCog,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { trpc } from "@/lib/trpc";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PortalLayout, type NavSection } from "@/components/layout/PortalLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Spinner } from "@/components/ui/Button";

import { HomePage } from "@/pages/public/Home";
import { PacketsPage, PacketDetailPage } from "@/pages/public/Packets";
import {
  AboutPage,
  ChangelogPage,
  CommunityTeaserPage,
  HowItWorksPage,
  MaintenancePage,
  NotFoundPage,
  PolicyPage,
  ReviewsPage,
} from "@/pages/public/Content";
import { ContactPage } from "@/pages/public/Contact";

import { LoginPage } from "@/pages/auth/Login";
import {
  ForgotPasswordPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "@/pages/auth/Register";

import { PortalDashboard } from "@/pages/portal/Dashboard";
import { NewOrderPage, OrdersListPage } from "@/pages/portal/Orders";
import { OrderDetailPage } from "@/pages/portal/OrderDetail";
import { IntakePage, MndaPage } from "@/pages/portal/Intake";
import { FilesPage } from "@/pages/portal/Files";
import { NewTicketPage, TicketDetailPage, TicketsListPage } from "@/pages/portal/Tickets";
import { CommunityPage, NewTopicPage, TopicDetailPage } from "@/pages/portal/Community";
import { ProfilePage } from "@/pages/portal/Profile";
import { MfaSetupPage, SecurityPage } from "@/pages/portal/Security";
import { WorkspacesPage } from "@/pages/portal/Workspaces";
import { ReferralsPage } from "@/pages/portal/Referrals";

import { AdminDashboard } from "@/pages/admin/Dashboard";
import { AdminOrderDetailPage, AdminOrdersPage, AdminOrderTrashPage } from "@/pages/admin/Orders";
import { AdminCustomerDetailPage, AdminCustomersPage, AdminCustomerTrashPage } from "@/pages/admin/Customers";
import { AdminCatalogPage } from "@/pages/admin/Catalog";
import { AdminTicketDetailPage, AdminTicketsPage } from "@/pages/admin/Tickets";
import { AdminModerationPage } from "@/pages/admin/Moderation";
import { AdminContentPage } from "@/pages/admin/Content";
import { AdminSecurityPage } from "@/pages/admin/Security";
import { AdminSystemPage } from "@/pages/admin/System";
import { AdminFilesPage } from "@/pages/admin/Files";
import { AdminFinancePage } from "@/pages/admin/Finance";
import { AdminIntegrationsPage } from "@/pages/admin/Integrations";
import EmailSettings from "@/pages/admin/EmailSettings";
import EmailAutomations from "@/pages/admin/EmailAutomations";
import { EmailCenterPage } from "@/pages/admin/EmailCenter";
import { AdminOrderAutomations } from "@/pages/admin/OrderAutomations";
import { AdminQuestionTemplates } from "@/pages/admin/QuestionTemplates";
import Checkout from "@/pages/portal/Checkout";
import Wizard from "@/pages/portal/Wizard";
import { AdminCRM } from "@/pages/admin/CRM";
import { AdminBackups } from "@/pages/admin/Backups";
import { AdminAIHub } from "@/pages/admin/AIHub";
import { AdminScheduling } from "@/pages/admin/Scheduling";
import { AdminWizardSlides } from "@/pages/admin/WizardSlides";
import { AdminOutboundConnections } from "@/pages/admin/OutboundConnections";
import { AdminInboundWebhooks } from "@/pages/admin/InboundWebhooks";
import { AdminSupportPermissions } from "@/pages/admin/SupportPermissions";
import { AdminABTests } from "@/pages/admin/ABTests";
import { AdminSubscriptions } from "@/pages/admin/Subscriptions";
import { AdminNewsletter } from "@/pages/admin/Newsletter";
import { AdminReferrals } from "@/pages/admin/Referrals";
import { AdminLoginConfig } from "@/pages/admin/LoginConfig";
import { AdminSIEMExport } from "@/pages/admin/SIEMExport";
import { AdminActivityReplay } from "@/pages/admin/ActivityReplay";
import { AdminPreferences } from "@/pages/admin/AdminPreferences";
import { AdminAPIKeysPage } from "@/pages/admin/APIKeys";
import { AdminCouponsPage } from "@/pages/admin/Coupons";
import { AdminPayoutsPage } from "@/pages/admin/Payouts";
import { AdminChangelogPage } from "@/pages/admin/Changelog";
import { PolicyCenterPage } from "@/pages/admin/PolicyCenter";
import { PoliciesPage } from "@/pages/portal/Policies";
import { AdminEntraSetupPage } from "@/pages/admin/EntraSetup";
import { AdminAnnouncementsPage } from "@/pages/admin/Announcements";
import { AdminNavigationPage } from "@/pages/admin/Navigation";

/** Full-page loader shown while the session is being resolved. */
function BootScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-soft">
      <div className="text-center">
        <Spinner className="mx-auto size-8 text-teal" />
        <p className="mt-3 text-sm text-muted">Loading…</p>
      </div>
    </div>
  );
}

/** Wraps public marketing pages, honouring maintenance mode for anonymous users. */
function PublicRoutes() {
  const session = useSession();

  const maintenanceLocked =
    session.maintenance?.enabled === true &&
    session.maintenance.showOnHomepage &&
    !session.isStaff;

  if (maintenanceLocked) {
    return <MaintenancePage />;
  }

  return (
    <PublicLayout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/packets" component={PacketsPage} />
        <Route path="/packets/:slug" component={PacketDetailPage} />
        <Route path="/how-it-works" component={HowItWorksPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/reviews" component={ReviewsPage} />
        <Route path="/community" component={CommunityTeaserPage} />
        <Route path="/changelog" component={ChangelogPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/legal/:slug" component={PolicyPage} />
        <Route path="/privacy" component={PolicyPage} />
        <Route path="/terms" component={PolicyPage} />
        <Route path="/refunds" component={PolicyPage} />
        <Route path="/disclaimer" component={PolicyPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </PublicLayout>
  );
}

/** Requires an authenticated session; redirects to sign-in otherwise. */
function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (session.loading) return;
    if (!session.authenticated) {
      const next = encodeURIComponent(location);
      navigate(`/login?next=${next}`, { replace: true });
    }
  }, [session.loading, session.authenticated, location, navigate]);

  if (session.loading) return <BootScreen />;
  if (!session.authenticated) return null;
  return <>{children}</>;
}

/** Customer portal shell and routes. */
function PortalRoutes() {
  const session = useSession();
  const [location, navigate] = useLocation();
  const pendingPolicies = trpc.account.pendingPolicies.useQuery(undefined, {
    enabled: session.authenticated && !session.restricted,
    refetchOnMount: "always",
  });
  const hasPendingRequiredPolicies = (pendingPolicies.data?.length ?? 0) > 0;
  const unread = trpc.tickets.unreadCount.useQuery(undefined, {
    enabled: session.authenticated && !session.restricted && !hasPendingRequiredPolicies,
    refetchInterval: 120_000,
  });

  // Required policies lock customer portal navigation until accepted. The policy
  // page and security controls remain reachable so the customer can accept or sign out.
  useEffect(() => {
    if (hasPendingRequiredPolicies && !location.startsWith("/portal/policies") && !location.startsWith("/portal/security")) {
      navigate("/portal/policies?required=1", { replace: true });
    }
  }, [hasPendingRequiredPolicies, location, navigate]);

  // Administrators without a second factor are confined to enrolment.
  useEffect(() => {
    if (session.restricted && location !== "/portal/mfa-setup") {
      navigate("/portal/mfa-setup", { replace: true });
    }
  }, [session.restricted, location, navigate]);

  // A forced password change takes precedence over everything else.
  useEffect(() => {
    if (
      session.user?.mustChangePassword &&
      !location.startsWith("/portal/security")
    ) {
      navigate("/portal/security?change=1", { replace: true });
    }
  }, [session.user?.mustChangePassword, location, navigate]);

  const sections: NavSection[] = [
    {
      items: [
        { href: "/portal", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/portal/orders", label: "My orders", icon: ClipboardList },
        { href: "/portal/files", label: "My Business Packets", icon: FileText },
        { href: "/portal/workspaces", label: "Packet Collective", icon: UsersRound },
      ],
    },
    {
      title: "Support",
      items: [
        {
          href: "/portal/tickets",
          label: "Support",
          icon: LifeBuoy,
          badgeCount: unread.data ?? 0,
        },
        { href: "/portal/community", label: "Community", icon: MessagesSquare },
      ],
    },
    {
      title: "Account",
      items: [
        { href: "/portal/profile", label: "Settings", icon: UserCog },
        { href: "/portal/referrals", label: "Referrals", icon: Gift },
        { href: "/portal/security", label: "Security", icon: ShieldCheck },
        { href: "/portal/policies", label: "Policies", icon: ScrollText },
      ],
    },
  ];

  return (
    <PortalLayout sections={sections}>
      <Switch>
        <Route path="/portal" component={PortalDashboard} />
        <Route path="/portal/orders" component={OrdersListPage} />
        <Route path="/portal/orders/new" component={NewOrderPage} />
        <Route path="/portal/orders/:id" component={OrderDetailPage} />
        <Route path="/portal/orders/:id/intake" component={IntakePage} />
        <Route path="/portal/orders/:id/mnda" component={MndaPage} />
        {/* Backward-compatible alias for links issued before the route was renamed. */}
        <Route path="/portal/orders/:id/nda" component={MndaPage} />
        <Route path="/portal/files" component={FilesPage} />
        <Route path="/portal/workspaces" component={WorkspacesPage} />
        {/* Backward-compatible support alias for dashboard links issued before ticket routes were standardized. */}
        <Route path="/portal/support" component={TicketsListPage} />
        <Route path="/portal/tickets" component={TicketsListPage} />
        <Route path="/portal/tickets/new" component={NewTicketPage} />
        <Route path="/portal/tickets/:id" component={TicketDetailPage} />
        <Route path="/portal/community" component={CommunityPage} />
        <Route path="/portal/community/new" component={NewTopicPage} />
        <Route path="/portal/community/:slug" component={TopicDetailPage} />
        <Route path="/portal/profile" component={ProfilePage} />
        <Route path="/portal/referrals" component={ReferralsPage} />
        <Route path="/portal/security" component={SecurityPage} />
        <Route path="/portal/mfa-setup" component={MfaSetupPage} />
        <Route path="/portal/checkout" component={Checkout} />
        <Route path="/portal/wizard" component={Wizard} />
        <Route path="/portal/policies" component={PoliciesPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </PortalLayout>
  );
}

/** Admin shell and routes; staff and administrators only. */
function AdminRoutes() {
  const session = useSession();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (session.loading) return;
    if (!session.isStaff && !session.isAdmin) {
      navigate("/portal", { replace: true });
    }
  }, [session.loading, session.isStaff, session.isAdmin, navigate]);

  if (session.loading) return <BootScreen />;
  if (!session.isStaff && !session.isAdmin) return null;

  // Administrators must complete MFA enrolment before touching the panel.
  if (session.restricted) {
    return <Redirect to="/portal/mfa-setup" replace />;
  }

  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/orders" component={AdminOrdersPage} />
        <Route path="/admin/orders/trash" component={AdminOrderTrashPage} />
        <Route path="/admin/orders/:id" component={AdminOrderDetailPage} />
        <Route path="/admin/customers" component={AdminCustomersPage} />
        <Route path="/admin/customers/trash" component={AdminCustomerTrashPage} />
        <Route path="/admin/customers/:id" component={AdminCustomerDetailPage} />
        <Route path="/admin/tickets" component={AdminTicketsPage} />
        <Route path="/admin/tickets/:id" component={AdminTicketDetailPage} />
        <Route path="/admin/files" component={AdminFilesPage} />
        <Route path="/admin/catalog" component={AdminCatalogPage} />
        <Route path="/admin/moderation" component={AdminModerationPage} />
        <Route path="/admin/content" component={AdminContentPage} />
        <Route path="/admin/security" component={AdminSecurityPage} />
        <Route path="/admin/system" component={AdminSystemPage} />
        <Route path="/admin/finance" component={AdminFinancePage} />
        <Route path="/admin/integrations" component={AdminIntegrationsPage} />
        <Route path="/admin/email-settings" component={EmailSettings} />
        <Route path="/admin/email-center" component={EmailCenterPage} />
        <Route path="/admin/entra-setup" component={AdminEntraSetupPage} />
        <Route path="/admin/announcements" component={AdminAnnouncementsPage} />
        <Route path="/admin/navigation" component={AdminNavigationPage} />
        <Route path="/admin/email-automations" component={EmailAutomations} />
        <Route path="/admin/order-automations" component={AdminOrderAutomations} />
        <Route path="/admin/question-templates" component={AdminQuestionTemplates} />
        <Route path="/admin/crm" component={AdminCRM} />
        <Route path="/admin/backups" component={AdminBackups} />
        <Route path="/admin/ai-hub" component={AdminAIHub} />
        <Route path="/admin/scheduling" component={AdminScheduling} />
        <Route path="/admin/wizard-slides" component={AdminWizardSlides} />
        <Route path="/admin/outbound" component={AdminOutboundConnections} />
        <Route path="/admin/inbound-webhooks" component={AdminInboundWebhooks} />
        <Route path="/admin/support-permissions" component={AdminSupportPermissions} />
        <Route path="/admin/ab-tests" component={AdminABTests} />
        <Route path="/admin/subscriptions" component={AdminSubscriptions} />
        <Route path="/admin/newsletter" component={AdminNewsletter} />
        <Route path="/admin/referrals" component={AdminReferrals} />
        <Route path="/admin/login-config" component={AdminLoginConfig} />
        <Route path="/admin/siem-export" component={AdminSIEMExport} />
        <Route path="/admin/activity-replay" component={AdminActivityReplay} />
        <Route path="/admin/preferences" component={AdminPreferences} />
        <Route path="/admin/api-keys" component={AdminAPIKeysPage} />
        <Route path="/admin/coupons" component={AdminCouponsPage} />
        <Route path="/admin/payouts" component={AdminPayoutsPage} />
        <Route path="/admin/changelog" component={AdminChangelogPage} />
        <Route path="/admin/policy-center" component={PolicyCenterPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </AdminLayout>
  );
}

/** Authentication pages, which redirect away once a session exists. */
function AuthRoutes() {
  const session = useSession();

  if (session.loading) return <BootScreen />;

  // A fully authenticated visitor has no business on the sign-in screen.
  if (session.authenticated && !session.mfaPending) {
    return <Redirect to={session.isStaff || session.isAdmin ? "/admin" : "/portal"} replace />;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}

export function App() {
  return (
    <Switch>
      {/* Authentication */}
      <Route path="/login" component={AuthRoutes} />
      <Route path="/register" component={AuthRoutes} />
      <Route path="/verify-email" component={AuthRoutes} />
      <Route path="/forgot-password" component={AuthRoutes} />
      <Route path="/reset-password" component={AuthRoutes} />

      {/*
        Administration and portal shells.

        These use a regex rather than `/admin/:rest*` because that pattern requires
        a trailing segment and therefore does not match the bare parent path, so
        `/admin` and `/portal` fell through to the public 404. The lookahead
        matches the prefix followed by either the end of the path or a slash, so
        `/admin`, `/admin/`, and `/admin/orders/5` all resolve to the shell while
        `/administration` correctly does not.

        `nest` is deliberately not used: the child routes below are written as
        absolute paths, and nesting would rewrite the location they match against.
      */}
      <Route path={/^\/admin(?=$|\/)/}>
        <RequireAuth>
          <AdminRoutes />
        </RequireAuth>
      </Route>

      <Route path={/^\/portal(?=$|\/)/}>
        <RequireAuth>
          <PortalRoutes />
        </RequireAuth>
      </Route>

      {/* Public website */}
      <Route component={PublicRoutes} />
    </Switch>
  );
}
