import { useEffect, useState } from "react";
import { trpc } from "../../lib/trpc";
import { Card } from "../../components/ui/Surface";
import { Button } from "../../components/ui/Button";
import { FieldShell, Input, Select } from "../../components/ui/Field";
import { Alert } from "../../components/ui/Surface";
import { useToast } from "../../components/ui/Toast";

type Transport = "none" | "smtp" | "graph";

interface SmtpForm {
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
  replyTo: string;
  secure: string;
}

interface GraphForm {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  emailSender: string;
}

export default function EmailSettings() {
  const toast = useToast();
  const utils = trpc.useUtils();

  // Use the dedicated getEmailConfig endpoint which reads from DB settings.
  const emailConfig = trpc.adminSecurity.getEmailConfig.useQuery();
  const updateSetting = trpc.adminSecurity.updateSetting.useMutation();
  const sendTest = trpc.adminSecurity.sendTestEmail.useMutation();
  const validateGraph = trpc.adminSecurity.validateGraphEmail.useMutation();

  const currentTransport: Transport = (emailConfig.data?.transport as Transport) ?? "none";

  const [activeTab, setActiveTab] = useState<"smtp" | "graph" | "test">("smtp");
  const [testEmail, setTestEmail] = useState("");
  const [smtpForm, setSmtpForm] = useState<SmtpForm>({
    host: "",
    port: "587",
    user: "",
    pass: "",
    from: "no-reply@readypackets.com",
    replyTo: "",
    secure: "false",
  });
  const [graphForm, setGraphForm] = useState<GraphForm>({
    tenantId: "",
    clientId: "",
    clientSecret: "",
    emailSender: "",
  });
  const [saving, setSaving] = useState(false);

  // Pre-populate form fields from DB config when data loads.
  useEffect(() => {
    if (!emailConfig.data) return;
    const d = emailConfig.data;
    setGraphForm((f) => ({
      ...f,
      tenantId: d.graphTenantId || f.tenantId,
      clientId: d.graphClientId || f.clientId,
      emailSender: d.graphEmailSender || f.emailSender,
    }));
  }, [emailConfig.data]);

  async function saveSmtp() {
    setSaving(true);
    try {
      const settings = [
        { key: "email.smtp_host", value: smtpForm.host },
        { key: "email.smtp_port", value: smtpForm.port },
        { key: "email.smtp_user", value: smtpForm.user },
        { key: "email.smtp_from", value: smtpForm.from },
        { key: "email.smtp_reply_to", value: smtpForm.replyTo },
        { key: "email.smtp_secure", value: smtpForm.secure },
      ];
      if (smtpForm.pass) settings.push({ key: "email.smtp_pass", value: smtpForm.pass });
      for (const s of settings) {
        await updateSetting.mutateAsync({ key: s.key, value: s.value });
      }
      await utils.adminSecurity.getEmailConfig.invalidate();
      toast.success("SMTP settings saved", "Email will be sent via SMTP on the next delivery cycle.");
    } catch {
      toast.error("Failed to save SMTP settings");
    } finally {
      setSaving(false);
    }
  }

  async function saveGraph() {
    setSaving(true);
    try {
      const settings = [
        { key: "email.graph_tenant_id", value: graphForm.tenantId },
        { key: "email.graph_client_id", value: graphForm.clientId },
        { key: "email.graph_email_sender", value: graphForm.emailSender },
      ];
      if (graphForm.clientSecret)
        settings.push({ key: "email.graph_client_secret", value: graphForm.clientSecret });
      for (const s of settings) {
        await updateSetting.mutateAsync({ key: s.key, value: s.value });
      }
      await utils.adminSecurity.getEmailConfig.invalidate();
      toast.success("Microsoft Graph settings saved", "Email will now be sent via Microsoft Graph API.");
    } catch {
      toast.error("Failed to save Graph settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleValidateGraph() {
    try {
      const result = await validateGraph.mutateAsync();
      const expires = result.expiresAt ? new Date(result.expiresAt).toLocaleString() : "the configured expiry";
      toast.success("Microsoft Graph validated", `Access token acquired for ${result.sender}. Token expires ${expires}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Microsoft Graph validation failed.";
      toast.error("Microsoft Graph validation failed", msg);
    }
  }

  async function handleSendTest() {
    if (!testEmail) return;
    try {
      await sendTest.mutateAsync({ to: testEmail });
      toast.success(`Test email sent to ${testEmail}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send test email.";
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure SMTP or Microsoft Graph API for outbound email delivery.
        </p>
      </div>

      {/* Current transport status */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Active transport</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {currentTransport === "graph"
                ? "Microsoft Graph API — primary transport"
                : currentTransport === "smtp"
                ? "SMTP — primary transport"
                : "No transport configured — emails are queued but not sent"}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              currentTransport !== "none"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
            }`}
          >
            {currentTransport === "graph"
              ? "Configured — Graph"
              : currentTransport === "smtp"
              ? "Configured — SMTP"
              : "Not configured"}
          </span>
        </div>
      </Card>

      <Alert tone="info">
        Settings saved here are stored in the database and take effect immediately — no service
        restart required. For production deployments, you can also set environment variables
        directly in <code>/etc/readypackets/portal.env</code>.
      </Alert>

      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          {(["smtp", "graph", "test"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-teal-500 text-teal-600 dark:text-teal-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {tab === "smtp" ? "SMTP" : tab === "graph" ? "Microsoft Graph" : "Send Test"}
            </button>
          ))}
        </nav>
      </div>

      {/* SMTP tab */}
      {activeTab === "smtp" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">SMTP Configuration</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Works with any SMTP provider: Gmail, Outlook, SendGrid, Postmark, Mailgun, etc.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldShell label="SMTP Host" required>
              <Input
                value={smtpForm.host}
                onChange={(e) => setSmtpForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="smtp.example.com"
              />
            </FieldShell>
            <FieldShell label="Port">
              <Input
                value={smtpForm.port}
                onChange={(e) => setSmtpForm((f) => ({ ...f, port: e.target.value }))}
                placeholder="587"
                type="number"
              />
            </FieldShell>
            <FieldShell label="Username">
              <Input
                value={smtpForm.user}
                onChange={(e) => setSmtpForm((f) => ({ ...f, user: e.target.value }))}
                placeholder="user@example.com"
                autoComplete="off"
              />
            </FieldShell>
            <FieldShell label="Password">
              <Input
                value={smtpForm.pass}
                onChange={(e) => setSmtpForm((f) => ({ ...f, pass: e.target.value }))}
                type="password"
                placeholder="Leave blank to keep existing"
                autoComplete="new-password"
              />
            </FieldShell>
            <FieldShell label="From Address" required>
              <Input
                value={smtpForm.from}
                onChange={(e) => setSmtpForm((f) => ({ ...f, from: e.target.value }))}
                placeholder="no-reply@readypackets.com"
              />
            </FieldShell>
            <FieldShell label="Reply-To Address">
              <Input
                value={smtpForm.replyTo}
                onChange={(e) => setSmtpForm((f) => ({ ...f, replyTo: e.target.value }))}
                placeholder="support@readypackets.com"
              />
            </FieldShell>
            <FieldShell label="Use TLS">
              <Select
                value={smtpForm.secure}
                onChange={(e) => setSmtpForm((f) => ({ ...f, secure: e.target.value }))}
              >
                <option value="false">STARTTLS (port 587)</option>
                <option value="true">SSL/TLS (port 465)</option>
              </Select>
            </FieldShell>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={saveSmtp} busy={saving} variant="primary">
              Save SMTP settings
            </Button>
          </div>
        </Card>
      )}

      {/* Microsoft Graph tab */}
      {activeTab === "graph" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Microsoft Graph API</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Send email via Microsoft 365 / Exchange Online. Requires an Azure app registration with{" "}
            <strong>Mail.Send</strong> application permission. When configured, Graph is used as the
            primary transport with SMTP as fallback.
          </p>
          <Alert tone="info">
            <strong>Required Azure app permissions:</strong> Mail.Send (Application, not Delegated).
            Grant admin consent after adding the permission.
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldShell label="Tenant ID" required>
              <Input
                value={graphForm.tenantId}
                onChange={(e) => setGraphForm((f) => ({ ...f, tenantId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
              />
            </FieldShell>
            <FieldShell label="Client ID" required>
              <Input
                value={graphForm.clientId}
                onChange={(e) => setGraphForm((f) => ({ ...f, clientId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
              />
            </FieldShell>
            <FieldShell label="Client Secret">
              <Input
                value={graphForm.clientSecret}
                onChange={(e) => setGraphForm((f) => ({ ...f, clientSecret: e.target.value }))}
                type="password"
                placeholder="Leave blank to keep existing"
                autoComplete="new-password"
              />
            </FieldShell>
            <FieldShell label="Sender Mailbox" required>
              <Input
                value={graphForm.emailSender}
                onChange={(e) => setGraphForm((f) => ({ ...f, emailSender: e.target.value }))}
                placeholder="noreply@yourdomain.com"
              />
            </FieldShell>
          </div>
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button onClick={handleValidateGraph} busy={validateGraph.isPending} variant="secondary">
              Validate Graph API
            </Button>
            <Button onClick={saveGraph} busy={saving} variant="primary">
              Save Graph settings
            </Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Validation requests a Microsoft Graph access token without sending an email. Use <strong>Send Test</strong> to confirm mailbox delivery.</p>
        </Card>
      )}

      {/* Send test tab */}
      {activeTab === "test" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Send Test Email</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Send a test message to verify your email configuration is working.
          </p>
          {currentTransport === "none" && (
            <Alert tone="warning">
              No email transport is configured. Configure SMTP or Microsoft Graph first.
            </Alert>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <FieldShell label="Recipient email">
                <Input
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                />
              </FieldShell>
            </div>
            <Button
              onClick={handleSendTest}
              busy={sendTest.isPending}
              disabled={!testEmail || currentTransport === "none"}
              variant="primary"
            >
              Send test
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
