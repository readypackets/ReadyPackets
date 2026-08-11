/**
 * API Key hub — create, view, and revoke API keys for external integrations.
 */
import { useState } from "react";
import { Key, Plus, ShieldOff } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

const SCOPE_OPTIONS = [
  { value: "orders:read", label: "Orders — read" },
  { value: "orders:write", label: "Orders — write" },
  { value: "customers:read", label: "Customers — read" },
  { value: "files:read", label: "Files — read" },
  { value: "webhooks:write", label: "Webhooks — write" },
  { value: "admin:read", label: "Admin — read (full)" },
];

interface ApiKeyRow {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: unknown;
  lastUsedAt: string | Date | null;
  expiresAt: string | Date | null;
  revokedAt: string | Date | null;
  createdAt: string | Date;
}

export function AdminAPIKeysPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);

  const list = trpc.adminSecurity.apiKeys.useQuery();
  const createMut = trpc.adminSecurity.createApiKey.useMutation({
    async onSuccess(result) {
      setNewKey(result.apiKey);
      setCreateOpen(false);
      setName("");
      setSelectedScopes([]);
      setExpiresInDays(null);
      await utils.adminSecurity.apiKeys.invalidate();
    },
    onError(error) {
      toast.error("Could not create API key", errorMessage(error));
    },
  });
  const revokeMut = trpc.adminSecurity.revokeApiKey.useMutation({
    async onSuccess() {
      toast.success("API key revoked");
      setRevokeId(null);
      await utils.adminSecurity.apiKeys.invalidate();
    },
    onError(error) {
      toast.error("Could not revoke API key", errorMessage(error));
    },
  });

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function handleCreate() {
    if (!name.trim() || selectedScopes.length === 0) return;
    createMut.mutate({ name: name.trim(), scopes: selectedScopes, expiresInDays });
  }

  const rows = (list.data ?? []) as unknown as ApiKeyRow[];

  const columns: Column<ApiKeyRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => (
        <div>
          <p className="font-medium text-ink">{row.name}</p>
          <p className="mt-0.5 font-mono text-xs text-muted">{row.keyPrefix}…</p>
        </div>
      ),
    },
    {
      key: "scopes",
      header: "Scopes",
      hideOnMobile: true,
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {(Array.isArray(row.scopes) ? row.scopes : []).map((s: string) => (
            <Badge key={s} tone="neutral" className="font-mono text-xs">
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => {
        if (row.revokedAt) return <Badge tone="danger">Revoked</Badge>;
        if (row.expiresAt && new Date(row.expiresAt) < new Date())
          return <Badge tone="warning">Expired</Badge>;
        return <Badge tone="success">Active</Badge>;
      },
    },
    {
      key: "lastUsed",
      header: "Last used",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-xs text-muted">
          {row.lastUsedAt ? formatDateTime(row.lastUsedAt) : "Never"}
        </span>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-xs text-muted">
          {row.expiresAt ? formatDate(row.expiresAt) : "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (row) =>
        !row.revokedAt ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevokeId(row.id)}
            leadingIcon={<ShieldOff className="size-4" aria-hidden="true" />}
          >
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      {/* New key reveal modal */}
      {newKey ? (
        <Modal
          open
          onClose={() => setNewKey(null)}
          title="API key created"
          description="Copy this key now — it will not be shown again."
        >
          <Alert tone="warning" className="mb-4">
            Store this key securely. It cannot be retrieved after you close this dialog.
          </Alert>
          <code className="block break-all rounded-lg bg-surface-soft p-3 text-sm font-mono text-ink">
            {newKey}
          </code>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => { void navigator.clipboard.writeText(newKey); toast.success("Copied to clipboard"); }}>
              Copy key
            </Button>
          </div>
        </Modal>
      ) : null}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create API key"
        description="API keys allow external systems to access the ReadyPackets API."
      >
        <div className="space-y-4">
          <Input
            label="Key name"
            placeholder="e.g. Zapier integration"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldShell label="Scopes" required>
            <div className="space-y-1.5 rounded-lg border border-line p-3">
              {SCOPE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-teal"
                    checked={selectedScopes.includes(opt.value)}
                    onChange={() => toggleScope(opt.value)}
                  />
                  <span className="text-sm text-ink">{opt.label}</span>
                </label>
              ))}
            </div>
          </FieldShell>
          <Select
            label="Expires"
            value={expiresInDays === null ? "never" : String(expiresInDays)}
            onChange={(e) => setExpiresInDays(e.target.value === "never" ? null : Number(e.target.value))}
            options={[
              { value: "never", label: "Never" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "365", label: "1 year" },
            ]}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={createMut.isPending}
              disabled={!name.trim() || selectedScopes.length === 0}
              onClick={handleCreate}
            >
              Create key
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={revokeId !== null}
        onClose={() => setRevokeId(null)}
        onConfirm={() => { if (revokeId !== null) revokeMut.mutate({ id: revokeId }); }}
        title="Revoke API key"
        message="This key will stop working immediately. Any integrations using it will break."
        confirmLabel="Revoke"
        variant="danger"
        busy={revokeMut.isPending}
      />

      <PageHeader
        title="API keys"
        description="Manage API keys for external integrations and automation."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            Create key
          </Button>
        }
      />

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          caption="API keys"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Key}
              title="No API keys"
              description="Create a key to allow external systems to access the API."
              action={
                <Button
                  onClick={() => setCreateOpen(true)}
                  leadingIcon={<Plus className="size-4" aria-hidden="true" />}
                >
                  Create key
                </Button>
              }
            />
          }
        />
      )}
    </>
  );
}
