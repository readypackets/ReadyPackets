/**
 * Admin dashboard.
 *
 * Deliberately operational rather than decorative: the counters that matter are
 * the ones representing work waiting on the business, and each is a link straight
 * to the queue that clears it.
 */
import { Link } from "wouter";
import {
  Activity,
  ClipboardList,
  DollarSign,
  Inbox,
  Mail,
  ShieldAlert,
  Star,
  Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/utils";
import { LinkButton } from "@/components/ui/Button";
import { Alert, Badge, Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { StatTile } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { STATUS_LABELS, STATUS_TONES } from "../portal/orderStatus";

/** Minimal inline bar chart; avoids pulling a charting library into the bundle. */
function TrendBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((point) => point.value), 1);
  return (
    <div className="mt-5">
      <div className="flex h-24 items-end gap-1" role="img" aria-label="Daily registrations">
        {data.map((point) => (
          <div
            key={point.label}
            className="group relative flex-1 rounded-t bg-teal/25 transition-colors hover:bg-teal/50"
            style={{ height: `${Math.max((point.value / max) * 100, 3)}%` }}
            title={`${point.label}: ${point.value}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{data[0]?.label ?? ""}</span>
        <span>{data[data.length - 1]?.label ?? ""}</span>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const dashboard = trpc.admin.dashboard.useQuery();
  const health = trpc.adminSecurity.health.useQuery();
  const alerts = trpc.adminSecurity.alerts.useQuery();
  const pressure = trpc.adminSecurity.loginPressure.useQuery();

  const stats = dashboard.data;
  const orderStats = stats?.orders;
  const totalFailures = (pressure.data ?? []).reduce((sum, row) => sum + row.failures, 0);

  const workQueue = [
    {
      label: "Open tickets",
      value: stats?.openTickets ?? 0,
      href: "/admin/tickets",
      icon: Inbox,
    },
    {
      label: "Reviews to moderate",
      value: stats?.pendingReviews ?? 0,
      href: "/admin/moderation",
      icon: Star,
    },
    {
      label: "New enquiries",
      value: stats?.newMessages ?? 0,
      href: "/admin/messages",
      icon: Mail,
    },
  ];

  const uptimeHours = Math.floor((health.data?.uptimeSeconds ?? 0) / 3600);
  const uptimeMinutes = Math.floor(((health.data?.uptimeSeconds ?? 0) % 3600) / 60);

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description="Everything requiring attention across orders, customers, and the platform itself."
        actions={
          <LinkButton href="/admin/orders" variant="outline">
            Order queue
          </LinkButton>
        }
      />

      {(alerts.data ?? []).length > 0 ? (
        <Alert
          tone="danger"
          className="mb-6"
          title={`${alerts.data?.length} open system alert${(alerts.data?.length ?? 0) === 1 ? "" : "s"}`}
          actions={
            <LinkButton href="/admin/security" size="sm">
              Review alerts
            </LinkButton>
          }
        >
          <ul className="space-y-1">
            {(alerts.data ?? []).slice(0, 3).map((alert) => (
              <li key={alert.id} className="text-sm">
                {alert.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboard.isLoading ? (
          Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />)
        ) : (
          <>
            <StatTile
              label="Orders (all time)"
              value={orderStats?.total ?? 0}
              icon={ClipboardList}
              tone="teal"
              hint={`${orderStats?.last30DaysCount ?? 0} in the last 30 days`}
            />
            <StatTile
              label="Collected revenue"
              value={formatMoney(orderStats?.revenueCents ?? 0)}
              icon={DollarSign}
              tone="success"
              hint="Paid and partially refunded orders"
            />
            <StatTile label="Customers" value={stats?.customers ?? 0} icon={Users} tone="navy" />
            <StatTile
              label="Failed logins (24h)"
              value={totalFailures}
              icon={ShieldAlert}
              tone={totalFailures > 50 ? "danger" : totalFailures > 10 ? "warning" : "neutral"}
              hint={`${(pressure.data ?? []).length} distinct source addresses`}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Order pipeline"
              description="Live count of orders in each phase of the lifecycle."
              actions={
                <LinkButton href="/admin/orders" size="sm" variant="outline">
                  Open queue
                </LinkButton>
              }
            />
            {dashboard.isLoading ? (
              <Skeleton className="mt-5 h-32 w-full" />
            ) : (
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {Object.entries(STATUS_LABELS).map(([status, label]) => {
                  const value = orderStats?.byStatus?.[status] ?? 0;
                  return (
                    <li key={status}>
                      <Link
                        href={`/admin/orders?status=${status}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3 no-underline transition-colors hover:border-teal/40 hover:bg-teal/[0.03]"
                      >
                        <Badge tone={STATUS_TONES[status] ?? "neutral"}>{label}</Badge>
                        <span className="shrink-0 text-lg font-semibold tabular-nums text-ink">
                          {value}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="New registrations"
              description="Daily customer registrations over the last 30 days."
            />
            {dashboard.isLoading ? (
              <Skeleton className="mt-5 h-28 w-full" />
            ) : (stats?.signupTrend ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-body">No registrations in the last 30 days.</p>
            ) : (
              <TrendBars
                data={(stats?.signupTrend ?? []).map((point) => ({
                  label: point.day,
                  value: point.total,
                }))}
              />
            )}
          </Card>

          {(pressure.data ?? []).length > 0 ? (
            <Card>
              <CardHeader
                title="Login pressure by source address"
                description="Failed sign-in attempts in the last 24 hours, highest first."
                actions={
                  <LinkButton href="/admin/security" size="sm" variant="ghost">
                    Security centre
                  </LinkButton>
                }
              />
              <ul className="mt-4 divide-y divide-line">
                {(pressure.data ?? []).slice(0, 8).map((row) => (
                  <li
                    key={row.ipAddress ?? "unknown"}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="font-mono text-xs text-ink">
                      {row.ipAddress ?? "unknown"}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-body">{row.failures}</span>
                      {row.failures >= 20 ? <Badge tone="danger">investigate</Badge> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Work queue" />
            <ul className="mt-4 space-y-2">
              {workQueue.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3 no-underline transition-colors hover:border-teal/40 hover:bg-teal/[0.03]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5 text-sm text-body">
                        <Icon className="size-4 shrink-0 text-teal" aria-hidden="true" />
                        {item.label}
                      </span>
                      <span
                        className={`shrink-0 text-lg font-semibold tabular-nums ${
                          item.value > 0 ? "text-ink" : "text-muted"
                        }`}
                      >
                        {item.value}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Activity className="size-4 text-teal" aria-hidden="true" />
                  System health
                </span>
              }
              actions={
                <LinkButton href="/admin/system" size="sm" variant="ghost">
                  Detail
                </LinkButton>
              }
            />
            {health.isLoading ? (
              <Skeleton className="mt-4 h-32 w-full" />
            ) : (
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Database</dt>
                  <dd>
                    <Badge tone={health.data?.database ? "success" : "danger"}>
                      {health.data?.database ? "connected" : "unreachable"}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">SMTP</dt>
                  <dd>
                    <Badge tone={health.data?.smtpConfigured ? "success" : "warning"}>
                      {health.data?.smtpConfigured ? "configured" : "not configured"}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Email queue</dt>
                  <dd className="tabular-nums text-ink">
                    {health.data?.emailQueue?.pending ?? 0} pending
                    {(health.data?.emailQueue?.failed ?? 0) > 0 ? (
                      <Badge tone="danger" className="ml-2">
                        {health.data?.emailQueue?.failed} failed
                      </Badge>
                    ) : null}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Active sessions</dt>
                  <dd className="tabular-nums text-ink">{health.data?.activeSessions ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Uptime</dt>
                  <dd className="tabular-nums text-ink">
                    {uptimeHours}h {uptimeMinutes}m
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Memory (RSS)</dt>
                  <dd className="tabular-nums text-ink">{health.data?.memoryMb?.rss ?? 0} MB</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card>
            <CardHeader title="Shortcuts" />
            <div className="mt-4 flex flex-col gap-2">
              <LinkButton href="/admin/catalog" variant="outline" fullWidth>
                Manage catalogue
              </LinkButton>
              <LinkButton href="/admin/content" variant="outline" fullWidth>
                Site content
              </LinkButton>
              <LinkButton href="/admin/security" variant="outline" fullWidth>
                Security centre
              </LinkButton>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
