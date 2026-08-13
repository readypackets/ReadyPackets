import { useState } from "react";
import { BarChart3, Download, FilePlus2, Save, Trash2 } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Alert, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { TabStrip } from "@/components/ui/DataDisplay";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

type ReportConfig = {
  dataset: "orders" | "customers";
  from?: string;
  to?: string;
  orderStatus?: string;
  paymentStatus?: string;
  customerStatus?: string;
};

const blankConfig: ReportConfig = { dataset: "orders" };

function csvCell(value: unknown) {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(name: string, columns: string[], rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] ?? {});
  const content = [columns.map(csvCell).join(","), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SummaryTable({ title, rows, money }: { title: string; rows: Array<{ label: string; count: number; totalCents?: number }>; money?: boolean }) {
  return <Card><CardHeader title={title} />{rows.length === 0 ? <p className="mt-4 text-sm text-muted">No report data is available.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wide text-muted"><tr><th className="px-2 py-2 font-medium">Category</th><th className="px-2 py-2 text-right font-medium">Records</th>{money ? <th className="px-2 py-2 text-right font-medium">Order value</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.label} className="border-b border-line/70 last:border-0"><td className="px-2 py-2.5 font-medium text-ink">{row.label.replaceAll("_", " ")}</td><td className="px-2 py-2.5 text-right tabular-nums text-body">{row.count}</td>{money ? <td className="px-2 py-2.5 text-right font-medium tabular-nums text-ink">{formatMoney(row.totalCents ?? 0)}</td> : null}</tr>)}</tbody></table></div>}</Card>;
}

export function AdminReportsPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("standard");
  const [editingId, setEditingId] = useState<number | undefined>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [config, setConfig] = useState<ReportConfig>(blankConfig);
  const [previewConfig, setPreviewConfig] = useState<ReportConfig | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const standard = trpc.admin.standardReports.useQuery();
  const saved = trpc.admin.customReports.useQuery();
  const preview = trpc.admin.runCustomReport.useQuery({ config: previewConfig ?? blankConfig }, { enabled: previewConfig !== null });
  const save = trpc.admin.saveCustomReport.useMutation({
    async onSuccess() {
      await saved.refetch();
      toast.success(editingId ? "Custom report updated" : "Custom report saved");
    },
    onError(error) { toast.error("Could not save custom report", errorMessage(error)); },
  });
  const remove = trpc.admin.deleteCustomReport.useMutation({
    async onSuccess() { setDeleteId(null); await saved.refetch(); toast.success("Custom report deleted"); },
    onError(error) { toast.error("Could not delete custom report", errorMessage(error)); },
  });

  const updateConfig = (patch: Partial<ReportConfig>) => setConfig((current) => ({ ...current, ...patch }));
  const loadReport = (report: { id: number; name: string; description: string | null; config: ReportConfig }) => {
    setEditingId(report.id); setName(report.name); setDescription(report.description ?? ""); setConfig(report.config); setPreviewConfig(report.config); setTab("custom");
  };
  const newReport = () => { setEditingId(undefined); setName(""); setDescription(""); setConfig(blankConfig); setPreviewConfig(null); setTab("custom"); };
  const previewRows = (preview.data?.rows ?? []) as Array<Record<string, unknown>>;

  return <>
    <PageHeader title="Reports" description="Review operational standards and create saved, exportable reports from approved platform data." actions={<Button onClick={newReport} leadingIcon={<FilePlus2 className="size-4" />}>New custom report</Button>} />
    <TabStrip tabs={[{ id: "standard", label: "Standard reports" }, { id: "custom", label: "Custom reports" }]} active={tab} onChange={setTab} />

    {tab === "standard" ? <div className="mt-6 space-y-6">{standard.isLoading ? <Skeleton className="h-72 w-full" /> : <><Alert tone="info">Standard reports use live platform data and exclude records currently in trash.</Alert><div className="grid gap-6 xl:grid-cols-2"><SummaryTable title="Order pipeline" rows={standard.data?.orderPipeline ?? []} money /><SummaryTable title="Payment summary" rows={standard.data?.paymentSummary ?? []} money /><SummaryTable title="Customer accounts" rows={standard.data?.customerAccounts ?? []} /></div></>}</div> : null}

    {tab === "custom" ? <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
      <div className="space-y-6"><Card><CardHeader title={editingId ? "Edit custom report" : "Create custom report"} description="Report filters are validated server-side and never execute arbitrary queries." /><div className="mt-4 space-y-4"><Input label="Report name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Open orders needing attention" /><Textarea label="Description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional operating purpose" /><Select label="Dataset" value={config.dataset} onChange={(event) => updateConfig({ dataset: event.target.value as ReportConfig["dataset"], orderStatus: undefined, paymentStatus: undefined, customerStatus: undefined })} options={[{ value: "orders", label: "Orders" }, { value: "customers", label: "Customers" }]} /><div className="grid gap-4 sm:grid-cols-2"><Input label="From date" type="date" value={config.from ?? ""} onChange={(event) => updateConfig({ from: event.target.value || undefined })} /><Input label="To date" type="date" value={config.to ?? ""} onChange={(event) => updateConfig({ to: event.target.value || undefined })} /></div>{config.dataset === "orders" ? <div className="grid gap-4 sm:grid-cols-2"><Select label="Order status" value={config.orderStatus ?? ""} onChange={(event) => updateConfig({ orderStatus: event.target.value || undefined })} options={[{ value: "", label: "All statuses" }, { value: "new", label: "New" }, { value: "phase_1", label: "Phase 1" }, { value: "phase_2", label: "Phase 2" }, { value: "in_production", label: "In production" }, { value: "delivered", label: "Delivered" }, { value: "closed", label: "Closed" }]} /><Select label="Payment status" value={config.paymentStatus ?? ""} onChange={(event) => updateConfig({ paymentStatus: event.target.value || undefined })} options={[{ value: "", label: "All payment states" }, { value: "unpaid", label: "Unpaid" }, { value: "processing", label: "Processing" }, { value: "paid", label: "Paid" }, { value: "failed", label: "Failed" }, { value: "refunded", label: "Refunded" }]} /></div> : <Select label="Customer account status" value={config.customerStatus ?? ""} onChange={(event) => updateConfig({ customerStatus: event.target.value || undefined })} options={[{ value: "", label: "All active customer accounts" }, { value: "active", label: "Active" }, { value: "deactivated", label: "Disabled" }, { value: "suspended", label: "Suspended" }]} />}</div><div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => setPreviewConfig(config)} leadingIcon={<BarChart3 className="size-4" />}>Preview</Button><Button disabled={name.trim().length < 2} busy={save.isPending} onClick={() => save.mutate({ id: editingId, name: name.trim(), description: description.trim() || undefined, config })} leadingIcon={<Save className="size-4" />}>Save report</Button></div></Card><Card><CardHeader title="Saved custom reports" />{saved.isLoading ? <Skeleton className="mt-4 h-32 w-full" /> : (saved.data ?? []).length === 0 ? <p className="mt-4 text-sm text-muted">No custom reports have been saved yet.</p> : <ul className="mt-4 divide-y divide-line">{(saved.data ?? []).map((report) => <li key={report.id} className="flex items-center justify-between gap-3 py-3"><button type="button" className="min-w-0 text-left" onClick={() => loadReport(report)}><p className="truncate text-sm font-medium text-ink">{report.name}</p><p className="mt-0.5 truncate text-xs text-muted">{report.dataset} · updated {formatDate(report.updatedAt)}</p></button><Button size="sm" variant="danger" aria-label={`Delete ${report.name}`} onClick={() => setDeleteId(report.id)}><Trash2 className="size-3.5" /></Button></li>)}</ul>}</Card></div>
      <Card><CardHeader title="Report preview" description="Preview is limited to 2,000 records. Download creates a local CSV file." actions={previewRows.length > 0 ? <Button size="sm" variant="outline" onClick={() => downloadCsv(name || "custom-report", preview.data?.columns ?? [], previewRows)} leadingIcon={<Download className="size-3.5" />}>CSV</Button> : undefined} />{previewConfig === null ? <EmptyState icon={BarChart3} title="Configure a report" description="Choose a dataset and filters, then select Preview." /> : preview.isLoading ? <Skeleton className="mt-4 h-72 w-full" /> : previewRows.length === 0 ? <EmptyState icon={BarChart3} title="No matching records" description="Broaden the selected filters or choose another date range." /> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wide text-muted"><tr>{(preview.data?.columns ?? []).map((column) => <th key={column} className="px-2 py-2 font-medium">{column}</th>)}</tr></thead><tbody>{previewRows.map((row, index) => <tr key={index} className="border-b border-line/70 last:border-0">{Object.values(row).map((value, columnIndex) => <td key={columnIndex} className="px-2 py-2.5 text-body">{typeof value === "number" && String(preview.data?.columns?.[columnIndex] ?? "").toLowerCase().includes("total") ? formatMoney(value) : value instanceof Date ? formatDate(value) : String(value ?? "—")}</td>)}</tr>)}</tbody></table></div>}</Card>
    </div> : null}
    <ConfirmDialog open={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId !== null) remove.mutate({ id: deleteId }); }} title="Delete custom report?" message="This removes the saved report definition only. It does not change any orders, customers, or source records." confirmLabel="Delete report" variant="danger" busy={remove.isPending} />
  </>;
}
