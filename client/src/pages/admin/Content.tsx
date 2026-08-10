/**
 * Content management: homepage blocks, the changelog, legal policy versions,
 * email templates, and the registration form fields.
 *
 * Policy documents are versioned rather than edited in place. Publishing a new
 * version leaves the previous text intact, which is what makes it possible to
 * prove which wording a given customer accepted on a given date.
 */
import { useState } from "react";
import {
  FileText,
  LayoutTemplate,
  Mail,
  Plus,
  Save,
  ScrollText,
  Send,
  Sparkles,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate, formatDateTime } from "@/lib/utils";
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
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

export function AdminContentPage() {
  const [tab, setTab] = useState("home");

  return (
    <>
      <PageHeader
        title="Content"
        description="Homepage copy, release notes, legal policies, transactional email, and the registration form."
      />

      <TabStrip
        tabs={[
          { id: "home", label: "Homepage" },
          { id: "changelog", label: "Changelog" },
          { id: "policies", label: "Policies" },
          { id: "email", label: "Email templates" },
          { id: "registration", label: "Registration form" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-6">
        {tab === "home" ? <HomeBlocks /> : null}
        {tab === "changelog" ? <ChangelogPanel /> : null}
        {tab === "policies" ? <PoliciesPanel /> : null}
        {tab === "email" ? <EmailTemplatesPanel /> : null}
        {tab === "registration" ? <RegistrationFieldsPanel /> : null}
      </div>
    </>
  );
}

function HomeBlocks() {
  const toast = useToast();
  const blocks = trpc.admin.homeContent.useQuery();
  const [drafts, setDrafts] = useState<Record<string, Record<string, string | boolean>>>({});

  const update = trpc.admin.updateHomeBlock.useMutation({
    async onSuccess() {
      await blocks.refetch();
      toast.success("Block saved");
    },
    onError(error) {
      toast.error("Could not save the block", errorMessage(error));
    },
  });

  if (blocks.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-5">
      <Alert tone="info" title="How this works">
        Each block corresponds to a section of the public homepage. Disabling a block hides that
        section entirely rather than leaving an empty space.
      </Alert>

      {(blocks.data ?? []).map((block) => {
        const draft = drafts[block.blockKey] ?? {};
        const value = (key: string, fallback: string | null) =>
          (draft[key] as string | undefined) ?? fallback ?? "";
        const setValue = (key: string, next: string | boolean) =>
          setDrafts((current) => ({
            ...current,
            [block.blockKey]: { ...current[block.blockKey], [key]: next },
          }));

        return (
          <Card key={block.blockKey}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <LayoutTemplate className="size-4 text-teal" aria-hidden="true" />
                  {block.blockKey}
                </span>
              }
              actions={
                <Badge tone={block.enabled ? "success" : "neutral"}>
                  {block.enabled ? "enabled" : "hidden"}
                </Badge>
              }
            />

            <div className="mt-4 space-y-4">
              <Input
                label="Heading"
                value={value("heading", block.heading)}
                onChange={(event) => setValue("heading", event.target.value)}
                maxLength={190}
              />
              <Input
                label="Subheading"
                value={value("subheading", block.subheading)}
                onChange={(event) => setValue("subheading", event.target.value)}
                maxLength={255}
              />
              <Textarea
                label="Body"
                rows={3}
                maxLength={8000}
                value={value("body", block.body)}
                onChange={(event) => setValue("body", event.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Link label"
                  value={value("linkLabel", block.linkLabel)}
                  onChange={(event) => setValue("linkLabel", event.target.value)}
                  maxLength={96}
                />
                <Input
                  label="Link target"
                  value={value("linkHref", block.linkHref)}
                  onChange={(event) => setValue("linkHref", event.target.value)}
                  maxLength={255}
                />
              </div>
              <Checkbox
                label="Show this section on the homepage"
                checked={(draft.enabled as boolean | undefined) ?? block.enabled}
                onChange={(event) => setValue("enabled", event.target.checked)}
              />
              <Button
                busy={update.isPending}
                onClick={() =>
                  update.mutate({
                    blockKey: block.blockKey,
                    heading: value("heading", block.heading) || null,
                    subheading: value("subheading", block.subheading) || null,
                    body: value("body", block.body) || null,
                    linkLabel: value("linkLabel", block.linkLabel) || null,
                    linkHref: value("linkHref", block.linkHref) || null,
                    enabled: (draft.enabled as boolean | undefined) ?? block.enabled,
                  })
                }
                leadingIcon={<Save className="size-4" aria-hidden="true" />}
              >
                Save block
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ChangelogPanel() {
  const toast = useToast();
  const changelog = trpc.admin.changelog.useQuery();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [entryType, setEntryType] = useState("improvement");
  const [isPublic, setIsPublic] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const create = trpc.admin.createChangelogEntry.useMutation({
    async onSuccess() {
      setOpen(false);
      setVersion("");
      setTitle("");
      setBody("");
      await changelog.refetch();
      toast.success("Entry published");
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button
          onClick={() => setOpen(true)}
          leadingIcon={<Plus className="size-4" aria-hidden="true" />}
        >
          New entry
        </Button>
      </div>

      {changelog.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (changelog.data ?? []).length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No changelog entries"
          description="Publish an entry when you ship something customers should know about."
        />
      ) : (
        <div className="space-y-4">
          {(changelog.data ?? []).map((entry) => (
            <Card key={entry.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="teal">v{entry.version}</Badge>
                  <Badge
                    tone={
                      entry.entryType === "security"
                        ? "danger"
                        : entry.entryType === "feature"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {entry.entryType}
                  </Badge>
                  {entry.isPublic ? null : <Badge tone="warning">internal</Badge>}
                </div>
                <span className="text-xs text-muted">{formatDate(entry.releasedAt)}</span>
              </div>
              <h3 className="mt-2 font-semibold text-ink">{entry.title}</h3>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-body">
                {entry.bodyMarkdown}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New changelog entry"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={create.isPending}
              onClick={() => {
                setFormError(null);
                create.mutate({
                  version: version.trim(),
                  title: title.trim(),
                  bodyMarkdown: body.trim(),
                  entryType: entryType as never,
                  isPublic,
                });
              }}
            >
              Publish entry
            </Button>
          </>
        }
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Version"
              placeholder="1.4.0"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              required
            />
            <Select
              label="Type"
              value={entryType}
              onChange={(event) => setEntryType(event.target.value)}
              options={[
                { value: "feature", label: "Feature" },
                { value: "improvement", label: "Improvement" },
                { value: "fix", label: "Fix" },
                { value: "security", label: "Security" },
              ]}
            />
          </div>
          <Input
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={190}
          />
          <Textarea
            label="Body"
            help="Markdown is supported."
            rows={8}
            maxLength={20_000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <Checkbox
            label="Visible on the public changelog"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
          />
        </div>
      </Modal>
    </>
  );
}

function PoliciesPanel() {
  const toast = useToast();
  const policies = trpc.admin.policies.useQuery();
  const [editing, setEditing] = useState<{
    policyId: number;
    name: string;
    version: string;
    effectiveDate: string;
    bodyMarkdown: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const publish = trpc.admin.publishPolicyVersion.useMutation({
    async onSuccess() {
      setEditing(null);
      await policies.refetch();
      toast.success(
        "Policy version published",
        "Customers will be asked to accept the new version at their next sign-in.",
      );
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  if (policies.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <Alert tone="warning" className="mb-5" title="Versioning is immutable">
        Publishing a new version does not overwrite the previous text. Existing acceptance records
        continue to point at the exact wording each customer agreed to.
      </Alert>

      <div className="space-y-5">
        {(policies.data ?? []).map((policy) => {
          const current = policy.versions[0];
          return (
            <Card key={policy.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <ScrollText className="size-4 text-teal" aria-hidden="true" />
                    {policy.title}
                  </span>
                }
                description={`/${policy.slug} · ${policy.versions.length} version${policy.versions.length === 1 ? "" : "s"} on record`}
                actions={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFormError(null);
                      setEditing({
                        policyId: policy.id,
                        name: policy.title,
                        version: "",
                        effectiveDate: new Date().toISOString().slice(0, 10),
                        bodyMarkdown: current?.bodyMarkdown ?? "",
                      });
                    }}
                  >
                    Publish new version
                  </Button>
                }
              />

              {policy.versions.length === 0 ? (
                <p className="mt-4 text-sm text-body">No version has been published yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {policy.versions.map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Badge tone={version.published ? "success" : "neutral"}>
                          v{version.version}
                        </Badge>
                        <span className="text-body">Effective {version.effectiveDate}</span>
                      </span>
                      <span className="text-xs text-muted">
                        {formatDateTime(version.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Publish a new ${editing.name}` : ""}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              busy={publish.isPending}
              onClick={() => {
                if (!editing) return;
                setFormError(null);
                publish.mutate({
                  policyId: editing.policyId,
                  version: editing.version.trim(),
                  effectiveDate: editing.effectiveDate,
                  bodyMarkdown: editing.bodyMarkdown,
                });
              }}
            >
              Publish version
            </Button>
          </>
        }
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {editing ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Version"
                placeholder="2.1"
                value={editing.version}
                onChange={(event) => setEditing({ ...editing, version: event.target.value })}
                required
              />
              <Input
                label="Effective date"
                type="date"
                value={editing.effectiveDate}
                onChange={(event) => setEditing({ ...editing, effectiveDate: event.target.value })}
                required
              />
            </div>
            <Textarea
              label="Policy text"
              help="Markdown. The published text is rendered through a restricted renderer, so raw HTML is not honoured."
              rows={20}
              maxLength={200_000}
              value={editing.bodyMarkdown}
              onChange={(event) => setEditing({ ...editing, bodyMarkdown: event.target.value })}
              required
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function EmailTemplatesPanel() {
  const toast = useToast();
  const templates = trpc.admin.emailTemplates.useQuery();
  const [editing, setEditing] = useState<{
    templateKey: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    enabled: boolean;
  } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const update = trpc.admin.updateEmailTemplate.useMutation({
    async onSuccess() {
      setEditing(null);
      await templates.refetch();
      toast.success("Template saved");
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  const sendTest = trpc.adminSecurity.sendTestEmail.useMutation({
    onSuccess() {
      toast.success("Test message queued");
    },
    onError(error) {
      toast.error("Could not send the test", errorMessage(error));
    },
  });

  if (templates.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <Card className="mb-5">
        <CardHeader
          title="Send a test message"
          description="Verifies that SMTP delivery works from this server."
        />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Input
            label="Recipient"
            type="email"
            className="sm:w-80"
            value={testTo}
            onChange={(event) => setTestTo(event.target.value)}
          />
          <Button
            busy={sendTest.isPending}
            disabled={!testTo.includes("@")}
            onClick={() => sendTest.mutate({ to: testTo.trim() })}
            leadingIcon={<Send className="size-4" aria-hidden="true" />}
          >
            Send test
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        {(templates.data ?? []).map((template) => (
          <Card key={template.templateKey}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-mono text-xs text-muted">
                  <Mail className="size-4 text-teal" aria-hidden="true" />
                  {template.templateKey}
                </p>
                <p className="mt-1.5 font-medium text-ink">{template.subject}</p>
                <p className="mt-1 text-xs text-muted">
                  {template.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={template.enabled ? "success" : "neutral"}>
                  {template.enabled ? "enabled" : "disabled"}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFormError(null);
                    setEditing({
                      templateKey: template.templateKey,
                      subject: template.subject,
                      bodyHtml: template.bodyHtml,
                      bodyText: template.bodyText ?? "",
                      enabled: template.enabled,
                    });
                  }}
                >
                  Edit
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.templateKey}` : ""}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              busy={update.isPending}
              onClick={() => {
                if (!editing) return;
                setFormError(null);
                update.mutate({
                  templateKey: editing.templateKey,
                  subject: editing.subject.trim(),
                  bodyHtml: editing.bodyHtml,
                  bodyText: editing.bodyText || null,
                  enabled: editing.enabled,
                });
              }}
            >
              Save template
            </Button>
          </>
        }
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {editing ? (
          <div className="mt-4 space-y-4">
            <Input
              label="Subject"
              value={editing.subject}
              onChange={(event) => setEditing({ ...editing, subject: event.target.value })}
              required
            />
            <Textarea
              label="HTML body"
              help="Placeholders use {{variable}} syntax and are escaped before substitution."
              rows={12}
              maxLength={100_000}
              value={editing.bodyHtml}
              onChange={(event) => setEditing({ ...editing, bodyHtml: event.target.value })}
              required
            />
            <Textarea
              label="Plain-text body"
              help="Optional but recommended; improves deliverability."
              rows={6}
              maxLength={50_000}
              value={editing.bodyText}
              onChange={(event) => setEditing({ ...editing, bodyText: event.target.value })}
            />
            <Checkbox
              label="This template is enabled"
              checked={editing.enabled}
              onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })}
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function RegistrationFieldsPanel() {
  const toast = useToast();
  const fields = trpc.admin.registrationFields.useQuery();
  const [editing, setEditing] = useState<{
    id?: number;
    fieldKey: string;
    label: string;
    helpText: string;
    fieldType: string;
    options: string;
    required: boolean;
    enabled: boolean;
    sortOrder: number;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const upsert = trpc.admin.upsertRegistrationField.useMutation({
    async onSuccess() {
      setEditing(null);
      await fields.refetch();
      toast.success("Field saved");
    },
    onError(error) {
      setFormError(errorMessage(error));
    },
  });

  if (fields.isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button
          onClick={() => {
            setFormError(null);
            setEditing({
              fieldKey: "",
              label: "",
              helpText: "",
              fieldType: "text",
              options: "",
              required: false,
              enabled: true,
              sortOrder: (fields.data ?? []).length,
            });
          }}
          leadingIcon={<Plus className="size-4" aria-hidden="true" />}
        >
          New field
        </Button>
      </div>

      {(fields.data ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No additional fields"
          description="Registration collects only the built-in identity fields."
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {(fields.data ?? []).map((field) => (
              <li key={field.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{field.label}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {field.fieldKey} · {field.fieldType}
                  </p>
                  {field.helpText ? (
                    <p className="mt-0.5 text-xs text-muted">{field.helpText}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {field.required ? <Badge tone="warning">required</Badge> : null}
                  <Badge tone={field.enabled ? "success" : "neutral"}>
                    {field.enabled ? "enabled" : "hidden"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFormError(null);
                      setEditing({
                        id: field.id,
                        fieldKey: field.fieldKey,
                        label: field.label,
                        helpText: field.helpText ?? "",
                        fieldType: field.fieldType,
                        options: ((field.options as string[] | null) ?? []).join("\n"),
                        required: field.required,
                        enabled: field.enabled,
                        sortOrder: field.sortOrder,
                      });
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit registration field" : "New registration field"}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              busy={upsert.isPending}
              onClick={() => {
                if (!editing) return;
                setFormError(null);
                upsert.mutate({
                  id: editing.id,
                  fieldKey: editing.fieldKey.trim(),
                  label: editing.label.trim(),
                  helpText: editing.helpText.trim() || undefined,
                  fieldType: editing.fieldType as never,
                  options: editing.options
                    .split("\n")
                    .map((option) => option.trim())
                    .filter(Boolean),
                  required: editing.required,
                  enabled: editing.enabled,
                  sortOrder: editing.sortOrder,
                });
              }}
            >
              Save field
            </Button>
          </>
        }
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {editing ? (
          <div className="mt-4 space-y-4">
            <Input
              label="Label"
              value={editing.label}
              onChange={(event) => setEditing({ ...editing, label: event.target.value })}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Field key"
                help="Lower-case letters, numbers, and underscores."
                value={editing.fieldKey}
                onChange={(event) => setEditing({ ...editing, fieldKey: event.target.value })}
                required
              />
              <Select
                label="Type"
                value={editing.fieldType}
                onChange={(event) => setEditing({ ...editing, fieldType: event.target.value })}
                options={[
                  { value: "text", label: "Text" },
                  { value: "textarea", label: "Long text" },
                  { value: "select", label: "Choice" },
                  { value: "checkbox", label: "Checkbox" },
                  { value: "tel", label: "Telephone" },
                  { value: "url", label: "URL" },
                ]}
              />
            </div>
            <Input
              label="Help text"
              value={editing.helpText}
              onChange={(event) => setEditing({ ...editing, helpText: event.target.value })}
              maxLength={255}
            />
            {editing.fieldType === "select" ? (
              <Textarea
                label="Options"
                help="One option per line."
                rows={5}
                value={editing.options}
                onChange={(event) => setEditing({ ...editing, options: event.target.value })}
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Checkbox
                label="Required"
                checked={editing.required}
                onChange={(event) => setEditing({ ...editing, required: event.target.checked })}
              />
              <Checkbox
                label="Shown on the form"
                checked={editing.enabled}
                onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
