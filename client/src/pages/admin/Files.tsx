/**
 * File manager.
 *
 * Uploads go to a plain multipart endpoint that validates the magic bytes of each
 * file against its claimed extension before anything is written to disk, so a
 * renamed executable is rejected regardless of what the browser reported.
 */
import { useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  FileText,
  History,
  Trash2,
  Upload,
  Undo2,
} from "lucide-react";
import { trpc, errorMessage, csrfToken } from "@/lib/trpc";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui/Surface";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

const CATEGORIES = [
  "deliverable",
  "intake_attachment",
  "nda",
  "sample",
  "support",
  "internal",
  "other",
] as const;

export function AdminFilesPage() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [orderFilter, setOrderFilter] = useState("");
  const [uploadOrderId, setUploadOrderId] = useState("");
  const [uploadCategory, setUploadCategory] = useState("deliverable");
  const [uploading, setUploading] = useState(false);
  const [purgeId, setPurgeId] = useState<number | null>(null);
  const [historyFileId, setHistoryFileId] = useState<number | null>(null);

  const files = trpc.adminFiles.list.useQuery({
    orderId: orderFilter ? Number(orderFilter) : undefined,
    includeDeleted,
    limit: 300,
  });
  const allowedTypes = trpc.files.allowedTypes.useQuery();
  const versions = trpc.adminFiles.versions.useQuery(
    { fileId: historyFileId ?? 0 },
    { enabled: historyFileId !== null },
  );
  const accessLog = trpc.adminFiles.accessLog.useQuery({ limit: 50 });

  const setVisibility = trpc.adminFiles.setVisibility.useMutation({
    async onSuccess() {
      await files.refetch();
      toast.success("Visibility updated");
    },
    onError(error) {
      toast.error("Could not change visibility", errorMessage(error));
    },
  });

  const softDelete = trpc.adminFiles.softDelete.useMutation({
    async onSuccess() {
      await files.refetch();
      toast.success("File archived");
    },
    onError(error) {
      toast.error("Could not archive the file", errorMessage(error));
    },
  });

  const restore = trpc.adminFiles.restore.useMutation({
    async onSuccess() {
      await files.refetch();
      toast.success("File restored");
    },
    onError(error) {
      toast.error("Could not restore the file", errorMessage(error));
    },
  });

  const purge = trpc.adminFiles.purge.useMutation({
    async onSuccess() {
      setPurgeId(null);
      await files.refetch();
      toast.success("File permanently removed");
    },
    onError(error) {
      toast.error("Could not purge the file", errorMessage(error));
    },
  });

  /**
   * Multipart upload performed with fetch rather than a library, so the CSRF
   * token and credentials handling stay explicit and auditable.
   */
  const handleUpload = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    setUploading(true);
    try {
      const body = new FormData();
      for (const file of Array.from(selected).slice(0, 5)) body.append("files", file);
      if (uploadOrderId) body.append("orderId", uploadOrderId);
      body.append("category", uploadCategory);

      const response = await fetch("/api/files/upload", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-csrf-token": csrfToken() ?? "" },
        body,
      });
      const payload = (await response.json()) as {
        error?: string;
        files?: { originalName: string }[];
        rejected?: { name: string; reason: string }[];
      };

      if (!response.ok) {
        toast.error("Upload rejected", payload.error ?? "The upload could not be processed.");
      } else {
        const accepted = payload.files?.length ?? 0;
        toast.success(
          `${accepted} file${accepted === 1 ? "" : "s"} uploaded`,
          uploadCategory === "deliverable"
            ? "Deliverables are hidden from the customer until you publish them."
            : undefined,
        );
        for (const rejection of payload.rejected ?? []) {
          toast.error(`Rejected: ${rejection.name}`, rejection.reason);
        }
        await files.refetch();
      }
    } catch {
      toast.error("Upload failed", "The server could not be reached.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <>
      <PageHeader
        title="Files"
        description="Every file on the platform, with visibility control and an access trail."
      />

      <Card className="mb-5">
        <CardHeader
          title="Upload"
          description="Files are validated by content, not by name. Deliverables stay private until published."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Input
            label="Order ID"
            help="Optional; leave blank for unattached files."
            type="number"
            min={1}
            value={uploadOrderId}
            onChange={(event) => setUploadOrderId(event.target.value)}
          />
          <Select
            label="Category"
            value={uploadCategory}
            onChange={(event) => setUploadCategory(event.target.value)}
            options={CATEGORIES.map((category) => ({
              value: category,
              label: category.replace(/_/g, " "),
            }))}
          />
          <div className="flex items-end">
            <Button
              fullWidth
              busy={uploading}
              onClick={() => fileInput.current?.click()}
              leadingIcon={<Upload className="size-4" aria-hidden="true" />}
            >
              Choose files
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files)}
            />
          </div>
        </div>

        {allowedTypes.data ? (
          <p className="mt-3 text-xs text-muted">
            Permitted types: {(allowedTypes.data as string[]).join(", ")}
          </p>
        ) : null}
      </Card>

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input
            label="Filter by order ID"
            type="number"
            min={1}
            value={orderFilter}
            onChange={(event) => setOrderFilter(event.target.value)}
          />
          <Checkbox
            label="Include archived files"
            checked={includeDeleted}
            onChange={(event) => setIncludeDeleted(event.target.checked)}
          />
        </div>
      </Card>

      {files.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (files.data ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No files"
          description="Upload a deliverable, or clear the order filter."
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {(files.data ?? []).map((file) => (
              <li key={file.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-ink">{file.originalName}</span>
                      <Badge tone="neutral">{file.category.replace(/_/g, " ")}</Badge>
                      {file.deletedAt ? <Badge tone="danger">archived</Badge> : null}
                      {file.isPlaceholder ? <Badge tone="warning">placeholder</Badge> : null}
                      <Badge tone={file.visibleToCustomer ? "success" : "neutral"}>
                        {file.visibleToCustomer ? "visible" : "private"}
                      </Badge>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatBytes(file.sizeBytes)} · v{file.version} · {file.detectedMime} ·{" "}
                      {file.orderId ? `order ${file.orderId}` : "unattached"} · uploaded by{" "}
                      {file.uploadedBy} · {formatDateTime(file.createdAt)}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted" title={file.sha256}>
                      sha256 {file.sha256.slice(0, 32)}…
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {file.deletedAt ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restore.mutate({ fileId: file.id })}
                          leadingIcon={<Undo2 className="size-4" aria-hidden="true" />}
                        >
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPurgeId(file.id)}
                          leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
                        >
                          Purge
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant={file.visibleToCustomer ? "outline" : "primary"}
                          busy={setVisibility.isPending}
                          onClick={() =>
                            setVisibility.mutate({
                              fileId: file.id,
                              visibleToCustomer: !file.visibleToCustomer,
                            })
                          }
                          leadingIcon={
                            file.visibleToCustomer ? (
                              <EyeOff className="size-4" aria-hidden="true" />
                            ) : (
                              <Eye className="size-4" aria-hidden="true" />
                            )
                          }
                        >
                          {file.visibleToCustomer ? "Unpublish" : "Publish"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryFileId(file.id)}
                          leadingIcon={<History className="size-4" aria-hidden="true" />}
                        >
                          Versions
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => softDelete.mutate({ fileId: file.id })}
                          leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
                        >
                          Archive
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Recent file access"
          description="Every view, download, and denied attempt."
        />
        {accessLog.isLoading ? (
          <Skeleton className="mt-4 h-32 w-full" />
        ) : (accessLog.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-body">No file access recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {(accessLog.data ?? []).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={entry.outcome === "denied" ? "danger" : "success"}>
                    {entry.outcome}
                  </Badge>
                  <span className="text-body">
                    {entry.action} · file {entry.fileId}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {entry.ipAddress ?? "no address"}
                  </span>
                </span>
                <span className="text-xs text-muted">{formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={historyFileId !== null}
        onClose={() => setHistoryFileId(null)}
        title="Version history"
        description="Replacing a file keeps the previous version on record."
      >
        {versions.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (versions.data ?? []).length === 0 ? (
          <p className="text-sm text-body">No earlier versions recorded.</p>
        ) : (
          <ul className="divide-y divide-line">
            {(versions.data ?? []).map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <Badge tone="neutral">v{version.version}</Badge>
                  <span className="ml-2 text-body">{formatBytes(version.sizeBytes)}</span>
                </span>
                <span className="text-xs text-muted">{formatDateTime(version.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={purgeId !== null}
        onClose={() => setPurgeId(null)}
        onConfirm={() => {
          if (purgeId) purge.mutate({ fileId: purgeId, confirm: true });
        }}
        title="Permanently delete this file?"
        message="The file is removed from disk and from the database. This cannot be undone, and any customer link to it will stop working."
        confirmLabel="Delete permanently"
        variant="danger"
        busy={purge.isPending}
      />

      <Alert tone="info" className="mt-6" title="Retention">
        Archived files are purged automatically once the retention window configured in system
        settings elapses. Purging here bypasses that window.
      </Alert>
    </>
  );
}
