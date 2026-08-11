/**
 * Customer portal dashboard.
 *
 * Onboarding is surfaced as a short checklist rather than a modal, so a customer
 * who is mid-way through the process can see exactly what is outstanding and act
 * on it directly.
 */
import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  Inbox,
  MailCheck,
  Package,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { useSession } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button, LinkButton } from "@/components/ui/Button";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui/Surface";
import { ProgressBar, StatTile } from "@/components/ui/DataDisplay";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";
import { STATUS_TONES, STATUS_LABELS } from "./orderStatus";

export function PortalDashboard() {
  const session = useSession();
  const toast = useToast();
  const summary = trpc.orders.summary.useQuery(undefined, { refetchOnMount: "always" });
  const orders = trpc.orders.list.useQuery(undefined, { refetchOnMount: "always" });
  const tickets = trpc.tickets.unreadCount.useQuery();
  const mfa = trpc.auth.mfaStatus.useQuery();
  const announcements = trpc.tier3.announcements.visible.useQuery();

  const resend = trpc.auth.resendVerification.useMutation({
    onSuccess() {
      toast.success("Verification email sent", "Check your inbox for the confirmation link.");
    },
    onError(error) {
      toast.error("Could not send the email", errorMessage(error));
    },
  });

  const completeOnboarding = trpc.auth.completeOnboarding.useMutation({
    async onSuccess() {
      await session.refresh();
    },
  });

  const user = session.user;
  const recentOrders = (orders.data ?? []).slice(0, 4);
  const hasOrders = (orders.data ?? []).length > 0;

  const onboardingSteps = [
    {
      key: "verify",
      label: "Confirm your email address",
      done: user?.emailVerified ?? false,
      action: user?.emailVerified ? null : (
        <Button size="sm" variant="outline" busy={resend.isPending} onClick={() => resend.mutate()}>
          Resend link
        </Button>
      ),
    },
    {
      key: "order",
      label: "Choose your packets and place an order",
      done: hasOrders,
      action: hasOrders ? null : (
        <LinkButton size="sm" href="/portal/orders/new">
          Configure an order
        </LinkButton>
      ),
    },
    {
      key: "mfa",
      label: "Enable two-factor authentication",
      done: mfa.data?.enabled ?? false,
      action: mfa.data?.enabled ? null : (
        <LinkButton size="sm" variant="outline" href="/portal/mfa-setup">
          Set up
        </LinkButton>
      ),
    },
  ];

  const remaining = onboardingSteps.filter((step) => !step.done).length;
  const showOnboarding = !user?.onboardingCompleted && remaining > 0;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.preferredName || user?.firstName || "there"}`}
        description="Everything about your engagements in one place: orders, My Business Packets, and support."
        actions={
          <LinkButton
            href="/portal/orders/new"
            leadingIcon={<Package className="size-4" aria-hidden="true" />}
          >
            New order
          </LinkButton>
        }
      />

      {!user?.emailVerified ? (
        <Alert
          tone="warning"
          title="Confirm your email address"
          className="mb-6"
          actions={
            <Button size="sm" busy={resend.isPending} onClick={() => resend.mutate()}>
              Resend confirmation
            </Button>
          }
        >
          Your address has not been confirmed yet. Confirmation is required before an order can
          enter production.
        </Alert>
      ) : null}

      {showOnboarding ? (
        <Card className="mb-6 border-teal/30">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-teal" aria-hidden="true" />
                Getting started
              </span>
            }
            description={`${onboardingSteps.length - remaining} of ${onboardingSteps.length} steps complete.`}
            actions={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => completeOnboarding.mutate()}
                busy={completeOnboarding.isPending}
              >
                Dismiss
              </Button>
            }
          />
          <ProgressBar
            className="mt-4"
            value={onboardingSteps.length - remaining}
            max={onboardingSteps.length}
          />
          <ul className="mt-5 space-y-3">
            {onboardingSteps.map((step) => (
              <li key={step.key} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5 text-sm">
                  {step.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <span
                      className="size-4 shrink-0 rounded-full border-2 border-line"
                      aria-hidden="true"
                    />
                  )}
                  <span className={step.done ? "text-muted line-through" : "text-ink"}>
                    {step.label}
                  </span>
                </span>
                {step.action}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {(announcements.data ?? []).length > 0 ? <Card className="mb-6 border-teal/30"><CardHeader title="Announcements" description="Updates from the ReadyPackets team." /> <div className="mt-4 space-y-3">{(announcements.data ?? []).map((announcement) => <div key={announcement.id} className="rounded-lg border border-line bg-surface-soft p-3"><p className="font-medium text-ink">{announcement.title}</p><p className="mt-1 whitespace-pre-wrap text-sm text-body">{announcement.bodyMarkdown}</p></div>)}</div></Card> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.isLoading ? (
          Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />)
        ) : (
          <>
            <Link href="/portal/orders" className="no-underline"><StatTile label="Active orders" value={summary.data?.active ?? 0} icon={ClipboardList} tone="teal" /></Link>
            <Link href="/portal/files" className="no-underline"><StatTile label="Delivered" value={summary.data?.delivered ?? 0} icon={FileCheck2} tone="success" /></Link>
            <Link href="/portal/orders" className="no-underline"><StatTile label="Awaiting payment" value={summary.data?.awaitingPayment ?? 0} icon={MailCheck} tone="warning" /></Link>
            <Link href="/portal/support" className="no-underline"><StatTile label="Unread replies" value={tickets.data ?? 0} icon={Inbox} tone="navy" /></Link>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <Card>
          <CardHeader
            title="Recent orders"
            description="Your most recent engagements and where each one stands."
            actions={
              hasOrders ? (
                <LinkButton size="sm" variant="outline" href="/portal/orders">
                  View all
                </LinkButton>
              ) : null
            }
          />

          <div className="mt-5">
            {orders.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-20 w-full" />
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No orders yet"
                description="Choose the packet groups and tiers that match where your business is now. You can add more later."
                action={
                  <LinkButton href="/portal/orders/new">Configure your first order</LinkButton>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {recentOrders.map((order) => (
                  <li key={order.id} className="py-4 first:pt-0 last:pb-0">
                    <Link
                      href={`/portal/orders/${order.id}`}
                      className="group flex items-start justify-between gap-4 no-underline"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-muted">
                            {order.orderNumber}
                          </span>
                          <Badge tone={STATUS_TONES[order.status] ?? "neutral"}>
                            {STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                          {order.bundleApplied ? <Badge tone="gold">Bundle</Badge> : null}
                        </div>
                        <p className="mt-1.5 truncate text-sm font-medium text-ink group-hover:text-teal-dark">
                          {order.projectName ?? "Untitled project"}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Placed {formatDate(order.createdAt)}
                          {order.dueAt ? ` · Due ${formatDate(order.dueAt)}` : ""}
                        </p>
                        {order.completionPercent > 0 && order.completionPercent < 100 ? (
                          <ProgressBar
                            className="mt-2.5 max-w-xs"
                            value={order.completionPercent}
                          />
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-ink">
                          {formatMoney(order.totalCents)}
                        </p>
                        <ArrowRight
                          className="mt-2 ml-auto size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-teal"
                          aria-hidden="true"
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Quick actions" />
            <div className="mt-4 flex flex-col gap-2">
              <LinkButton
                href="/portal/orders/new"
                variant="outline"
                fullWidth
                leadingIcon={<Package className="size-4" aria-hidden="true" />}
              >
                Configure a new order
              </LinkButton>
              <LinkButton
                href="/portal/files"
                variant="outline"
                fullWidth
                leadingIcon={<FileText className="size-4" aria-hidden="true" />}
              >
                My Business Packets
              </LinkButton>
              <LinkButton
                href="/portal/tickets"
                variant="outline"
                fullWidth
                leadingIcon={<Inbox className="size-4" aria-hidden="true" />}
              >
                Support
              </LinkButton>
            </div>
          </Card>

          {!mfa.data?.enabled ? (
            <Card className="border-warning/35 bg-warning/5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <ShieldCheck className="size-4 text-warning" aria-hidden="true" />
                Secure your account
              </h2>
              <p className="mt-2 text-sm text-body">
                Two-factor authentication protects your project material even if your password is
                compromised. It takes about a minute to set up.
              </p>
              <LinkButton href="/portal/mfa-setup" fullWidth className="mt-4">
                Enable two-factor
              </LinkButton>
            </Card>
          ) : (
            <Card className="border-success/30 bg-success/5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                Two-factor is active
              </h2>
              <p className="mt-2 text-sm text-body">
                {mfa.data.remainingBackupCodes} unused backup{" "}
                {mfa.data.remainingBackupCodes === 1 ? "code" : "codes"} remaining.
              </p>
              <LinkButton href="/portal/security" variant="outline" fullWidth className="mt-4">
                Security settings
              </LinkButton>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
