/**
 * Admin Portal Wizard Slides page — manage onboarding wizard content.
 */
import { useState } from "react";
import { GripVertical, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/Surface";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

type Slide = { id: number; title: string; subtitle: string | null; bodyMarkdown: string | null; imageUrl: string | null; ctaLabel: string | null; ctaHref: string | null; sortOrder: number; isActive: boolean; targetAudience: string };

const emptyForm = { id: undefined as number | undefined, title: "", subtitle: "", bodyMarkdown: "", imageUrl: "", ctaLabel: "", ctaHref: "", sortOrder: 0, isActive: true, targetAudience: "all" as "all" | "new" | "returning" };

export function AdminWizardSlides() {
  const toast = useToast();
  const [editSlide, setEditSlide] = useState<typeof emptyForm | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [forceAllOpen, setForceAllOpen] = useState(false);

  const slides = trpc.tier3.wizardSlides.listSlides.useQuery();
  const utils = trpc.useUtils();

  const upsert = trpc.tier3.wizardSlides.upsertSlide.useMutation({
    onSuccess: () => { utils.tier3.wizardSlides.listSlides.invalidate(); setEditSlide(null); toast.success(editSlide?.id ? "Slide updated" : "Slide created"); },
    onError: (e) => toast.error("Error", e.message),
  });
  const forceAll = trpc.admin.forceAllCustomerOnboarding.useMutation({
    onSuccess: (result) => { setForceAllOpen(false); toast.success(`Onboarding replay required for ${result.count} customer(s)`); },
    onError: (e) => toast.error("Could not force onboarding replay", e.message),
  });
  const deleteSlide = trpc.tier3.wizardSlides.deleteSlide.useMutation({
    onSuccess: () => { utils.tier3.wizardSlides.listSlides.invalidate(); setDeleteId(null); toast.success("Slide deleted"); },
  });

  const slideList = slides.data ?? [];
  const previewSlide = previewId !== null ? slideList.find((s) => s.id === previewId) : null;

  function openEdit(slide?: Slide) {
    setEditSlide(slide ? { id: slide.id, title: slide.title, subtitle: slide.subtitle ?? "", bodyMarkdown: slide.bodyMarkdown ?? "", imageUrl: slide.imageUrl ?? "", ctaLabel: slide.ctaLabel ?? "", ctaHref: slide.ctaHref ?? "", sortOrder: slide.sortOrder, isActive: slide.isActive, targetAudience: slide.targetAudience as "all" | "new" | "returning" } : { ...emptyForm });
  }

  return (
    <>
      <PageHeader
        title="Portal wizard slides"
        description="Manage the onboarding wizard slides shown to new customers."
        actions={<div className="flex gap-2"><Button variant="outline" onClick={() => setForceAllOpen(true)}>Require all customers to replay</Button><Button onClick={() => openEdit()} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>New slide</Button></div>}
      />

      {slideList.length === 0 ? (
        <Card><EmptyState icon={GripVertical} title="No slides" description="Create slides to guide new customers through the onboarding wizard." /></Card>
      ) : (
        <div className="space-y-3">
          {slideList.map((slide, idx) => (
            <Card key={slide.id} className="flex items-center gap-4 p-4">
              <span className="text-muted text-sm font-mono w-6 shrink-0">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink text-sm">{slide.title}</span>
                  <Badge tone={slide.isActive ? "success" : "neutral"}>{slide.isActive ? "Active" : "Inactive"}</Badge>
                  <Badge>{slide.targetAudience}</Badge>
                </div>
                {slide.subtitle && <p className="text-sm text-body mt-0.5 truncate">{slide.subtitle}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="ghost" leadingIcon={<Eye className="size-4" aria-hidden="true" />} onClick={() => setPreviewId(slide.id)}>Preview</Button>
                <Button size="sm" variant="ghost" leadingIcon={<Pencil className="size-4" aria-hidden="true" />} onClick={() => openEdit(slide)}>Edit</Button>
                <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setDeleteId(slide.id)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/create modal */}
      {editSlide !== null && (
        <Modal open onClose={() => setEditSlide(null)} title={editSlide.id ? "Edit slide" : "New slide"} size="lg">
          <div className="space-y-4">
            <FieldShell label="Title" required><Input value={editSlide.title} onChange={(e) => setEditSlide((f) => f && ({ ...f, title: e.target.value }))} /></FieldShell>
            <FieldShell label="Subtitle"><Input value={editSlide.subtitle} onChange={(e) => setEditSlide((f) => f && ({ ...f, subtitle: e.target.value }))} /></FieldShell>
            <FieldShell label="Body (Markdown)"><Textarea value={editSlide.bodyMarkdown} onChange={(e) => setEditSlide((f) => f && ({ ...f, bodyMarkdown: e.target.value }))} rows={5} /></FieldShell>
            <div className="grid grid-cols-2 gap-4">
              <FieldShell label="Image URL"><Input value={editSlide.imageUrl} onChange={(e) => setEditSlide((f) => f && ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" /></FieldShell>
              <FieldShell label="Sort order"><Input type="number" min={0} value={editSlide.sortOrder} onChange={(e) => setEditSlide((f) => f && ({ ...f, sortOrder: +e.target.value }))} /></FieldShell>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FieldShell label="CTA label"><Input value={editSlide.ctaLabel} onChange={(e) => setEditSlide((f) => f && ({ ...f, ctaLabel: e.target.value }))} placeholder="Get started" /></FieldShell>
              <FieldShell label="CTA link"><Input value={editSlide.ctaHref} onChange={(e) => setEditSlide((f) => f && ({ ...f, ctaHref: e.target.value }))} placeholder="/portal/orders/new" /></FieldShell>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FieldShell label="Target audience">
                <Select value={editSlide.targetAudience} onChange={(e) => setEditSlide((f) => f && ({ ...f, targetAudience: e.target.value as "all" | "new" | "returning" }))}>
                  <option value="all">All users</option>
                  <option value="new">New users only</option>
                  <option value="returning">Returning users only</option>
                </Select>
              </FieldShell>
              <FieldShell label="Status">
                <Select value={editSlide.isActive ? "active" : "inactive"} onChange={(e) => setEditSlide((f) => f && ({ ...f, isActive: e.target.value === "active" }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </FieldShell>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditSlide(null)}>Cancel</Button>
              <Button onClick={() => upsert.mutate({ ...editSlide, subtitle: editSlide.subtitle || undefined, bodyMarkdown: editSlide.bodyMarkdown || undefined, imageUrl: editSlide.imageUrl || undefined, ctaLabel: editSlide.ctaLabel || undefined, ctaHref: editSlide.ctaHref || undefined })} busy={upsert.isPending} disabled={!editSlide.title}>Save</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Preview modal */}
      {previewSlide && (
        <Modal open onClose={() => setPreviewId(null)} title="Slide preview" size="md">
          <div className="rounded-xl border border-line overflow-hidden">
            {previewSlide.imageUrl && <img src={previewSlide.imageUrl} alt="" className="w-full h-48 object-cover" />}
            <div className="p-6">
              <h2 className="text-xl font-bold text-ink">{previewSlide.title}</h2>
              {previewSlide.subtitle && <p className="mt-2 text-body">{previewSlide.subtitle}</p>}
              {previewSlide.bodyMarkdown && <p className="mt-3 text-sm text-body whitespace-pre-wrap">{previewSlide.bodyMarkdown}</p>}
              {previewSlide.ctaLabel && (
                <div className="mt-4">
                  <span className="inline-flex items-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white">{previewSlide.ctaLabel}</span>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog open={forceAllOpen} onClose={() => setForceAllOpen(false)} onConfirm={() => forceAll.mutate()} title="Require onboarding replay for all customers?" message="Every active customer will be shown the onboarding wizard again when they next enter the customer portal." confirmLabel="Require replay" variant="primary" busy={forceAll.isPending} />

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId !== null) deleteSlide.mutate({ id: deleteId }); }}
        title="Delete slide"
        message="This will permanently delete this wizard slide."
        confirmLabel="Delete"
        variant="danger"
        busy={deleteSlide.isPending}
      />
    </>
  );
}
