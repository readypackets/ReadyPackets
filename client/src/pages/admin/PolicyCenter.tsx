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
import { useRef, useState, useMemo } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  FileUp,
  Plus,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";
import { trpc, errorMessage, csrfToken, refreshCsrfToken } from "@/lib/trpc";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { renderMarkdown } from "@/lib/markdown";
import { PageHeader } from "@/components/layout/PortalLayout";

type AcceptanceRow = {
  id: number;
  acceptedAt: Date | string;
  policyId: number;
  policyTitle: string;
  policySlug: string;
  version: string;
  effectiveDate: string;
  userId: number;
  userPublicId: string | null;
  userName: string;
  userEmail: string;
};

type PolicyDoc = {
  id: number;
  slug: string;
  title: string;
  requiresAcceptance: boolean;
  isVisible: boolean;
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
  return <div className="prose prose-sm max-w-none text-ink">{renderMarkdown(content)}</div>;
}

export function PolicyCenterPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"documents" | "acceptances">("documents");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreateDoc, setShowCreateDoc] = useState(false);
  const [showPublishVersion, setShowPublishVersion] = useState<Pick<PolicyDoc, "id" | "title"> | null>(null);
  const [showPreview, setShowPreview] = useState<{ title: string; content: string } | null>(null);
  const [acceptanceSearch, setAcceptanceSearch] = useState("");
  const [acceptancePolicyFilter, setAcceptancePolicyFilter] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importTarget, setImportTarget] = useState<"new" | "version">("new");
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [pendingInitialBody, setPendingInitialBody] = useState("");

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

  const acceptanceGrid = trpc.admin.policyAcceptanceGrid.useQuery({
    search: acceptanceSearch.trim() || undefined,
    policyId: acceptancePolicyFilter ? Number(acceptancePolicyFilter) : undefined,
    limit: 500,
  }, { enabled: tab === "acceptances" });

  const createDoc = trpc.admin.createPolicyDocument.useMutation({
    onSuccess(result) {
      void utils.admin.policies.invalidate();
      setShowCreateDoc(false);
      if (pendingInitialBody.trim()) {
        setShowPublishVersion({ id: result.id, title: newTitle.trim() || "Imported policy" });
        setPvVersion("1.0");
        setPvEffectiveDate(new Date().toISOString().slice(0, 10));
        setPvBody(pendingInitialBody);
        setPendingInitialBody("");
        toast.success("Policy created", "Review the converted Markdown and publish its first version when ready.");
      } else {
        toast.success("Policy created", "You can now publish the first version.");
      }
      setNewSlug("");
      setNewTitle("");
      setNewPublicRoute("");
      setImportWarnings([]);
    },
    onError(err) {
      toast.error("Could not create policy", errorMessage(err));
    },
  });

  const updateRequirement = trpc.admin.updatePolicyRequirement.useMutation({
    onSuccess(_result, variables) {
      toast.success(variables.requiresAcceptance ? "Policy is now required" : "Policy is now optional", variables.requiresAcceptance ? "Customers must accept the current version before using the portal." : "Customers may review this policy without a portal access gate.");
      void utils.admin.policies.invalidate();
    },
    onError(err) {
      toast.error("Could not update policy requirement", errorMessage(err));
    },
  });

  const updateVisibility = trpc.admin.updatePolicyVisibility.useMutation({
    onSuccess(_result, variables) {
      toast.success(variables.isVisible ? "Policy is now visible" : "Policy is now hidden", variables.isVisible ? "The policy can appear on public and customer policy routes." : "The policy is hidden from general browsing. Required acceptance remains available in the compliance flow.");
      void utils.admin.policies.invalidate();
    },
    onError(err) {
      toast.error("Could not update policy visibility", errorMessage(err));
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

  const handlePolicyImport = async (selected: FileList | null) => {
    const file = selected?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const post = async (token: string) => fetch("/api/policies/import", {
        method: "POST",
        credentials: "include",
        headers: { "X-RP-CSRF": token },
        body,
      });
      let token = await refreshCsrfToken();
      let response = await post(token ?? csrfToken() ?? "");
      if (response.status === 403) {
        token = await refreshCsrfToken();
        if (token) response = await post(token);
      }
      const payload = (await response.json()) as { error?: string; suggestedTitle?: string; markdown?: string; warnings?: string[] };
      if (!response.ok || !payload.markdown) throw new Error(payload.error ?? "The policy document could not be converted.");
      setImportWarnings(payload.warnings ?? []);
      if (importTarget === "new") {
        const title = payload.suggestedTitle?.trim() || "Imported policy";
        setNewTitle(title);
        setNewSlug(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96));
        setPendingInitialBody(payload.markdown);
        setShowCreateDoc(true);
        toast.success("Policy converted", "Confirm the policy details, then review the converted Markdown before publishing.");
      } else {
        setPvBody(payload.markdown);
        toast.success("Policy converted", "Review the converted Markdown before publishing this version.");
      }
    } catch (error) {
      toast.error("Could not import policy", error instanceof Error ? error.message : "The policy document could not be converted.");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const beginImport = (target: "new" | "version") => {
    setImportTarget(target);
    importInputRef.current?.click();
  };

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
      cell: (doc) => (
        <div className="flex items-center gap-2">
          {doc.requiresAcceptance ? <Badge tone="navy">Required</Badge> : <Badge tone="neutral">Optional</Badge>}
          <Button
            size="sm"
            variant="ghost"
            busy={updateRequirement.isPending && updateRequirement.variables?.policyId === doc.id}
            onClick={() => updateRequirement.mutate({ policyId: doc.id, requiresAcceptance: !doc.requiresAcceptance })}
          >
            Make {doc.requiresAcceptance ? "optional" : "required"}
          </Button>
        </div>
      ),
    },
    {
      key: "isVisible",
      header: "Visibility",
      cell: (doc) => (
        <div className="flex items-center gap-2">
          {doc.isVisible ? <Badge tone="teal">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}
          <Button
            size="sm"
            variant="ghost"
            busy={updateVisibility.isPending && updateVisibility.variables?.policyId === doc.id}
            onClick={() => updateVisibility.mutate({ policyId: doc.id, isVisible: !doc.isVisible })}
          >
            Make {doc.isVisible ? "hidden" : "visible"}
          </Button>
        </div>
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

  const acceptanceColumns: Column<AcceptanceRow>[] = [
    { key: "customer", header: "Customer", cell: (row) => <div className="min-w-0"><p className="truncate font-medium text-ink">{row.userName}</p><p className="mt-0.5 truncate text-xs text-muted">{row.userEmail}</p><p className="mt-0.5 font-mono text-xs text-muted">{row.userPublicId ?? `internal-${row.userId}`}</p></div> },
    { key: "policy", header: "Policy", cell: (row) => <div><p className="font-medium text-ink">{row.policyTitle}</p><p className="mt-0.5 text-xs text-muted">{row.policySlug}</p></div> },
    { key: "version", header: "Accepted version", cell: (row) => <div><Badge tone="teal">v{row.version}</Badge><p className="mt-1 text-xs text-muted">Effective {row.effectiveDate}</p></div> },
    { key: "acceptedAt", header: "Accepted at", cell: (row) => <span className="text-sm text-body">{formatDateTime(row.acceptedAt)}</span> },
    { key: "status", header: "Status", cell: () => <Badge tone="success">Accepted</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Policy Center"
        description="Manage policy documents, publish new versions, and track customer acceptances."
        actions={
          <div className="flex items-center gap-2">
            <input ref={importInputRef} className="sr-only" type="file" accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" onChange={(event) => void handlePolicyImport(event.target.files)} />
            <Button variant="outline" leadingIcon={<FileUp className="size-4" />} busy={importing} onClick={() => beginImport("new")}>
              Import document
            </Button>
            <Button variant="primary" leadingIcon={<Plus className="size-4" />} onClick={() => { setPendingInitialBody(""); setImportWarnings([]); setShowCreateDoc(true); }}>
              New policy
            </Button>
          </div>
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
            Search by customer name, email, ReadyPackets user ID, policy title, policy slug, or version. Every row identifies the accepting customer and the exact policy version they accepted.
          </Alert>
          <Card>
            <CardHeader title="Policy acceptance ledger" description="A searchable, audit-ready record of accepted policy versions." />
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_260px]">
              <Input label="Search acceptances" placeholder="Customer, email, RP-U ID, policy, or version" value={acceptanceSearch} onChange={(event) => setAcceptanceSearch(event.target.value)} />
              <Select label="Policy" value={acceptancePolicyFilter} onChange={(event) => setAcceptancePolicyFilter(event.target.value)} options={[{ value: "", label: "All policies" }, ...(policies.data ?? []).map((policy) => ({ value: String(policy.id), label: policy.title }))]} />
            </div>
            {acceptanceGrid.isLoading ? (
              <div className="mt-4 space-y-2">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
            ) : (
              <div className="mt-5"><DataTable caption="Policy acceptance ledger" columns={acceptanceColumns} rows={(acceptanceGrid.data ?? []) as AcceptanceRow[]} rowKey={(row) => row.id} empty={<p className="py-6 text-sm text-muted">No policy acceptance records match the current filters.</p>} /></div>
            )}
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
          {pendingInitialBody.trim() && <Alert tone="info" title="Document imported">Create this policy document first. The converted Markdown will then open for review before you publish version 1.0.</Alert>}
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
          <div className="flex justify-end">
            <Button size="sm" variant="outline" leadingIcon={<FileUp className="size-3.5" />} busy={importing} onClick={() => beginImport("version")}>
              Import DOC, DOCX, or PDF
            </Button>
          </div>
          {importWarnings.length > 0 && <Alert tone="warning" title="Imported document requires review">{importWarnings.join(" ")}</Alert>}
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
