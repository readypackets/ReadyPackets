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

function UserHistorySelector({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const users = trpc.admin.customers.useQuery({ search: query.trim(), limit: 20 }, { enabled: query.trim().length >= 2 });
  const selectUser = (user: { id: number; publicId?: string | null; name: string; email: string }) => {
    onSelect(user.publicId ?? String(user.id));
    setQuery("");
  };
  return <div className="relative"><Input value={query || value} onChange={(event) => { setQuery(event.target.value); if (!event.target.value) onSelect(""); }} placeholder="Search customer name, email, or RP-U ID" />{query.trim().length >= 2 && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lg">{users.isLoading ? <p className="px-3 py-2 text-sm text-muted">Searching accounts…</p> : users.data?.length ? users.data.map((user) => <button type="button" key={user.id} onClick={() => selectUser(user)} className="block w-full border-b border-line px-3 py-2 text-left hover:bg-surface-soft"><span className="block text-sm font-medium text-ink">{user.name || user.email}</span><span className="block font-mono text-xs text-muted">{user.publicId ?? `User #${user.id}`} · {user.email}</span></button>) : <p className="px-3 py-2 text-sm text-muted">No matching accounts.</p>}</div>}</div>;
}

export function AdminActivityReplay() {
  const [tab, setTab] = useState("entity");

  // Entity history
  const [entityType, setEntityType] = useState("user");
  const [entityId, setEntityId] = useState("");
  const [entitySearched, setEntitySearched] = useState(false);

  // User timeline
  const [userId, setUserId] = useState("");
  const [userSearched, setUserSearched] = useState(false);

  // Cross-system operational search
  const [searchAction, setSearchAction] = useState("");
  const [searchEntityType, setSearchEntityType] = useState("");
  const [searchSeverity, setSearchSeverity] = useState("");
  const [searchIp, setSearchIp] = useState("");
  const [searchActorUserReference, setSearchActorUserReference] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searchRequested, setSearchRequested] = useState(false);
  const activitySearch = trpc.tier4.activityReplay.search.useQuery({
    action: searchAction.trim() || undefined,
    entityType: searchEntityType || undefined,
    severity: (searchSeverity || undefined) as "debug" | "info" | "notice" | "warning" | "error" | "critical" | undefined,
    ipAddress: searchIp.trim() || undefined,
    actorUserReference: searchActorUserReference.trim() || undefined,
    query: searchText.trim() || undefined,
    from: searchFrom || undefined,
    to: searchTo || undefined,
    limit: 200,
  }, { enabled: tab === "search" && searchRequested });

  // Summary
  const summary = trpc.tier4.activityReplay.summary.useQuery({});

  const entityHistory = trpc.tier4.activityReplay.entityHistory.useQuery(
    { entityType, entityId: entityId.trim(), limit: 100 },
    { enabled: entitySearched && Boolean(entityId.trim()) },
  );

  const userTimeline = trpc.tier4.activityReplay.userTimeline.useQuery(
    { userReference: userId.trim(), limit: 100 },
    { enabled: userSearched && Boolean(userId.trim()) },
  );

  const tabItems = useMemo(() => [
    { id: "search", label: "Advanced search" },
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
        {tab === "search" && (
          <div className="space-y-6">
            <Card><CardHeader title="Advanced operational search" description="Search activity records by action, entity, severity, source address, text, and date range." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><FieldShell label="Search text"><Input value={searchText} onChange={(event) => { setSearchText(event.target.value); setSearchRequested(false); }} placeholder="Summary, action, or entity reference" /></FieldShell><FieldShell label="Action"><Input value={searchAction} onChange={(event) => { setSearchAction(event.target.value); setSearchRequested(false); }} placeholder="Example: order." /></FieldShell><FieldShell label="Entity type"><Select value={searchEntityType} onChange={(event) => { setSearchEntityType(event.target.value); setSearchRequested(false); }} options={[{ value: "", label: "All entity types" }, ...ENTITY_TYPES]} /></FieldShell><FieldShell label="Severity"><Select value={searchSeverity} onChange={(event) => { setSearchSeverity(event.target.value); setSearchRequested(false); }} options={[{ value: "", label: "All severities" }, { value: "debug", label: "Debug" }, { value: "info", label: "Info" }, { value: "notice", label: "Notice" }, { value: "warning", label: "Warning" }, { value: "error", label: "Error" }, { value: "critical", label: "Critical" }]} /></FieldShell><FieldShell label="IP address"><Input value={searchIp} onChange={(event) => { setSearchIp(event.target.value); setSearchRequested(false); }} placeholder="Full or partial address" /></FieldShell><FieldShell label="Actor customer / user ID"><Input value={searchActorUserReference} onChange={(event) => { setSearchActorUserReference(event.target.value.toUpperCase()); setSearchRequested(false); }} placeholder="RP-U-XXXXXXXXXXXX" /></FieldShell><FieldShell label="From"><Input type="date" value={searchFrom} onChange={(event) => { setSearchFrom(event.target.value); setSearchRequested(false); }} /></FieldShell><FieldShell label="To"><Input type="date" value={searchTo} onChange={(event) => { setSearchTo(event.target.value); setSearchRequested(false); }} /></FieldShell><div className="flex items-end"><Button fullWidth onClick={() => setSearchRequested(true)} leadingIcon={<Search className="size-4" aria-hidden="true" />}>Search logs</Button></div></div>
            </Card>
            {searchRequested && activitySearch.isLoading ? <Skeleton className="h-64 w-full" /> : null}
            {searchRequested && !activitySearch.isLoading ? <Card padded={false}><CardHeader className="px-4 pt-4" title={`${activitySearch.data?.total ?? 0} matching activity record(s)`} /><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-y border-line text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3">Time</th><th className="px-4 py-3">Severity</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Summary</th><th className="px-4 py-3">Source</th></tr></thead><tbody className="divide-y divide-line">{(activitySearch.data?.rows ?? []).map((entry) => <tr key={entry.id}><td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatDateTime(entry.createdAt)}</td><td className="px-4 py-3"><Badge tone={SEVERITY_TONES[entry.severity] ?? "neutral"}>{entry.severity}</Badge></td><td className="px-4 py-3 font-mono text-xs text-ink">{entry.action}</td><td className="px-4 py-3 text-xs text-body">{entry.entityType ?? "system"}{entry.entityId ? ` · ${entry.entityId}` : ""}</td><td className="px-4 py-3 font-mono text-xs text-body">{entry.actorPublicId ?? "system"}</td><td className="max-w-sm px-4 py-3 text-body">{entry.summary}</td><td className="px-4 py-3 font-mono text-xs text-muted">{entry.ipAddress ?? "—"}</td></tr>)}</tbody></table></div>{(activitySearch.data?.rows ?? []).length === 0 ? <EmptyState icon={Search} title="No matching activity" description="Adjust the filters and search again." /> : null}</Card> : null}
          </div>
        )}

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
                <FieldShell label={entityType === "user" ? "Customer / user" : "Entity ID"}>
                  {entityType === "user" ? <UserHistorySelector value={entityId} onSelect={(value) => { setEntityId(value); setEntitySearched(false); }} /> : <Input value={entityId} onChange={(e) => { setEntityId(e.target.value); setEntitySearched(false); }} placeholder="e.g. 42" />}
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
                <FieldShell label="Search and select customer / user">
                  <UserHistorySelector value={userId} onSelect={(value) => { setUserId(value); setUserSearched(false); }} />
                </FieldShell>
                <div className="flex items-end">
                  <Button
                    onClick={() => setUserSearched(true)}
                    disabled={!userId.trim()}
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
                    description={`No activity log entries for user ${userId}.`}
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
