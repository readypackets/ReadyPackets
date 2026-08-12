/**
 * Security centre: rate limits, IP blocklist and allowlist, the three log
 * streams, active sessions, and system alerts.
 *
 * Every control here writes to the audit trail, including the act of reading a
 * log, because an investigation needs to know who looked at what and when.
 */
import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  Filter,
  Gauge,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserX,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  type BadgeTone,
} from "@/components/ui/Surface";
import { TabStrip } from "@/components/ui/DataDisplay";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

const SEVERITY_TONES: Record<string, BadgeTone> = {
  debug: "neutral",
  info: "info",
  notice: "teal",
  warning: "warning",
  error: "danger",
  critical: "danger",
};

export function AdminSecurityPage() {
  const [tab, setTab] = useState("limits");

  return (
    <>
      <PageHeader
        title="Security centre"
        description="Abuse controls, network policy, audit trails, and live sessions."
      />

      <TabStrip
        tabs={[
          { id: "limits", label: "Rate limits" },
          { id: "network", label: "IP policy" },
          { id: "logs", label: "Logs" },
          { id: "sessions", label: "Sessions" },
          { id: "alerts", label: "Alerts" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-6">
        {tab === "limits" ? <RateLimitsPanel /> : null}
        {tab === "network" ? <NetworkPanel /> : null}
        {tab === "logs" ? <LogsPanel /> : null}
        {tab === "sessions" ? <SessionsPanel /> : null}
        {tab === "alerts" ? <AlertsPanel /> : null}
      </div>
    </>
  );
}

function RateLimitsPanel() {
  const toast = useToast();
  const limits = trpc.adminSecurity.rateLimits.useQuery();
  const [drafts, setDrafts] = useState<
    Record<string, { windowSeconds: number; maxRequests: number; enabled: boolean; penaltyEnabled: boolean }>
  >({});

  const update = trpc.adminSecurity.updateRateLimit.useMutation({
    async onSuccess() {
      await limits.refetch();
      toast.success("Rate limit updated", "The change takes effect immediately.");
    },
    onError(error) {
      toast.error("Could not update the limit", errorMessage(error));
    },
  });

  if (limits.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <Alert tone="info" className="mb-5" title="How limits are applied">
        Requests are counted per source address and per category. Exceeding a limit returns HTTP 429
        with a Retry-After header; with penalties enabled, repeat offenders face progressively longer
        cool-off periods rather than a fixed one.
      </Alert>

      <div className="space-y-4">
        {(limits.data ?? []).map((limit) => {
          const draft = drafts[limit.category] ?? {
            windowSeconds: limit.windowSeconds,
            maxRequests: limit.maxRequests,
            enabled: limit.enabled,
            penaltyEnabled: limit.penaltyEnabled,
          };
          const setDraft = (patch: Partial<typeof draft>) =>
            setDrafts((current) => ({
              ...current,
              [limit.category]: { ...draft, ...patch },
            }));

          return (
            <Card key={limit.category}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Gauge className="size-4 text-teal" aria-hidden="true" />
                    {limit.label}
                  </span>
                }
                description={`Category: ${limit.category}`}
                actions={
                  <Badge tone={limit.enabled ? "success" : "neutral"}>
                    {limit.enabled ? "enforced" : "disabled"}
                  </Badge>
                }
              />

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Window (seconds)"
                  type="number"
                  min={10}
                  max={86_400}
                  value={String(draft.windowSeconds)}
                  onChange={(event) => setDraft({ windowSeconds: Number(event.target.value) })}
                />
                <Input
                  label="Maximum requests per window"
                  type="number"
                  min={1}
                  max={100_000}
                  value={String(draft.maxRequests)}
                  onChange={(event) => setDraft({ maxRequests: Number(event.target.value) })}
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Checkbox
                  label="Enforce this limit"
                  checked={draft.enabled}
                  onChange={(event) => setDraft({ enabled: event.target.checked })}
                />
                <Checkbox
                  label="Escalating penalties for repeat offenders"
                  checked={draft.penaltyEnabled}
                  onChange={(event) => setDraft({ penaltyEnabled: event.target.checked })}
                />
              </div>

              <Button
                className="mt-4"
                busy={update.isPending}
                onClick={() =>
                  update.mutate({
                    category: limit.category as never,
                    windowSeconds: draft.windowSeconds,
                    maxRequests: draft.maxRequests,
                    enabled: draft.enabled,
                    penaltyEnabled: draft.penaltyEnabled,
                  })
                }
                leadingIcon={<Save className="size-4" aria-hidden="true" />}
              >
                Save
              </Button>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function NetworkPanel() {
  const toast = useToast();
  const blacklist = trpc.adminSecurity.blacklist.useQuery({ limit: 200 });
  const allowlist = trpc.adminSecurity.allowlist.useQuery();

  const [blockOpen, setBlockOpen] = useState(false);
  const [pattern, setPattern] = useState("");
  const [reason, setReason] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("");
  const [blockError, setBlockError] = useState<string | null>(null);

  const [allowOpen, setAllowOpen] = useState(false);
  const [allowPattern, setAllowPattern] = useState("");
  const [allowScope, setAllowScope] = useState("admin");
  const [allowNote, setAllowNote] = useState("");
  const [allowError, setAllowError] = useState<string | null>(null);

  const addBlock = trpc.adminSecurity.addToBlacklist.useMutation({
    async onSuccess() {
      setBlockOpen(false);
      setPattern("");
      setReason("");
      setExpiresInHours("");
      await blacklist.refetch();
      toast.success("Address blocked");
    },
    onError(error) {
      setBlockError(errorMessage(error));
    },
  });

  const removeBlock = trpc.adminSecurity.removeFromBlacklist.useMutation({
    async onSuccess() {
      await blacklist.refetch();
      toast.success("Block removed");
    },
    onError(error) {
      toast.error("Could not remove the block", errorMessage(error));
    },
  });

  const addAllow = trpc.adminSecurity.addToAllowlist.useMutation({
    async onSuccess() {
      setAllowOpen(false);
      setAllowPattern("");
      setAllowNote("");
      await allowlist.refetch();
      toast.success("Address allowed");
    },
    onError(error) {
      setAllowError(errorMessage(error));
    },
  });

  const removeAllow = trpc.adminSecurity.removeFromAllowlist.useMutation({
    async onSuccess() {
      await allowlist.refetch();
      toast.success("Allowlist entry removed");
    },
    onError(error) {
      toast.error("Could not remove the entry", errorMessage(error));
    },
  });

  return (
    <>
      <Alert tone="warning" className="mb-5" title="Careful with allowlists">
        An allowlist entry scoped to <code>admin</code> restricts the admin panel to those addresses.
        Add your own network before enabling the corresponding setting, or you will lock yourself out.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader
            title="Blocked addresses"
            description="Individual addresses or CIDR ranges denied at the edge of the application."
            actions={
              <Button
                size="sm"
                onClick={() => {
                  setBlockError(null);
                  setBlockOpen(true);
                }}
                leadingIcon={<Plus className="size-4" aria-hidden="true" />}
              >
                Block
              </Button>
            }
          />
          {blacklist.isLoading ? (
            <Skeleton className="mt-4 h-32 w-full" />
          ) : (blacklist.data ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-body">Nothing is currently blocked.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {(blacklist.data ?? []).map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium text-ink">{entry.pattern}</p>
                    <p className="mt-0.5 text-xs text-body">{entry.reason}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {entry.hitCount} hit{entry.hitCount === 1 ? "" : "s"} ·{" "}
                      {entry.expiresAt
                        ? `expires ${formatDateTime(entry.expiresAt)}`
                        : "permanent"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeBlock.mutate({ id: entry.id })}
                    leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Allowlist"
            description="Addresses exempt from maintenance mode, or permitted to reach the admin panel."
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAllowError(null);
                  setAllowOpen(true);
                }}
                leadingIcon={<Plus className="size-4" aria-hidden="true" />}
              >
                Allow
              </Button>
            }
          />
          {allowlist.isLoading ? (
            <Skeleton className="mt-4 h-32 w-full" />
          ) : (allowlist.data ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-body">No allowlist entries.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {(allowlist.data ?? []).map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium text-ink">{entry.pattern}</p>
                    <p className="mt-0.5">
                      <Badge tone="teal">{entry.scope}</Badge>
                    </p>
                    {entry.note ? (
                      <p className="mt-0.5 text-xs text-muted">{entry.note}</p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeAllow.mutate({ id: entry.id })}
                    leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="Block an address"
        description="Accepts a single IPv4 or IPv6 address, or a CIDR range such as 203.0.113.0/24."
        footer={
          <>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={addBlock.isPending}
              onClick={() =>
                addBlock.mutate({
                  pattern: pattern.trim(),
                  reason: reason.trim(),
                  expiresInHours: expiresInHours ? Number(expiresInHours) : null,
                })
              }
            >
              Block address
            </Button>
          </>
        }
      >
        {blockError ? <Alert tone="danger">{blockError}</Alert> : null}
        <div className="mt-4 space-y-4">
          <Input
            label="Address or range"
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="203.0.113.42"
            required
          />
          <Input
            label="Reason"
            help="Recorded in the audit trail."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={255}
          />
          <Input
            label="Expires in (hours)"
            help="Leave blank for a permanent block."
            type="number"
            min={1}
            max={8_760}
            value={expiresInHours}
            onChange={(event) => setExpiresInHours(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={allowOpen}
        onClose={() => setAllowOpen(false)}
        title="Add an allowlist entry"
        footer={
          <>
            <Button variant="outline" onClick={() => setAllowOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={addAllow.isPending}
              onClick={() =>
                addAllow.mutate({
                  pattern: allowPattern.trim(),
                  scope: allowScope as never,
                  note: allowNote.trim() || undefined,
                })
              }
            >
              Add entry
            </Button>
          </>
        }
      >
        {allowError ? <Alert tone="danger">{allowError}</Alert> : null}
        <div className="mt-4 space-y-4">
          <Input
            label="Address or range"
            value={allowPattern}
            onChange={(event) => setAllowPattern(event.target.value)}
            placeholder="198.51.100.0/24"
            required
          />
          <Select
            label="Scope"
            value={allowScope}
            onChange={(event) => setAllowScope(event.target.value)}
            options={[
              { value: "admin", label: "Admin panel access" },
              { value: "maintenance", label: "Bypass maintenance mode" },
              { value: "all", label: "Both" },
            ]}
          />
          <Input
            label="Note"
            value={allowNote}
            onChange={(event) => setAllowNote(event.target.value)}
            maxLength={255}
          />
        </div>
      </Modal>
    </>
  );
}

function LogsPanel() {
  const toast = useToast();
  const [stream, setStream] = useState("security");
  const [severity, setSeverity] = useState("");
  const [eventType, setEventType] = useState("");
  const [outcome, setOutcome] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [blocking, setBlocking] = useState<{ ipAddress: string } | null>(null);
  const [banning, setBanning] = useState<{ userId: number } | null>(null);

  const securityLogs = trpc.adminSecurity.securityLogSearch.useQuery(
    {
      severity: (severity || undefined) as never,
      eventType: eventType.trim() || undefined,
      outcome: outcome.trim() || undefined,
      ipAddress: ipAddress.trim() || undefined,
      userId: userId ? Number(userId) : undefined,
      query: query.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: 200,
      offset: 0,
    },
    { enabled: stream === "security" },
  );
  const activityLogs = trpc.adminSecurity.activityLogs.useQuery({ limit: 200, offset: 0 }, { enabled: stream === "activity" });
  const emailLog = trpc.adminSecurity.emailLog.useQuery({ limit: 200 }, { enabled: stream === "email" });
  const review = trpc.adminSecurity.reviewSecurityLog.useMutation({ onSuccess: (entry) => setSelected(entry as unknown as Record<string, unknown>), onError: (error) => toast.error("Could not open event", errorMessage(error)) });
  const block = trpc.adminSecurity.blockLogIp.useMutation({ onSuccess: () => { setBlocking(null); toast.success("Address blocked", "The source address has been added to the network blocklist."); }, onError: (error) => toast.error("Could not block address", errorMessage(error)) });
  const ban = trpc.adminSecurity.banLogUser.useMutation({ onSuccess: () => { setBanning(null); void securityLogs.refetch(); toast.success("Account banned", "The account has been deactivated and all active sessions were revoked."); }, onError: (error) => toast.error("Could not ban account", errorMessage(error)) });

  const resetFilters = () => { setSeverity(""); setEventType(""); setOutcome(""); setIpAddress(""); setUserId(""); setQuery(""); setFrom(""); setTo(""); };

  return (
    <>
      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Stream" value={stream} onChange={(event) => setStream(event.target.value)} options={[{ value: "security", label: "Security events" }, { value: "activity", label: "Activity trail" }, { value: "email", label: "Email delivery" }]} />
          {stream === "security" ? <>
            <Select label="Severity" value={severity} onChange={(event) => setSeverity(event.target.value)} options={[{ value: "", label: "All severities" }, { value: "debug", label: "Debug" }, { value: "info", label: "Info" }, { value: "notice", label: "Notice" }, { value: "warning", label: "Warning" }, { value: "error", label: "Error" }, { value: "critical", label: "Critical" }]} />
            <Select label="Outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} options={[{ value: "", label: "All outcomes" }, { value: "success", label: "Success" }, { value: "failure", label: "Failure" }, { value: "blocked", label: "Blocked" }]} />
            <Input label="Search message or event" placeholder="login failure" value={query} onChange={(event) => setQuery(event.target.value)} leadingIcon={<Filter className="size-4" aria-hidden="true" />} />
            <Input label="Event type" placeholder="login.failure" value={eventType} onChange={(event) => setEventType(event.target.value)} />
            <Input label="Source address" placeholder="203.0.113.8" value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} />
            <Input label="Internal user ID" inputMode="numeric" placeholder="123" value={userId} onChange={(event) => setUserId(event.target.value.replace(/\D/g, ""))} />
            <Input label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <Input label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </> : null}
        </div>
        {stream === "security" ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-muted">{securityLogs.data?.total ?? 0} matching event(s). Open an event to inspect its metadata or take a contained response action.</p><Button size="sm" variant="ghost" onClick={resetFilters}>Clear search</Button></div> : null}
      </Card>

      {stream === "security" ? (securityLogs.isLoading ? <Skeleton className="h-64 w-full" /> : (securityLogs.data?.rows ?? []).length === 0 ? <EmptyState icon={ShieldCheck} title="No matching security events" description="Either nothing has happened, or your filters are too narrow." /> : (
        <Card padded={false}><ul className="divide-y divide-line">{(securityLogs.data?.rows ?? []).map((entry) => (
          <li key={entry.id} className="px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={SEVERITY_TONES[entry.severity] ?? "neutral"}>{entry.severity}</Badge><code className="text-xs text-muted">{entry.eventType}</code>{entry.outcome ? <Badge tone="neutral">{entry.outcome}</Badge> : null}</div><p className="mt-1.5 text-sm text-ink">{entry.message}</p><p className="mt-0.5 font-mono text-xs text-muted">{entry.ipAddress ?? "no address"}{entry.userPublicId ? ` · account ${entry.userPublicId}` : entry.userId ? " · linked account" : ""}</p></div><div className="flex shrink-0 flex-wrap items-center gap-2"><span className="text-xs text-muted">{formatDateTime(entry.createdAt)}</span><Button size="sm" variant="outline" busy={review.isPending} onClick={() => review.mutate({ id: entry.id })} leadingIcon={<Eye className="size-3.5" aria-hidden="true" />}>View</Button>{entry.ipAddress ? <Button size="sm" variant="danger" onClick={() => setBlocking({ ipAddress: entry.ipAddress! })}>Block IP</Button> : null}{entry.userId ? <Button size="sm" variant="danger" onClick={() => setBanning({ userId: entry.userId! })}>Ban account</Button> : null}</div></div></li>
        ))}</ul></Card>
      )) : null}

      {stream === "activity" ? (activityLogs.isLoading ? <Skeleton className="h-64 w-full" /> : <Card padded={false}><ul className="divide-y divide-line">{(activityLogs.data ?? []).map((entry) => <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><code className="text-xs text-muted">{entry.action}</code>{entry.actorRole ? <Badge tone="neutral">{entry.actorRole}</Badge> : null}</div><p className="mt-1.5 text-sm text-ink">{entry.summary}</p><p className="mt-0.5 font-mono text-xs text-muted">{entry.ipAddress ?? "no address"}{entry.entityType ? ` · ${entry.entityType} ${entry.entityId ?? ""}` : ""}</p></div><span className="shrink-0 text-xs text-muted">{formatDateTime(entry.createdAt)}</span></li>)}</ul></Card>) : null}

      {stream === "email" ? (emailLog.isLoading ? <Skeleton className="h-64 w-full" /> : <Card padded={false}><ul className="divide-y divide-line">{(emailLog.data ?? []).map((entry) => <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={entry.status === "sent" ? "success" : entry.status === "failed" ? "danger" : "warning"}>{entry.status}</Badge><code className="text-xs text-muted">{entry.templateKey ?? "ad-hoc"}</code></div><p className="mt-1.5 truncate text-sm text-ink">{entry.subject}</p>{entry.detail ? <p className="mt-0.5 text-xs text-danger">{entry.detail}</p> : null}</div><span className="shrink-0 text-xs text-muted">{formatDateTime(entry.createdAt)}</span></li>)}</ul></Card>) : null}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Security event review" footer={<Button variant="outline" onClick={() => setSelected(null)}>Close</Button>}>
        {selected ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><p><span className="text-xs text-muted">Event</span><br /><code>{String(selected.eventType ?? "—")}</code></p><p><span className="text-xs text-muted">Recorded</span><br />{selected.createdAt ? formatDateTime(selected.createdAt as Date) : "—"}</p><p><span className="text-xs text-muted">Source</span><br /><code>{String(selected.ipAddress ?? "no address")}</code></p><p><span className="text-xs text-muted">Account</span><br />{selected.userPublicId ? String(selected.userPublicId) : selected.userId ? "Linked account" : "No linked account"}</p></div><div><p className="text-xs text-muted">Message</p><p className="mt-1 text-sm text-ink">{String(selected.message ?? "—")}</p></div><div><p className="text-xs text-muted">Metadata</p><pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-surface-sunken p-3 text-xs text-ink">{JSON.stringify(selected.metadata ?? {}, null, 2)}</pre></div></div> : null}
      </Modal>
      <ConfirmDialog open={Boolean(blocking)} onClose={() => setBlocking(null)} onConfirm={() => { if (blocking) block.mutate({ ipAddress: blocking.ipAddress, reason: "Blocked from Security Centre log review." }); }} title="Block this source address?" message={`Block ${blocking?.ipAddress ?? "this address"} from the platform? This is an immediate network control and can be removed later from IP policy.`} confirmLabel="Block address" cancelLabel="Cancel" variant="danger" busy={block.isPending} />
      <ConfirmDialog open={Boolean(banning)} onClose={() => setBanning(null)} onConfirm={() => { if (banning) ban.mutate({ userId: banning.userId, reason: "Banned from Security Centre log review." }); }} title="Ban this account?" message={`Deactivate internal account ${banning?.userId ?? ""} and revoke all active sessions? This can be reversed from customer management by restoring the account to Active.`} confirmLabel="Ban account" cancelLabel="Cancel" variant="danger" busy={ban.isPending} />
    </>
  );
}

function SessionsPanel() {
  const toast = useToast();
  const sessions = trpc.adminSecurity.activeSessions.useQuery();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const revoke = trpc.adminSecurity.revokeUserSession.useMutation({
    async onSuccess() {
      setConfirmId(null);
      await sessions.refetch();
      toast.success("Session revoked");
    },
    onError(error) {
      toast.error("Could not revoke the session", errorMessage(error));
    },
  });

  if (sessions.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <Card padded={false}>
        <ul className="divide-y divide-line">
          {(sessions.data ?? []).map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {entry.user}
                  {entry.mfaPending ? <Badge tone="warning">MFA pending</Badge> : null}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {entry.ipAddress ?? "no address"}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted" title={entry.userAgent ?? ""}>
                  {entry.userAgent ?? "Unknown device"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Last active {formatRelative(entry.lastSeenAt)} · expires{" "}
                  {formatDateTime(entry.expiresAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmId(entry.id)}
                leadingIcon={<UserX className="size-4" aria-hidden="true" />}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) revoke.mutate({ sessionId: confirmId });
        }}
        title="Revoke this session?"
        message="The user will be signed out on that device immediately and must authenticate again."
        confirmLabel="Revoke session"
        variant="danger"
        busy={revoke.isPending}
      />
    </>
  );
}

function AlertsPanel() {
  const toast = useToast();
  const [includeResolved, setIncludeResolved] = useState(false);
  const alerts = trpc.adminSecurity.alerts.useQuery({ includeResolved });

  const acknowledge = trpc.adminSecurity.acknowledgeAlert.useMutation({
    async onSuccess() {
      await alerts.refetch();
      toast.success("Alert acknowledged");
    },
    onError(error) {
      toast.error("Could not acknowledge the alert", errorMessage(error));
    },
  });

  const resolve = trpc.adminSecurity.resolveAlert.useMutation({
    async onSuccess() {
      await alerts.refetch();
      toast.success("Alert resolved");
    },
    onError(error) {
      toast.error("Could not resolve the alert", errorMessage(error));
    },
  });

  return (
    <>
      <Card className="mb-5">
        <Checkbox
          label="Include resolved alerts"
          checked={includeResolved}
          onChange={(event) => setIncludeResolved(event.target.checked)}
        />
      </Card>

      {alerts.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (alerts.data ?? []).length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No open alerts"
          description="The platform has not raised anything requiring your attention."
        />
      ) : (
        <div className="space-y-4">
          {(alerts.data ?? []).map((alert) => (
            <Card key={alert.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONES[alert.severity] ?? "warning"}>
                      {alert.severity}
                    </Badge>
                    <code className="text-xs text-muted">{alert.alertKey}</code>
                    {alert.resolvedAt ? <Badge tone="success">resolved</Badge> : null}
                    {alert.acknowledgedAt && !alert.resolvedAt ? (
                      <Badge tone="teal">acknowledged</Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-2 flex items-center gap-2 font-semibold text-ink">
                    <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                    {alert.message}
                  </h3>
                  {alert.detail ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-body">{alert.detail}</p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-muted">
                    Seen {alert.occurrences} time{alert.occurrences === 1 ? "" : "s"} · last{" "}
                    {formatRelative(alert.lastSeenAt)}
                  </p>
                </div>

                {alert.resolvedAt ? null : (
                  <div className="flex flex-col gap-2">
                    {alert.acknowledgedAt ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        busy={acknowledge.isPending}
                        onClick={() => acknowledge.mutate({ id: alert.id })}
                      >
                        Acknowledge
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      busy={resolve.isPending}
                      onClick={() => resolve.mutate({ id: alert.id })}
                      leadingIcon={<Ban className="size-4" aria-hidden="true" />}
                    >
                      Resolve
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
