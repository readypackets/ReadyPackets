/**
 * Admin dashboard with Recharts analytics charts.
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
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/utils";
import { LinkButton } from "@/components/ui/Button";
import { Alert, Badge, Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { StatTile } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { STATUS_LABELS, STATUS_TONES } from "../portal/orderStatus";

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function AdminDashboard() {
  const dashboard = trpc.admin.dashboard.useQuery();
  const health = trpc.adminSecurity.health.useQuery();
  const alerts = trpc.adminSecurity.alerts.useQuery();
  const pressure = trpc.adminSecurity.loginPressure.useQuery();

  const stats = dashboard.data;
  const orderStats = stats?.orders;
  const totalFailures = (pressure.data ?? []).reduce((sum, row) => sum + row.failures, 0);

  const signupChartData = (stats?.signupTrend ?? []).map((p) => ({
    date: shortDate(p.day),
    Signups: p.total,
  }));

  const orderChartData = (stats?.orderTrend ?? []).map((p) => ({
    date: shortDate(p.day),
    Orders: p.total,
  }));

  const revenueChartData = (stats?.revenueTrend ?? []).map((p) => ({
    date: shortDate(p.day),
    Revenue: +(p.revenueCents / 100).toFixed(2),
  }));

  const workQueue = [
    { label: "Open tickets", value: stats?.openTickets ?? 0, href: "/admin/tickets", icon: Inbox },
    { label: "Reviews to moderate", value: stats?.pendingReviews ?? 0, href: "/admin/moderation", icon: Star },
    { label: "New enquiries", value: stats?.newMessages ?? 0, href: "/admin/moderation", icon: Mail },
  ];

  const uptimeHours = Math.floor((health.data?.uptimeSeconds ?? 0) / 3600);
  const uptimeMinutes = Math.floor(((health.data?.uptimeSeconds ?? 0) % 3600) / 60);

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description="Everything requiring attention across orders, customers, and the platform itself."
        actions={<LinkButton href="/admin/orders" variant="outline">Order queue</LinkButton>}
      />

      {(alerts.data ?? []).length > 0 ? (
        <Alert
          tone="danger"
          className="mb-6"
          title={`${alerts.data?.length} open system alert${(alerts.data?.length ?? 0) === 1 ? "" : "s"}`}
          actions={<LinkButton href="/admin/security" size="sm">Review alerts</LinkButton>}
        >
          <ul className="space-y-1">
            {(alerts.data ?? []).slice(0, 3).map((alert) => (
              <li key={alert.id} className="text-sm">{alert.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboard.isLoading ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <Link href="/admin/orders" className="no-underline"><StatTile label="Orders (all time)" value={orderStats?.total ?? 0} icon={ClipboardList} tone="teal" hint={`${orderStats?.last30DaysCount ?? 0} in the last 30 days`} /></Link>
            <Link href="/admin/finance" className="no-underline"><StatTile label="Collected revenue" value={formatMoney(orderStats?.revenueCents ?? 0)} icon={DollarSign} tone="success" hint="Paid and partially refunded orders" /></Link>
            <Link href="/admin/customers" className="no-underline"><StatTile label="Customers" value={stats?.customers ?? 0} icon={Users} tone="navy" /></Link>
            <Link href="/admin/security" className="no-underline"><StatTile label="Failed logins (24h)" value={totalFailures} icon={ShieldAlert} tone={totalFailures > 50 ? "danger" : totalFailures > 10 ? "warning" : "neutral"} hint={`${(pressure.data ?? []).length} distinct source addresses`} /></Link>
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="New orders (30d)" description="Daily order volume" />
          {dashboard.isLoading ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : orderChartData.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No orders in the last 30 days.</p>
          ) : (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="Orders" fill="var(--color-teal)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Revenue (30d)" description="Daily collected revenue (USD)" />
          {dashboard.isLoading ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : revenueChartData.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No revenue data in the last 30 days.</p>
          ) : (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 6, fontSize: 12 }} />
                  <Area type="monotone" dataKey="Revenue" stroke="var(--color-success)" fill="url(#revenueGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="New signups (30d)" description="Daily customer registrations" />
          {dashboard.isLoading ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : signupChartData.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No registrations in the last 30 days.</p>
          ) : (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={signupChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-navy)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-navy)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 6, fontSize: 12 }} />
                  <Area type="monotone" dataKey="Signups" stroke="var(--color-navy)" fill="url(#signupGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Main content */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Order pipeline"
              description="Live count of orders in each phase of the lifecycle."
              actions={<LinkButton href="/admin/orders" size="sm" variant="outline">Open queue</LinkButton>}
            />
            {dashboard.isLoading ? (
              <Skeleton className="mt-5 h-32 w-full" />
            ) : (
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {Object.entries(STATUS_LABELS).map(([status, label]) => {
                  const value = orderStats?.byStatus?.[status] ?? 0;
                  return (
                    <li key={status}>
                      <Link href={`/admin/orders?status=${status}`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3 no-underline transition-colors hover:border-teal/40 hover:bg-teal/[0.03]">
                        <Badge tone={STATUS_TONES[status] ?? "neutral"}>{label}</Badge>
                        <span className="shrink-0 text-lg font-semibold tabular-nums text-ink">{value}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {(pressure.data ?? []).length > 0 ? (
            <Card>
              <CardHeader
                title="Login pressure by source address"
                description="Failed sign-in attempts in the last 24 hours, highest first."
                actions={<LinkButton href="/admin/security" size="sm" variant="ghost">Security centre</LinkButton>}
              />
              <ul className="mt-4 divide-y divide-line">
                {(pressure.data ?? []).slice(0, 8).map((row) => (
                  <li key={row.ipAddress ?? "unknown"} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-mono text-xs text-ink">{row.ipAddress ?? "unknown"}</span>
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
                    <Link href={item.href} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3 no-underline transition-colors hover:border-teal/40 hover:bg-teal/[0.03]">
                      <span className="flex min-w-0 items-center gap-2.5 text-sm text-body">
                        <Icon className="size-4 shrink-0 text-teal" aria-hidden="true" />
                        {item.label}
                      </span>
                      <span className={`shrink-0 text-lg font-semibold tabular-nums ${item.value > 0 ? "text-ink" : "text-muted"}`}>
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
              title={<span className="flex items-center gap-2"><Activity className="size-4 text-teal" aria-hidden="true" />System health</span>}
              actions={<LinkButton href="/admin/system" size="sm" variant="ghost">Detail</LinkButton>}
            />
            {health.isLoading ? (
              <Skeleton className="mt-4 h-32 w-full" />
            ) : (
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Database</dt>
                  <dd><Badge tone={health.data?.database ? "success" : "danger"}>{health.data?.database ? "connected" : "unreachable"}</Badge></dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">SMTP</dt>
                  <dd><Badge tone={health.data?.smtpConfigured ? "success" : "warning"}>{health.data?.smtpConfigured ? "configured" : "not configured"}</Badge></dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Email queue</dt>
                  <dd className="tabular-nums text-ink">
                    {health.data?.emailQueue?.pending ?? 0} pending
                    {(health.data?.emailQueue?.failed ?? 0) > 0 ? (
                      <Badge tone="danger" className="ml-2">{health.data?.emailQueue?.failed} failed</Badge>
                    ) : null}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Active sessions</dt>
                  <dd className="tabular-nums text-ink">{health.data?.activeSessions ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Uptime</dt>
                  <dd className="tabular-nums text-ink">{uptimeHours}h {uptimeMinutes}m</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-body">Memory (RSS)</dt>
                  <dd className="tabular-nums text-ink">{health.data?.memoryMb?.rss ?? 0} MB</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><TrendingUp className="size-4 text-teal" />Quick links</span>} />
            <div className="mt-4 flex flex-col gap-2">
              <LinkButton href="/admin/catalog" variant="outline" fullWidth>Manage catalogue</LinkButton>
              <LinkButton href="/admin/content" variant="outline" fullWidth>Site content</LinkButton>
              <LinkButton href="/admin/security" variant="outline" fullWidth>Security centre</LinkButton>
              <LinkButton href="/admin/finance" variant="outline" fullWidth>Finance</LinkButton>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
