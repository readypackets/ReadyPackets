/**
 * Policy Center — admin page for managing policy documents, versions, and acceptance tracking.
 *
 * Features:
 * - List all policy documents with their current published version
 * - Create new policy documents
 * - Publish new versions (old versions kept for audit trail)
 * - View version history with download/view links
 * - View acceptance stats per policy
 * - View per-customer acceptance history
 */
import { useState, useMemo } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

type PolicyDoc = {
  id: number;
  slug: string;
  title: string;
  requiresAcceptance: boolean;
  publicRoute: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  versions: Array<{
    id: number;
    policyId: number;
    version: string;
    effectiveDate: string;
    bodyMarkdown: string;
    published: boolean;
    createdByUserId: number | null;
    createdAt: Date | string;
  }>;
};

function MarkdownPreview({ content }: { content: string }) {
  // Simple markdown-to-HTML for preview (headings, bold, paragraphs)
  const html = content
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[h|p])(.+)$/gm, "<p>$1</p>");
  return (
    <div
      className="prose prose-sm max-w-none text-ink"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function PolicyCenterPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"documents" | "acceptances">("documents");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreateDoc, setShowCreateDoc] = useState(false);
  const [showPublishVersion, setShowPublishVersion] = useState<PolicyDoc | null>(null);
  const [showPreview, setShowPreview] = useState<{ title: string; content: string } | null>(null);
  const [acceptanceLookupId, setAcceptanceLookupId] = useState("");

  // Create document form
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newRequiresAcceptance, setNewRequiresAcceptance] = useState("true");
  const [newPublicRoute, setNewPublicRoute] = useState("");

  // Publish version form
  const [pvVersion, setPvVersion] = useState("");
  const [pvEffectiveDate, setPvEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [pvBody, setPvBody] = useState("");

  const policies = trpc.admin.policies.useQuery(undefined, { refetchOnMount: "always" });
  const utils = trpc.useUtils();

  const acceptancesQuery = trpc.admin.policyAcceptances.useQuery(
    { userId: Number(acceptanceLookupId) },
    { enabled: !!acceptanceLookupId && !isNaN(Number(acceptanceLookupId)) && Number(acceptanceLookupId) > 0 },
  );

  const createDoc = trpc.admin.createPolicyDocument.useMutation({
    onSuccess() {
      toast.success("Policy created", "You can now publish the first version.");
      void utils.admin.policies.invalidate();
      setShowCreateDoc(false);
      setNewSlug("");
      setNewTitle("");
      setNewPublicRoute("");
    },
    onError(err) {
      toast.error("Could not create policy", errorMessage(err));
    },
  });

  const publishVersion = trpc.admin.publishPolicyVersion.useMutation({
    onSuccess() {
      toast.success("Version published", "Customers who have not accepted this version will be prompted.");
      void utils.admin.policies.invalidate();
      setShowPublishVersion(null);
      setPvVersion("");
      setPvBody("");
    },
    onError(err) {
      toast.error("Could not publish version", errorMessage(err));
    },
  });

  const handleCreateDoc = () => {
    createDoc.mutate({
      slug: newSlug.trim(),
      title: newTitle.trim(),
      requiresAcceptance: newRequiresAcceptance === "true",
      publicRoute: newPublicRoute.trim() || undefined,
    });
  };

  const handlePublishVersion = () => {
    if (!showPublishVersion) return;
    publishVersion.mutate({
      policyId: showPublishVersion.id,
      version: pvVersion.trim(),
      effectiveDate: pvEffectiveDate,
      bodyMarkdown: pvBody.trim(),
    });
  };

  const handleDownloadVersion = (policy: PolicyDoc, version: PolicyDoc["versions"][0]) => {
    const blob = new Blob([version.bodyMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${policy.slug}-v${version.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const policyColumns: Column<PolicyDoc>[] = [
    {
      key: "title",
      header: "Policy",
      cell: (doc) => {
        const latest = doc.versions.find((v) => v.published);
        return (
          <div className="min-w-0">
            <p className="font-medium text-ink">{doc.title}</p>
            <p className="mt-0.5 text-xs text-muted font-mono">{doc.slug}</p>
          </div>
        );
      },
    },
    {
      key: "version",
      header: "Current version",
      cell: (doc) => {
        const latest = doc.versions.find((v) => v.published);
        return latest ? (
          <div>
            <Badge tone="teal">v{latest.version}</Badge>
            <p className="mt-1 text-xs text-muted">Effective {latest.effectiveDate}</p>
          </div>
        ) : (
          <Badge tone="warning">No published version</Badge>
        );
      },
    },
    {
      key: "requiresAcceptance",
      header: "Acceptance",
      cell: (doc) =>
        doc.requiresAcceptance ? (
          <Badge tone="navy">Required</Badge>
        ) : (
          <Badge tone="neutral">Optional</Badge>
        ),
    },
    {
      key: "versions",
      header: "Versions",
      cell: (doc) => (
        <span className="text-sm text-muted">{doc.versions.length}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (doc) => (
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
            trailingIcon={
              expandedId === doc.id ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )
            }
          >
            History
          </Button>
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<Plus className="size-3.5" />}
            onClick={() => {
              setShowPublishVersion(doc);
              const latest = doc.versions.find((v) => v.published);
              if (latest) {
                setPvBody(latest.bodyMarkdown);
                // Suggest next version number
                const parts = latest.version.split(".");
                const minor = parseInt(parts[1] ?? "0", 10) + 1;
                setPvVersion(`${parts[0]}.${minor}`);
              } else {
                setPvVersion("1.0");
                setPvBody("");
              }
            }}
          >
            New version
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Policy Center"
        description="Manage policy documents, publish new versions, and track customer acceptances."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Plus className="size-4" />}
            onClick={() => setShowCreateDoc(true)}
          >
            New policy
          </Button>
        }
      />

      {/* Tab strip */}
      <div className="mb-6 flex gap-1 border-b border-line">
        {(["documents", "acceptances"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-teal text-teal"
                : "text-muted hover:text-ink"
            }`}
          >
            {t === "documents" ? "Policy documents" : "Acceptance tracker"}
          </button>
        ))}
      </div>

      {tab === "documents" && (
        <div className="space-y-4">
          {policies.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <>
              <DataTable
                caption="Policy documents"
                columns={policyColumns}
                rows={policies.data ?? []}
                rowKey={(doc) => doc.id}
              />

              {/* Version history expansion */}
              {expandedId !== null && (() => {
                const doc = (policies.data ?? []).find((d) => d.id === expandedId);
                if (!doc) return null;
                return (
                  <Card className="mt-2">
                    <CardHeader
                      title={`Version history — ${doc.title}`}
                      description={`${doc.versions.length} version${doc.versions.length !== 1 ? "s" : ""} on record`}
                    />
                    <div className="mt-4 space-y-3">
                      {doc.versions.length === 0 ? (
                        <p className="text-sm text-muted">No versions published yet.</p>
                      ) : (
                        doc.versions.map((v) => (
                          <div
                            key={v.id}
                            className="flex items-start justify-between gap-4 rounded-lg border border-line p-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold">v{v.version}</span>
                                {v.published ? (
                                  <Badge tone="success">Current</Badge>
                                ) : (
                                  <Badge tone="neutral">Superseded</Badge>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-muted">
                                Effective {v.effectiveDate} · Published {formatDate(v.createdAt)}
                              </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                leadingIcon={<BookOpen className="size-3.5" />}
                                onClick={() =>
                                  setShowPreview({ title: `${doc.title} v${v.version}`, content: v.bodyMarkdown })
                                }
                              >
                                Preview
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                leadingIcon={<Download className="size-3.5" />}
                                onClick={() => handleDownloadVersion(doc, v)}
                              >
                                Download
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                );
              })()}
            </>
          )}
        </div>
      )}

      {tab === "acceptances" && (
        <div className="space-y-6">
          <Alert tone="info" title="Acceptance tracker">
            Enter a customer's numeric user ID to view their policy acceptance history.
            Customer IDs are shown in the Customers admin page.
          </Alert>
          <Card>
            <CardHeader title="Look up customer acceptances" />
            <div className="mt-4 flex gap-3">
              <Input
                label="Customer user ID"
                placeholder="e.g. 2"
                value={acceptanceLookupId}
                onChange={(e) => setAcceptanceLookupId(e.target.value)}
                className="max-w-xs"
              />
            </div>
            {acceptancesQuery.isLoading && acceptanceLookupId ? (
              <div className="mt-4 space-y-2">
                {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : acceptancesQuery.data ? (
              <div className="mt-4">
                {acceptancesQuery.data.length === 0 ? (
                  <p className="text-sm text-muted">No policy acceptances on record for this user.</p>
                ) : (
                  <div className="space-y-2">
                    {acceptancesQuery.data.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-4 rounded-lg border border-line p-3"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="size-4 text-success shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-ink">{row.policyTitle}</p>
                            <p className="text-xs text-muted">
                              v{row.version} · Effective {row.effectiveDate} · Accepted {formatDate(row.acceptedAt)}
                            </p>
                          </div>
                        </div>
                        <Badge tone="success">Accepted</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {/* Create policy document modal */}
      <Modal
        open={showCreateDoc}
        onClose={() => setShowCreateDoc(false)}
        title="New policy document"
        description="Create a new policy. You will publish the first version after creation."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowCreateDoc(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={createDoc.isPending}
              onClick={handleCreateDoc}
              disabled={!newSlug.trim() || !newTitle.trim()}
            >
              Create policy
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            required
            placeholder="e.g. Privacy Policy"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Input
            label="Slug"
            required
            placeholder="e.g. privacy-policy"
            help="Lowercase letters, numbers, and hyphens only. Used in URLs."
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          />
          <Select
            label="Requires customer acceptance"
            value={newRequiresAcceptance}
            onChange={(e) => setNewRequiresAcceptance(e.target.value)}
            options={[
              { value: "true", label: "Yes — customers must accept before using the portal" },
              { value: "false", label: "No — informational only" },
            ]}
          />
          <Input
            label="Public route (optional)"
            placeholder="e.g. /policies/privacy"
            help="If set, a link to this route will appear in the footer."
            value={newPublicRoute}
            onChange={(e) => setNewPublicRoute(e.target.value)}
          />
        </div>
      </Modal>

      {/* Publish version modal */}
      <Modal
        open={!!showPublishVersion}
        onClose={() => setShowPublishVersion(null)}
        title={`Publish new version — ${showPublishVersion?.title ?? ""}`}
        description="Publishing a new version supersedes the current one. Customers who have not accepted this version will be prompted in the portal."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPublishVersion(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={publishVersion.isPending}
              onClick={handlePublishVersion}
              disabled={!pvVersion.trim() || !pvBody.trim()}
            >
              Publish version
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Version number"
              required
              placeholder="e.g. 1.1"
              value={pvVersion}
              onChange={(e) => setPvVersion(e.target.value)}
            />
            <Input
              label="Effective date"
              required
              type="date"
              value={pvEffectiveDate}
              onChange={(e) => setPvEffectiveDate(e.target.value)}
            />
          </div>
          <Textarea
            label="Policy content (Markdown)"
            required
            rows={16}
            placeholder="# Policy Title&#10;&#10;Enter the full policy text in Markdown format..."
            value={pvBody}
            onChange={(e) => setPvBody(e.target.value)}
            help="Use Markdown formatting. # for headings, **bold**, *italic*."
          />
          {pvBody.trim() && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted uppercase tracking-wide">Preview</p>
              <div className="rounded-lg border border-line p-4 max-h-64 overflow-y-auto">
                <MarkdownPreview content={pvBody} />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Markdown preview modal */}
      <Modal
        open={!!showPreview}
        onClose={() => setShowPreview(null)}
        title={showPreview?.title ?? "Policy preview"}
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowPreview(null)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto">
          {showPreview && <MarkdownPreview content={showPreview.content} />}
        </div>
      </Modal>
    </>
  );
}
