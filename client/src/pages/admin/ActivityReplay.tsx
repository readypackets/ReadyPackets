/**
 * Admin Activity Log Replay page.
 * View the full history of changes to any entity, or a user's full timeline.
 */
import { useState, useMemo } from "react";
import { History, User, Search, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select } from "@/components/ui/Field";
import { Card, CardHeader, Badge, EmptyState, Skeleton } from "@/components/ui/Surface";
import { TabStrip } from "@/components/ui/DataDisplay";
import { PageHeader } from "@/components/layout/PortalLayout";
import { formatDateTime } from "@/lib/utils";

const SEVERITY_TONES: Record<string, "success" | "warning" | "danger" | "neutral" | "teal" | "info"> = {
  info: "neutral",
  notice: "teal",
  warning: "warning",
  critical: "danger",
};

const ENTITY_TYPES = [
  { value: "user", label: "User" },
  { value: "order", label: "Order" },
  { value: "file", label: "File" },
  { value: "ticket", label: "Ticket" },
  { value: "product", label: "Product" },
  { value: "site_setting", label: "Site setting" },
  { value: "forum_topic", label: "Forum topic" },
];

export function AdminActivityReplay() {
  const [tab, setTab] = useState("entity");

  // Entity history
  const [entityType, setEntityType] = useState("user");
  const [entityId, setEntityId] = useState("");
  const [entitySearched, setEntitySearched] = useState(false);

  // User timeline
  const [userId, setUserId] = useState("");
  const [userSearched, setUserSearched] = useState(false);

  // Summary
  const summary = trpc.tier4.activityReplay.summary.useQuery({});

  const entityHistory = trpc.tier4.activityReplay.entityHistory.useQuery(
    { entityType, entityId: entityId.trim(), limit: 100 },
    { enabled: entitySearched && Boolean(entityId.trim()) },
  );

  const userTimeline = trpc.tier4.activityReplay.userTimeline.useQuery(
    { userId: Number(userId), limit: 100 },
    { enabled: userSearched && Boolean(userId) && !isNaN(Number(userId)) },
  );

  const tabItems = useMemo(() => [
    { id: "entity", label: "Entity history" },
    { id: "user", label: "User timeline" },
    { id: "summary", label: "Summary" },
  ], []);

  return (
    <>
      <PageHeader
        title="Activity replay"
        description="Replay the full change history for any entity or user."
      />

      <TabStrip tabs={tabItems} active={tab} onChange={setTab} />

      <div className="mt-6">
        {tab === "entity" && (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Search entity history" />
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <FieldShell label="Entity type">
                  <Select
                    value={entityType}
                    onChange={(e) => { setEntityType(e.target.value); setEntitySearched(false); }}
                    options={ENTITY_TYPES}
                  />
                </FieldShell>
                <FieldShell label="Entity ID">
                  <Input
                    value={entityId}
                    onChange={(e) => { setEntityId(e.target.value); setEntitySearched(false); }}
                    placeholder="e.g. 42"
                  />
                </FieldShell>
                <div className="flex items-end">
                  <Button
                    onClick={() => setEntitySearched(true)}
                    disabled={!entityId.trim()}
                    leadingIcon={<Search className="size-4" aria-hidden="true" />}
                    fullWidth
                  >
                    Load history
                  </Button>
                </div>
              </div>
            </Card>

            {entitySearched && entityHistory.isLoading && <Skeleton className="h-64 w-full" />}
            {entitySearched && !entityHistory.isLoading && (
              <Card padded={false}>
                {(entityHistory.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={History}
                    title="No history found"
                    description={`No activity log entries for ${entityType} #${entityId}.`}
                  />
                ) : (
                  <div className="relative">
                    <div className="absolute left-8 top-0 bottom-0 w-px bg-line" />
                    <ul className="space-y-0 divide-y divide-line">
                      {(entityHistory.data ?? []).map((entry, index) => (
                        <li key={entry.id} className="relative flex gap-4 px-4 py-4">
                          <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-soft border border-line">
                            <ChevronRight className="size-3.5 text-muted" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={SEVERITY_TONES[entry.severity] ?? "neutral"}>
                                {entry.severity}
                              </Badge>
                              <code className="text-xs text-muted">{entry.action}</code>
                              {entry.actorRole && (
                                <Badge tone="neutral">{entry.actorRole}</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-ink">{entry.summary}</p>
                            <p className="mt-0.5 text-xs text-muted">
                              by {entry.actor}
                              {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
                            </p>
                            {entry.changes && Object.keys(entry.changes).length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-teal-dark hover:underline">
                                  View changes
                                </summary>
                                <pre className="mt-1 rounded bg-surface-sunken p-2 text-xs text-body overflow-x-auto">
                                  {JSON.stringify(entry.changes, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-muted">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {tab === "user" && (
          <div className="space-y-6">
            <Card>
              <CardHeader title="User timeline" />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <FieldShell label="User ID">
                  <Input
                    value={userId}
                    onChange={(e) => { setUserId(e.target.value); setUserSearched(false); }}
                    placeholder="e.g. 1"
                    type="number"
                  />
                </FieldShell>
                <div className="flex items-end">
                  <Button
                    onClick={() => setUserSearched(true)}
                    disabled={!userId || isNaN(Number(userId))}
                    leadingIcon={<User className="size-4" aria-hidden="true" />}
                    fullWidth
                  >
                    Load timeline
                  </Button>
                </div>
              </div>
            </Card>

            {userSearched && userTimeline.isLoading && <Skeleton className="h-64 w-full" />}
            {userSearched && !userTimeline.isLoading && (
              <Card padded={false}>
                {(userTimeline.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={User}
                    title="No activity found"
                    description={`No activity log entries for user #${userId}.`}
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {(userTimeline.data ?? []).map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs text-muted">{entry.action}</code>
                            {entry.entityType && (
                              <Badge tone="neutral">{entry.entityType} {entry.entityId ?? ""}</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-ink">{entry.summary}</p>
                          {entry.ipAddress && (
                            <p className="mt-0.5 font-mono text-xs text-muted">{entry.ipAddress}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        )}

        {tab === "summary" && (
          <Card padded={false}>
            {summary.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Action</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted text-right">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(summary.data ?? []).map((row) => (
                    <tr key={row.action} className="hover:bg-surface-raised transition-colors">
                      <td className="px-4 py-3 font-mono text-sm text-ink">{row.action}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-ink">{row.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
