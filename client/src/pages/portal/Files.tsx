/**
 * Deliverables library.
 *
 * Downloads always go through a short-lived, single-use ticket issued by the
 * server after an authorisation check. There is no guessable, permanent URL for
 * any customer file, and every access attempt — granted or denied — is logged.
 */
import { useMemo, useState } from "react";
import { Download, FileArchive, FileText, Search } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatBytes, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

const CATEGORY_LABELS: Record<string, string> = {
  deliverable: "Deliverable",
  intake_attachment: "Intake attachment",
  nda: "Agreement",
  sample: "Sample",
  support: "Support attachment",
  other: "Other",
};

export function FilesPage() {
  const toast = useToast();
  const files = trpc.files.listForUser.useQuery();

  const [search, setSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);

  const requestDownload = trpc.files.requestDownload.useMutation({
    onSuccess(result) {
      setBusyId(null);
      window.location.assign(result.url);
    },
    onError(error) {
      setBusyId(null);
      toast.error("Download failed", errorMessage(error));
    },
  });

  const bulkDownload = trpc.files.bulkDownload.useMutation({
    onSuccess(result) {
      if (result.skipped > 0) {
        toast.info(
          "Some files were skipped",
          `${result.fileCount} file(s) included; ${result.skipped} were not available to you.`,
        );
      }
      window.location.assign(result.url);
      setSelected(new Set());
    },
    onError(error) {
      toast.error("Archive could not be prepared", errorMessage(error));
    },
  });

  const orderOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const file of files.data ?? []) {
      if (file.orderNumber) seen.set(file.orderNumber, file.orderNumber);
    }
    return [...seen.keys()];
  }, [files.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (files.data ?? []).filter((file) => {
      if (orderFilter !== "all" && file.orderNumber !== orderFilter) return false;
      if (!needle) return true;
      return file.originalName.toLowerCase().includes(needle);
    });
  }, [files.data, search, orderFilter]);

  const toggle = (fileId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const allVisibleSelected = rows.length > 0 && rows.every((file) => selected.has(file.id));

  return (
    <>
      <PageHeader
        title="My deliverables"
        description="Every file published to your orders. Downloads are logged for your protection and ours."
        actions={
          selected.size > 0 ? (
            <Button
              busy={bulkDownload.isPending}
              onClick={() =>
                bulkDownload.mutate({
                  fileIds: [...selected],
                  archiveName: "readypackets-deliverables",
                })
              }
              leadingIcon={<FileArchive className="size-4" aria-hidden="true" />}
            >
              Download {selected.size} as ZIP
            </Button>
          ) : null
        }
      />

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Input
            label="Search files"
            placeholder="File name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leadingIcon={<Search className="size-4" aria-hidden="true" />}
          />
          <Select
            label="Order"
            className="sm:w-56"
            value={orderFilter}
            onChange={(event) => setOrderFilter(event.target.value)}
            options={[
              { value: "all", label: "All orders" },
              ...orderOptions.map((value) => ({ value, label: value })),
            ]}
          />
        </div>
      </Card>

      {files.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (files.data ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No deliverables yet"
          description="Files appear here as your packets are completed and published. You will receive an email when something new is available."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No files match your filters"
          description="Try a different search term, or clear the order filter."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setOrderFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Card padded={false}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <label className="flex items-center gap-2.5 text-sm font-medium text-body">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) =>
                  setSelected(event.target.checked ? new Set(rows.map((file) => file.id)) : new Set())
                }
                className="size-4 rounded border-line accent-teal"
              />
              Select all {rows.length}
            </label>
            {selected.size > 0 ? (
              <span className="text-xs text-muted">{selected.size} selected</span>
            ) : null}
          </div>

          <ul className="divide-y divide-line">
            {rows.map((file) => (
              <li key={file.id} className="flex items-center gap-3 px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={selected.has(file.id)}
                  onChange={() => toggle(file.id)}
                  className="size-4 shrink-0 rounded border-line accent-teal"
                  aria-label={`Select ${file.originalName}`}
                />
                <FileText className="size-4 shrink-0 text-teal" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{file.originalName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>{formatBytes(file.sizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>v{file.version}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(file.createdAt)}</span>
                    {file.orderNumber ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{file.orderNumber}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <Badge tone="neutral" className="hidden shrink-0 sm:inline-flex">
                  {CATEGORY_LABELS[file.category] ?? file.category}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  busy={busyId === file.id}
                  onClick={() => {
                    setBusyId(file.id);
                    requestDownload.mutate({ fileId: file.id });
                  }}
                  leadingIcon={<Download className="size-4" aria-hidden="true" />}
                >
                  <span className="hidden sm:inline">Download</span>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Alert tone="info" className="mt-6" title="About your files">
        Download links are generated on request, expire within minutes, and can be used once. This
        prevents a copied link from granting anyone else access to your material.
      </Alert>
    </>
  );
}
