/**
 * Portal Policy Acceptance page.
 *
 * Shows all policies that require acceptance and have not yet been accepted
 * by the current user at the latest published version. When a new version
 * is published by an admin, this page will prompt the user to re-accept.
 */
import { useState } from "react";
import { CheckCircle2, FileText, Shield } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Alert, Badge, Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";
import { renderMarkdown } from "@/lib/markdown";

function MarkdownPreview({ content }: { content: string }) {
  return <div className="prose prose-sm max-w-none text-body leading-relaxed">{renderMarkdown(content)}</div>;
}

export function PoliciesPage() {
  const toast = useToast();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [accepting, setAccepting] = useState<number | null>(null);

  const pending = trpc.account.pendingPolicies.useQuery(undefined, { refetchOnMount: "always" });
  const utils = trpc.useUtils();

  const accept = trpc.account.acceptPolicy.useMutation({
    onSuccess() {
      toast.success("Policy accepted", "Thank you for reviewing and accepting this policy.");
      void utils.account.pendingPolicies.invalidate();
      setAccepting(null);
    },
    onError(err) {
      toast.error("Could not record acceptance", errorMessage(err));
      setAccepting(null);
    },
  });

  const handleAccept = (versionId: number) => {
    setAccepting(versionId);
    accept.mutate({ policyVersionId: versionId });
  };

  return (
    <>
      <PageHeader
        title="Policies & agreements"
        description="Review and accept the policies that govern your use of the ReadyPackets platform."
      />

      {pending.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (pending.data ?? []).length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="size-12 text-success mb-4" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-ink">All policies accepted</h2>
            <p className="mt-2 text-sm text-muted max-w-sm">
              You are up to date with all current policies and agreements. We will notify you
              if any policies are updated and require re-acceptance.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <Alert tone="warning" title="Action required">
            Please review and accept the following {(pending.data ?? []).length} polic
            {(pending.data ?? []).length === 1 ? "y" : "ies"} to continue using the portal.
          </Alert>

          {(pending.data ?? []).map((policy) => (
            <Card key={policy.versionId} className="border-warning/30">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <FileText className="size-4 text-teal" aria-hidden="true" />
                    {policy.title}
                  </span>
                }
                description={`Version ${policy.version} · Effective ${policy.effectiveDate}`}
                actions={
                  <Badge tone="warning">Acceptance required</Badge>
                }
              />

              {/* Expand/collapse policy content */}
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded(expanded === policy.versionId ? null : policy.versionId)}
                >
                  {expanded === policy.versionId ? "Hide policy text" : "Read policy"}
                </Button>
              </div>

              {expanded === policy.versionId && (
                <div className="mt-4 rounded-lg border border-line bg-surface-raised p-4 max-h-96 overflow-y-auto">
                  <MarkdownPreview content={policy.bodyMarkdown} />
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4">
                <p className="text-xs text-muted">
                  By clicking "I accept", you confirm that you have read and agree to the{" "}
                  <strong>{policy.title}</strong> (v{policy.version}).
                </p>
                <Button
                  variant="primary"
                  busy={accepting === policy.versionId && accept.isPending}
                  leadingIcon={<Shield className="size-4" />}
                  onClick={() => handleAccept(policy.versionId)}
                >
                  I accept
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
