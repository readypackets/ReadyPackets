/**
 * Changelog management — create, edit, and publish platform release notes.
 * This is a dedicated page extracted from the Content tab for easier access.
 */
import { useState } from "react";
import { Newspaper, Plus } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/Surface";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

interface ChangelogRow {
  id: number;
  version: string;
  title: string;
  bodyMarkdown: string;
  entryType: string;
  isPublic: boolean;
  releasedAt: string | Date;
  createdAt: string | Date;
}

const ENTRY_TYPES = [
  { value: "feature", label: "New feature" },
  { value: "improvement", label: "Improvement" },
  { value: "fix", label: "Bug fix" },
  { value: "security", label: "Security" },
];

const TYPE_TONE: Record<string, "success" | "teal" | "neutral" | "danger" | "warning"> = {
  feature: "success",
  improvement: "teal",
  fix: "neutral",
  security: "danger",
  breaking: "warning",
};

const emptyForm = {
  id: null as number | null,
  version: "",
  title: "",
  bodyMarkdown: "",
  entryType: "improvement",
  isPublic: true,
};

export function AdminChangelogPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const list = trpc.admin.changelog.useQuery();
  const createMut = trpc.admin.createChangelogEntry.useMutation({
    async onSuccess() {
      toast.success("Entry published");
      setModalOpen(false);
      setForm({ ...emptyForm });
      await utils.admin.changelog.invalidate();
    },
    onError(error) {
      toast.error("Could not save entry", errorMessage(error));
    },
  });

  const rows = (list.data ?? []) as unknown as ChangelogRow[];

  function openCreate() {
    setForm({ ...emptyForm });
    setModalOpen(true);
  }

  function openEdit(row: ChangelogRow) {
    setForm({
      id: row.id,
      version: row.version,
      title: row.title,
      bodyMarkdown: row.bodyMarkdown,
      entryType: row.entryType,
      isPublic: row.isPublic,
    });
    setModalOpen(true);
  }

  function handleSave() {
    createMut.mutate({
      version: form.version.trim(),
      title: form.title.trim(),
      bodyMarkdown: form.bodyMarkdown.trim(),
      entryType: form.entryType as "feature" | "improvement" | "fix" | "security",
      isPublic: form.isPublic,
    });
  }

  return (
    <>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Edit entry" : "New changelog entry"}
        description="Published entries appear on the public changelog page."
      >
        <div className="space-y-4">
          <Input
            label="Version"
            placeholder="v2.4.0"
            required
            value={form.version}
            onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
          />
          <Input
            label="Title"
            placeholder="What changed?"
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <Select
            label="Type"
            value={form.entryType}
            onChange={(e) => setForm((f) => ({ ...f, entryType: e.target.value }))}
            options={ENTRY_TYPES}
          />
          <Textarea
            label="Details (Markdown)"
            rows={8}
            placeholder="Describe the changes in detail. Markdown is supported."
            value={form.bodyMarkdown}
            onChange={(e) => setForm((f) => ({ ...f, bodyMarkdown: e.target.value }))}
          />
          <Checkbox
            label="Visible to the public"
            checked={form.isPublic}
            onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={createMut.isPending}
              disabled={!form.version.trim() || !form.title.trim()}
              onClick={handleSave}
            >
              {form.id ? "Save changes" : "Publish entry"}
            </Button>
          </div>
        </div>
      </Modal>

      <PageHeader
        title="Changelog"
        description="Platform release notes visible to customers."
        actions={
          <Button
            onClick={openCreate}
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
          >
            New entry
          </Button>
        }
      />

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="No changelog entries"
          description="Publish your first release note to get started."
          action={
            <Button
              onClick={openCreate}
              leadingIcon={<Plus className="size-4" aria-hidden="true" />}
            >
              New entry
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Card key={row.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-muted">
                      {row.version}
                    </span>
                    <Badge tone={TYPE_TONE[row.entryType] ?? "neutral"}>
                      {ENTRY_TYPES.find((t) => t.value === row.entryType)?.label ?? row.entryType}
                    </Badge>
                    {!row.isPublic ? (
                      <Badge tone="neutral">Draft</Badge>
                    ) : null}
                    <span className="text-xs text-muted">{formatDate(row.releasedAt)}</span>
                  </div>
                  <p className="mt-1 font-semibold text-ink">{row.title}</p>
                  {row.bodyMarkdown ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{row.bodyMarkdown}</p>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
