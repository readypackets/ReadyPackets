/**
 * System administration: settings, feature flags, API keys, SAML, health, and
 * housekeeping.
 *
 * Secret settings report presence only — the server never returns their value —
 * so an administrator can confirm a credential is configured without being able
 * to read it back out of the database through the UI.
 */
import { useEffect, useState } from "react";
import {
  Activity,
  Database,
  Flag,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
  Users,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui/Surface";
import { TabStrip } from "@/components/ui/DataDisplay";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

export function AdminSystemPage() {
  const [tab, setTab] = useState("health");

  return (
    <>
      <PageHeader
        title="System"
        description="Runtime health, platform settings, feature flags, integrations, and housekeeping."
      />

            <TabStrip
        tabs={[
          { id: "health", label: "Health" },
          { id: "settings", label: "Settings" },
          { id: "flags", label: "Feature flags" },
          { id: "keys", label: "API keys" },
          { id: "saml", label: "SAML" },
          { id: "maintenance", label: "Housekeeping" },
          { id: "launch", label: "Launch countdown" },
          { id: "intake", label: "Intake controls" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-6">
        {tab === "health" ? <HealthPanel /> : null}
        {tab === "settings" ? <SettingsPanel /> : null}
        {tab === "flags" ? <FlagsPanel /> : null}
        {tab === "keys" ? <ApiKeysPanel /> : null}
        {tab === "saml" ? <SamlPanel /> : null}
        {tab === "maintenance" ? <><MaintenanceAccessPanel /><MaintenancePanel /></> : null}
        {tab === "launch" ? <LaunchCountdownPanel /> : null}
        {tab === "intake" ? <IntakeControlsPanel /> : null}
      </div>
    </>
  );
}

function HealthPanel() {
  const health = trpc.adminSecurity.health.useQuery();
  const storage = trpc.adminFiles.storageUsage.useQuery();

  if (health.isLoading) return <Skeleton className="h-64 w-full" />;

  const uptimeSeconds = health.data?.uptimeSeconds ?? 0;
  const days = Math.floor(uptimeSeconds / 86_400);
  const hours = Math.floor((uptimeSeconds % 86_400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Server className="size-4 text-teal" aria-hidden="true" />
              Runtime
            </span>
          }
        />
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Environment" value={<Badge tone="teal">{health.data?.environment}</Badge>} />
          <Row label="Node version" value={health.data?.nodeVersion ?? "—"} />
          <Row
            label="Uptime"
            value={`${days > 0 ? `${days}d ` : ""}${hours}h ${minutes}m`}
          />
          <Row label="Memory (RSS)" value={`${health.data?.memoryMb?.rss ?? 0} MB`} />
          <Row label="Heap used" value={`${health.data?.memoryMb?.heapUsed ?? 0} MB`} />
        </dl>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Database className="size-4 text-teal" aria-hidden="true" />
              Dependencies
            </span>
          }
        />
        <dl className="mt-4 space-y-3 text-sm">
          <Row
            label="Database"
            value={
              <Badge tone={health.data?.database ? "success" : "danger"}>
                {health.data?.database ? "connected" : "unreachable"}
              </Badge>
            }
          />
          <Row
            label="SMTP"
            value={
              <Badge tone={health.data?.smtpConfigured ? "success" : "warning"}>
                {health.data?.smtpConfigured ? "configured" : "not configured"}
              </Badge>
            }
          />
          <Row
            label="Payments"
            value={
              <Badge tone={health.data?.stripeConfigured ? "success" : "neutral"}>
                {health.data?.stripeConfigured ? "configured" : "manual invoicing"}
              </Badge>
            }
          />
          <Row label="Storage driver" value={health.data?.storageDriver ?? "—"} />
          <Row
            label="Email queue"
            value={`${health.data?.emailQueue?.pending ?? 0} pending, ${health.data?.emailQueue?.failed ?? 0} failed`}
          />
        </dl>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Users className="size-4 text-teal" aria-hidden="true" />
              Platform
            </span>
          }
        />
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Accounts" value={health.data?.users ?? 0} />
          <Row label="Active sessions" value={health.data?.activeSessions ?? 0} />
          <Row
            label="Open alerts"
            value={
              <Badge tone={(health.data?.openAlerts ?? 0) > 0 ? "warning" : "success"}>
                {health.data?.openAlerts ?? 0}
              </Badge>
            }
          />
        </dl>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Activity className="size-4 text-teal" aria-hidden="true" />
              Storage
            </span>
          }
        />
        {storage.isLoading ? (
          <Skeleton className="mt-4 h-24 w-full" />
        ) : (
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Files stored" value={storage.data?.fileCount ?? 0} />
            <Row label="Total size" value={formatBytes(storage.data?.totalBytes ?? 0)} />
            {(storage.data?.byCategory ?? []).map((entry) => (
              <Row
                key={entry.category}
                label={entry.category.replace(/_/g, " ")}
                value={formatBytes(entry.bytes)}
              />
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-body">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function SettingsPanel() {
  const toast = useToast();
  const settings = trpc.adminSecurity.settings.useQuery();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const update = trpc.adminSecurity.updateSetting.useMutation({
    async onSuccess() {
      await settings.refetch();
      toast.success("Setting saved");
    },
    onError(error) {
      toast.error("Could not save the setting", errorMessage(error));
    },
  });

  if (settings.isLoading) return <Skeleton className="h-64 w-full" />;

  const categories = new Map<string, NonNullable<typeof settings.data>>();
  for (const setting of settings.data ?? []) {
    const list = categories.get(setting.category) ?? [];
    list.push(setting);
    categories.set(setting.category, list);
  }

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Secrets are write-only">
        Settings marked as secret never leave the server. The panel reports only whether a value is
        present.
      </Alert>

      {[...categories.entries()].map(([category, items]) => (
        <Card key={category}>
          <CardHeader title={category.replace(/_/g, " ")} />
          <ul className="mt-4 space-y-5">
            {items.map((setting) => (
              <li key={setting.key} className="border-b border-line pb-5 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted">{setting.key}</p>
                    {setting.description ? (
                      <p className="mt-1 text-sm text-body">{setting.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{setting.valueType}</Badge>
                    {setting.isSecret ? (
                      <Badge tone={setting.hasValue ? "success" : "warning"}>
                        {setting.hasValue ? "set" : "empty"}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {setting.valueType === "boolean" ? (
                    <Select
                      label="Value"
                      className="sm:w-40"
                      value={drafts[setting.key] ?? setting.value ?? "false"}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                      }
                      options={[
                        { value: "true", label: "Enabled" },
                        { value: "false", label: "Disabled" },
                      ]}
                    />
                  ) : setting.valueType === "json" ? (
                    <Textarea
                      label="Value"
                      className="flex-1"
                      rows={3}
                      value={drafts[setting.key] ?? setting.value ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      label="Value"
                      className="flex-1"
                      type={setting.isSecret ? "password" : setting.valueType === "number" ? "number" : "text"}
                      placeholder={setting.isSecret ? "unchanged" : undefined}
                      value={drafts[setting.key] ?? (setting.isSecret ? "" : setting.value ?? "")}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                      }
                      autoComplete="off"
                    />
                  )}
                  <Button
                    size="sm"
                    busy={update.isPending}
                    onClick={() =>
                      update.mutate({
                        key: setting.key,
                        value: drafts[setting.key] ?? setting.value ?? null,
                      })
                    }
                    leadingIcon={<Save className="size-4" aria-hidden="true" />}
                  >
                    Save
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function FlagsPanel() {
  const toast = useToast();
  const flags = trpc.adminSecurity.featureFlags.useQuery();

  const setFlag = trpc.adminSecurity.setFeatureFlag.useMutation({
    async onSuccess() {
      await flags.refetch();
      toast.success("Feature flag updated");
    },
    onError(error) {
      toast.error("Could not update the flag", errorMessage(error));
    },
  });

  if (flags.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card padded={false}>
      <ul className="divide-y divide-line">
        {(flags.data ?? []).map((flag) => (
          <li key={flag.key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Flag className="size-4 text-teal" aria-hidden="true" />
                {flag.name}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted">{flag.key}</p>
              {flag.description ? (
                <p className="mt-1 text-sm text-body">{flag.description}</p>
              ) : null}
              {flag.scheduledEnableAt || flag.scheduledDisableAt ? (
                <p className="mt-1 text-xs text-muted">
                  {flag.scheduledEnableAt
                    ? `Scheduled to enable ${formatDateTime(flag.scheduledEnableAt)}. `
                    : ""}
                  {flag.scheduledDisableAt
                    ? `Scheduled to disable ${formatDateTime(flag.scheduledDisableAt)}.`
                    : ""}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant={flag.enabled ? "outline" : "primary"}
              busy={setFlag.isPending}
              onClick={() => setFlag.mutate({ key: flag.key, enabled: !flag.enabled })}
            >
              {flag.enabled ? "Disable" : "Enable"}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ApiKeysPanel() {
  const toast = useToast();
  const keys = trpc.adminSecurity.apiKeys.useQuery();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = trpc.adminSecurity.createApiKey.useMutation({
    async onSuccess(result) {
      setOpen(false);
      setName("");
      setScopes("");
      setExpiresInDays("");
      setIssued(result.apiKey);
      await keys.refetch();
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  const revoke = trpc.adminSecurity.revokeApiKey.useMutation({
    async onSuccess() {
      setRevokeId(null);
      await keys.refetch();
      toast.success("Key revoked");
    },
    onError(error) {
      toast.error("Could not revoke the key", errorMessage(error));
    },
  });

  return (
    <>
      <Alert tone="warning" className="mb-5" title="Treat keys as passwords">
        A key is displayed once at creation and stored only as a hash. If it is lost, revoke it and
        issue a new one rather than attempting recovery.
      </Alert>

      <div className="mb-5 flex justify-end">
        <Button
          onClick={() => {
            setFormError(null);
            setOpen(true);
          }}
          leadingIcon={<Plus className="size-4" aria-hidden="true" />}
        >
          New API key
        </Button>
      </div>

      {keys.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (keys.data ?? []).length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys"
          description="Issue a key only when an external system genuinely needs programmatic access."
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {(keys.data ?? []).map((key) => (
              <li key={key.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{key.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">{key.keyPrefix}…</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {key.lastUsedAt ? `Last used ${formatDateTime(key.lastUsedAt)}` : "Never used"}
                    {key.expiresAt ? ` · expires ${formatDateTime(key.expiresAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={key.revokedAt ? "neutral" : "success"}>
                    {key.revokedAt ? "revoked" : "active"}
                  </Badge>
                  {key.revokedAt ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRevokeId(key.id)}
                      leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create an API key"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={create.isPending}
              onClick={() =>
                create.mutate({
                  name: name.trim(),
                  scopes: scopes
                    .split(",")
                    .map((scope) => scope.trim())
                    .filter(Boolean),
                  expiresInDays: expiresInDays ? Number(expiresInDays) : null,
                })
              }
            >
              Create key
            </Button>
          </>
        }
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <div className="mt-4 space-y-4">
          <Input
            label="Name"
            help="Describe the system that will use the key."
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Input
            label="Scopes"
            help="Comma separated. Leave blank for read-only access."
            value={scopes}
            onChange={(event) => setScopes(event.target.value)}
          />
          <Input
            label="Expires in (days)"
            help="Leave blank for a non-expiring key, though a finite lifetime is safer."
            type="number"
            min={1}
            max={3_650}
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={issued !== null}
        onClose={() => setIssued(null)}
        title="Your new API key"
        description="Copy it now. It cannot be displayed again."
        footer={<Button onClick={() => setIssued(null)}>I have stored it safely</Button>}
      >
        <code className="mt-2 block break-all rounded border border-line bg-surface-soft px-3 py-2.5 font-mono text-sm text-ink">
          {issued}
        </code>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={() => {
            if (issued) void navigator.clipboard.writeText(issued);
            toast.success("Copied to clipboard");
          }}
        >
          Copy key
        </Button>
      </Modal>

      <ConfirmDialog
        open={revokeId !== null}
        onClose={() => setRevokeId(null)}
        onConfirm={() => {
          if (revokeId) revoke.mutate({ id: revokeId });
        }}
        title="Revoke this API key?"
        message="Any system using it will lose access immediately."
        confirmLabel="Revoke key"
        variant="danger"
        busy={revoke.isPending}
      />
    </>
  );
}

function SamlPanel() {
  const toast = useToast();
  const config = trpc.adminSecurity.samlConfig.useQuery();
  const [draft, setDraft] = useState<{
    name: string;
    enabled: boolean;
    entryPoint: string;
    issuer: string;
    idpCertificate: string;
    signatureAlgorithm: string;
    defaultRole: string;
    autoProvision: boolean;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const upsert = trpc.adminSecurity.upsertSamlConfig.useMutation({
    async onSuccess() {
      await config.refetch();
      setDraft(null);
      toast.success("SAML configuration saved");
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  if (config.isLoading) return <Skeleton className="h-64 w-full" />;

  const current = config.data;
  const form =
    draft ??
    {
      name: current?.name ?? "Corporate identity provider",
      enabled: current?.enabled ?? false,
      entryPoint: current?.entryPoint ?? "",
      issuer: current?.issuer ?? "",
      idpCertificate: "",
      signatureAlgorithm: current?.signatureAlgorithm ?? "sha256",
      defaultRole: current?.defaultRole ?? "customer",
      autoProvision: current?.autoProvision ?? false,
    };

  return (
    <Card>
      <CardHeader
        title="SAML 2.0 single sign-on"
        description="Optional. Lets enterprise clients authenticate through their own identity provider instead of a local password."
        actions={
          <Badge tone={current?.enabled ? "success" : "neutral"}>
            {current?.enabled ? "enabled" : "disabled"}
          </Badge>
        }
      />

      {formError ? <Alert tone="danger" className="mt-4">{formError}</Alert> : null}

      <div className="mt-5 space-y-4">
        <Input
          label="Display name"
          value={form.name}
          onChange={(event) => setDraft({ ...form, name: event.target.value })}
        />
        <Input
          label="Sign-in URL (entry point)"
          type="url"
          value={form.entryPoint}
          onChange={(event) => setDraft({ ...form, entryPoint: event.target.value })}
          placeholder="https://idp.example.com/sso/saml"
        />
        <Input
          label="Issuer (entity ID)"
          value={form.issuer}
          onChange={(event) => setDraft({ ...form, issuer: event.target.value })}
        />
        <Textarea
          label="Identity provider certificate"
          help="PEM-encoded X.509 certificate used to verify assertion signatures."
          rows={8}
          value={form.idpCertificate}
          onChange={(event) => setDraft({ ...form, idpCertificate: event.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Signature algorithm"
            value={form.signatureAlgorithm}
            onChange={(event) => setDraft({ ...form, signatureAlgorithm: event.target.value })}
            options={[
              { value: "sha256", label: "SHA-256" },
              { value: "sha512", label: "SHA-512" },
            ]}
          />
          <Select
            label="Default role for new users"
            value={form.defaultRole}
            onChange={(event) => setDraft({ ...form, defaultRole: event.target.value })}
            options={[
              { value: "customer", label: "Customer" },
              { value: "staff", label: "Staff" },
              { value: "admin", label: "Administrator" },
            ]}
          />
        </div>
        <Checkbox
          label="Create an account automatically on first successful assertion"
          checked={form.autoProvision}
          onChange={(event) => setDraft({ ...form, autoProvision: event.target.checked })}
        />
        <Checkbox
          label="Enable SAML sign-in"
          checked={form.enabled}
          onChange={(event) => setDraft({ ...form, enabled: event.target.checked })}
        />

        <Alert tone="info">
          New SAML accounts receive this role only when automatic provisioning is enabled. SAML is treated as the primary factor; Administrator accounts must still complete or enrol in MFA before receiving administrative access.
        </Alert>

        <Button
          busy={upsert.isPending}
          onClick={() => {
            setFormError(null);
            upsert.mutate({
              name: form.name.trim(),
              enabled: form.enabled,
              entryPoint: form.entryPoint.trim(),
              issuer: form.issuer.trim(),
              idpCertificate: form.idpCertificate.trim(),
              signatureAlgorithm: form.signatureAlgorithm as never,
              defaultRole: form.defaultRole as never,
              autoProvision: form.autoProvision,
            });
          }}
          leadingIcon={<Save className="size-4" aria-hidden="true" />}
        >
          Save configuration
        </Button>
      </div>
    </Card>
  );
}

function MaintenanceAccessPanel() {
  const toast = useToast();
  const config = trpc.adminSecurity.maintenanceConfig.useQuery();
  const [draft, setDraft] = useState<{ enabled: boolean; blocksLogin: boolean; blocksRegistration: boolean; showOnHomepage: boolean; message: string; estimatedCompletion: string } | null>(null);
  useEffect(() => { if (config.data) setDraft(config.data); }, [config.data]);
  const update = trpc.adminSecurity.updateMaintenanceConfig.useMutation({
    async onSuccess() { await config.refetch(); toast.success("Maintenance controls saved", "The selected public, login, and registration gates are now active."); },
    onError(error) { toast.error("Could not save maintenance controls", errorMessage(error)); },
  });
  if (config.isLoading || !draft) return <Skeleton className="mb-6 h-80 w-full" />;
  return <Card className="mb-6"><CardHeader title="Maintenance access controls" description="Use a planned maintenance window to gate the public website, sign-in, and new-account creation. Maintenance allowlist entries continue to bypass the login and registration gates." actions={<Badge tone={draft.enabled ? "warning" : "success"}>{draft.enabled ? "maintenance active" : "normal operation"}</Badge>} />
    <div className="mt-5 space-y-4"><Alert tone="warning" title="Use with care">When enabling a login gate, keep your administrator address in the maintenance allowlist before saving. Existing browser sessions are not forcibly revoked.</Alert><Textarea label="Maintenance message" rows={3} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /><Input label="Estimated completion (optional)" placeholder="Example: 2026-08-13 02:00 UTC" value={draft.estimatedCompletion} onChange={(event) => setDraft({ ...draft, estimatedCompletion: event.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Checkbox label="Enable maintenance mode" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><Checkbox label="Show the maintenance notice on the public website" checked={draft.showOnHomepage} onChange={(event) => setDraft({ ...draft, showOnHomepage: event.target.checked })} /><Checkbox label="Restrict new logins during maintenance" checked={draft.blocksLogin} onChange={(event) => setDraft({ ...draft, blocksLogin: event.target.checked })} /><Checkbox label="Restrict new account creation during maintenance" checked={draft.blocksRegistration} onChange={(event) => setDraft({ ...draft, blocksRegistration: event.target.checked })} /></div><div className="flex justify-end"><Button busy={update.isPending} onClick={() => update.mutate(draft)} leadingIcon={<Save className="size-4" aria-hidden="true" />}>Save maintenance controls</Button></div></div>
  </Card>;
}

function MaintenancePanel() {
  const toast = useToast();
  const backups = trpc.adminSecurity.backups.useQuery();
  const [retentionDays, setRetentionDays] = useState("365");
  const [pruneOpen, setPruneOpen] = useState(false);

  const retryEmails = trpc.adminSecurity.retryFailedEmails.useMutation({
    onSuccess(result) {
      toast.success(
        "Failed messages requeued",
        `${result.requeued} message${result.requeued === 1 ? "" : "s"} will be retried.`,
      );
    },
    onError(error) {
      toast.error("Could not requeue messages", errorMessage(error));
    },
  });

  const pruneLogs = trpc.adminSecurity.pruneLogs.useMutation({
    onSuccess(result) {
      setPruneOpen(false);
      toast.success("Logs pruned", `${result.securityLogs + result.activityLogs + result.emailLog} record(s) removed.`);
    },
    onError(error) {
      toast.error("Could not prune logs", errorMessage(error));
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader
          title="Email queue"
          description="Requeue messages that failed delivery, for example after an SMTP outage."
        />
        <Button
          className="mt-4"
          variant="outline"
          busy={retryEmails.isPending}
          onClick={() => retryEmails.mutate()}
          leadingIcon={<RefreshCw className="size-4" aria-hidden="true" />}
        >
          Retry failed messages
        </Button>
      </Card>

      <Card>
        <CardHeader
          title="Log retention"
          description="Remove log records older than the retention window. Security logs are the last line of evidence, so prune conservatively."
        />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Input
            label="Retention (days)"
            type="number"
            min={7}
            max={3_650}
            className="sm:w-40"
            value={retentionDays}
            onChange={(event) => setRetentionDays(event.target.value)}
          />
          <Button variant="outline" onClick={() => setPruneOpen(true)}>
            Prune logs
          </Button>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title="Backup history"
          description="Recorded by the backup script shipped with the deployment tooling."
        />
        {backups.isLoading ? (
          <Skeleton className="mt-4 h-32 w-full" />
        ) : (backups.data ?? []).length === 0 ? (
          <Alert tone="info" className="mt-4">
            No backup runs have been recorded yet. Schedule <code>scripts/ops/backup.sh</code> from
            cron and it will register each run here.
          </Alert>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {(backups.data ?? []).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Badge
                      tone={
                        entry.status === "success"
                          ? "success"
                          : entry.status === "failed"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {entry.status}
                    </Badge>
                    {entry.backupType}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {entry.location ?? "location not recorded"}
                  </p>
                </div>
                <div className="text-right text-xs text-muted">
                  <p>{formatDateTime(entry.startedAt)}</p>
                  {entry.sizeBytes ? <p>{formatBytes(Number(entry.sizeBytes))}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={pruneOpen}
        onClose={() => setPruneOpen(false)}
        onConfirm={() => pruneLogs.mutate({ retentionDays: Number(retentionDays) })}
        title="Prune log records?"
        message={`Records older than ${retentionDays} days will be deleted permanently. This cannot be undone, and it may reduce your ability to investigate historical incidents.`}
        confirmLabel="Prune logs"
        variant="danger"
        busy={pruneLogs.isPending}
      />
    </div>
  );
}

function LaunchCountdownPanel() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const flags = trpc.adminSecurity.featureFlags.useQuery();
  const countdownEnabled = (flags.data ?? []).find((f) => f.key === "launch_countdown")?.enabled ?? false;

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [loaded, setLoaded] = useState(false);

  const settings = trpc.adminSecurity.getSettings.useQuery({ category: "launch" });

  // Populate form fields once settings load.
  useEffect(() => {
    if (!loaded && settings.data) {
      setTitle(settings.data.find((s) => s.key === "launch.countdown_title")?.value ?? "Coming Soon");
      setMessage(settings.data.find((s) => s.key === "launch.countdown_message")?.value ?? "");
      setTargetDate(settings.data.find((s) => s.key === "launch.countdown_target")?.value ?? "");
      setLoaded(true);
    }
  }, [loaded, settings.data]);

  const updateSetting = trpc.adminSecurity.updateSetting.useMutation();

  const setFlag = trpc.adminSecurity.setFeatureFlag.useMutation({
    async onSuccess() {
      await flags.refetch();
      toast.success("Countdown updated");
    },
  });

  const handleSave = async () => {
    await Promise.all([
      updateSetting.mutateAsync({ key: "launch.countdown_title", value: title }),
      updateSetting.mutateAsync({ key: "launch.countdown_message", value: message }),
      updateSetting.mutateAsync({ key: "launch.countdown_target", value: targetDate }),
    ]);
    toast.success("Launch countdown settings saved");
  };

  // Live countdown display
  const [now, setNow] = useState(Date.now());
  const target = targetDate ? new Date(targetDate).getTime() : null;
  const diff = target ? Math.max(0, target - now) : null;
  const days = diff !== null ? Math.floor(diff / 86400000) : null;
  const hours = diff !== null ? Math.floor((diff % 86400000) / 3600000) : null;
  const minutes = diff !== null ? Math.floor((diff % 3600000) / 60000) : null;
  const seconds = diff !== null ? Math.floor((diff % 60000) / 1000) : null;

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Launch countdown">
        When enabled, a countdown banner is shown on the public homepage and login page.
        Admins and staff can always bypass it. Configure the target date, title, and message below.
      </Alert>

      <Card>
        <CardHeader
          title="Countdown status"
          actions={
            <Button
              size="sm"
              variant={countdownEnabled ? "outline" : "primary"}
              busy={setFlag.isPending}
              onClick={() => setFlag.mutate({ key: "launch_countdown", enabled: !countdownEnabled })}
            >
              {countdownEnabled ? "Disable countdown" : "Enable countdown"}
            </Button>
          }
        />
        {countdownEnabled && target && diff !== null && diff > 0 ? (
          <div className="mt-4 flex gap-4 text-center">
            {[
              { label: "Days", value: days },
              { label: "Hours", value: hours },
              { label: "Minutes", value: minutes },
              { label: "Seconds", value: seconds },
            ].map(({ label, value }) => (
              <div key={label} className="flex-1 rounded-lg bg-surface-raised p-3">
                <p className="text-2xl font-bold tabular-nums text-ink">{String(value).padStart(2, "0")}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
        ) : countdownEnabled && diff === 0 ? (
          <p className="mt-4 text-sm text-success font-medium">🎉 Launch date has passed!</p>
        ) : (
          <p className="mt-4 text-sm text-muted">Countdown is currently disabled.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Countdown settings" />
        <div className="mt-4 space-y-4">
          <Input
            label="Launch date & time"
            type="datetime-local"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            help="The countdown will reach zero at this date and time (your local timezone)."
          />
          <Input
            label="Countdown title"
            placeholder="Coming Soon"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label="Message"
            rows={3}
            placeholder="We are launching soon. Stay tuned!"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              busy={updateSetting.isPending}
              leadingIcon={<Save className="size-4" />}
              onClick={handleSave}
            >
              Save countdown settings
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function IntakeControlsPanel() {
  const toast = useToast();
  const settings = trpc.adminSecurity.getSettings.useQuery({ category: "intake" });
  const [maxDocuments, setMaxDocuments] = useState("5");
  const [allowedTypes, setAllowedTypes] = useState(".pdf,.doc,.docx,.txt");
  const [maxPitchRecordings, setMaxPitchRecordings] = useState("1");
  const [maxPitchLengthSeconds, setMaxPitchLengthSeconds] = useState("300");
  const [microphonePreflightEnabled, setMicrophonePreflightEnabled] = useState(true);

  useEffect(() => {
    if (!settings.data) return;
    const values = new Map(settings.data.map((entry) => [entry.key, entry.value]));
    setMaxDocuments(values.get("intake.max_documents") || "5");
    setAllowedTypes(values.get("intake.allowed_document_types") || ".pdf,.doc,.docx,.txt");
    setMaxPitchRecordings(values.get("intake.max_pitch_recordings") || "1");
    setMaxPitchLengthSeconds(values.get("intake.max_pitch_length_seconds") || "300");
    setMicrophonePreflightEnabled(values.get("intake.microphone_preflight_enabled") !== "false");
  }, [settings.data]);

  const update = trpc.adminSecurity.updateSetting.useMutation();
  const save = async () => {
    const docCount = Number(maxDocuments);
    const pitchCount = Number(maxPitchRecordings);
    const pitchSeconds = Number(maxPitchLengthSeconds);
    if (!Number.isInteger(docCount) || docCount < 0 || docCount > 25) {
      toast.error("Invalid document limit", "Enter a whole number from 0 to 25.");
      return;
    }
    if (!Number.isInteger(pitchCount) || pitchCount < 0 || pitchCount > 10) {
      toast.error("Invalid recording limit", "Enter a whole number from 0 to 10.");
      return;
    }
    if (!Number.isInteger(pitchSeconds) || pitchSeconds < 15 || pitchSeconds > 3600) {
      toast.error("Invalid pitch length", "Enter a duration from 15 to 3,600 seconds.");
      return;
    }
    try {
      await Promise.all([
        update.mutateAsync({ key: "intake.max_documents", value: String(docCount) }),
        update.mutateAsync({ key: "intake.allowed_document_types", value: allowedTypes.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).join(",") }),
        update.mutateAsync({ key: "intake.max_pitch_recordings", value: String(pitchCount) }),
        update.mutateAsync({ key: "intake.max_pitch_length_seconds", value: String(pitchSeconds) }),
        update.mutateAsync({ key: "intake.microphone_preflight_enabled", value: String(microphonePreflightEnabled) }),
      ]);
      await settings.refetch();
      toast.success("Intake controls saved", "The new limits apply to future intake uploads and submissions.");
    } catch (error) {
      toast.error("Could not save intake controls", errorMessage(error));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader
          title="Supporting documents"
          description="Limit the supporting documents each customer may attach to an order intake."
        />
        <div className="mt-4 space-y-4">
          <Input
            label="Maximum documents per intake"
            type="number"
            min={0}
            max={25}
            value={maxDocuments}
            onChange={(event) => setMaxDocuments(event.target.value)}
          />
          <Input
            label="Allowed file extensions"
            value={allowedTypes}
            onChange={(event) => setAllowedTypes(event.target.value)}
            help="Comma-separated. Files are also checked against the platform's server-side content validation."
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Business pitch recordings"
          description="Control browser-recorded or uploaded audio pitch submissions for each intake."
        />
        <div className="mt-4 space-y-4">
          <Input
            label="Maximum pitch recordings per intake"
            type="number"
            min={0}
            max={10}
            value={maxPitchRecordings}
            onChange={(event) => setMaxPitchRecordings(event.target.value)}
          />
          <Input
            label="Maximum recording length (seconds)"
            type="number"
            min={15}
            max={3600}
            value={maxPitchLengthSeconds}
            onChange={(event) => setMaxPitchLengthSeconds(event.target.value)}
            help="The browser stops in-app recordings at this duration."
          />
          <Checkbox
            label="Run microphone preflight before Business Pitch recording"
            checked={microphonePreflightEnabled}
            onChange={(event) => setMicrophonePreflightEnabled(event.target.checked)}
            help="When enabled, customers verify browser support, microphone permission, a live input track, and WebM recording support before they begin a pitch."
          />
        </div>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button busy={update.isPending} onClick={() => void save()} leadingIcon={<Save className="size-4" />}>Save intake controls</Button>
      </div>
    </div>
  );
}
