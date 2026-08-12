import { useEffect, useState } from "react";
import { GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Field";
import { Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

type MenuEntry = { href: string; label: string; section: string; hidden: boolean; order: number; custom: boolean };

const DEFAULT_ENTRIES: MenuEntry[] = [
  ["/admin", "Dashboard", "Operations"], ["/admin/orders", "Orders", "Operations"], ["/admin/customers", "Customers", "Operations"], ["/admin/tickets", "Support", "Operations"], ["/admin/files", "Files", "Operations"],
  ["/admin/catalog", "Catalogue", "Content"], ["/admin/moderation", "Moderation", "Content"], ["/admin/content", "Site content", "Content"], ["/admin/changelog", "Changelog", "Content"], ["/admin/policy-center", "Policy center", "Content"],
  ["/admin/email-settings", "Email settings", "Email"], ["/admin/email-center", "Email Template Center", "Email"], ["/admin/email-automations", "Email automations", "Email"], ["/admin/order-automations", "Order automations", "Email"], ["/admin/question-templates", "Order Question Banks", "Email"],
  ["/admin/finance", "Finance", "Finance"], ["/admin/subscriptions", "Subscriptions", "Finance"], ["/admin/coupons", "Coupons", "Finance"], ["/admin/payouts", "Payouts", "Finance"], ["/admin/referrals", "Referrals", "Finance"], ["/admin/newsletter", "Newsletter", "Finance"],
  ["/admin/crm", "CRM", "CRM"], ["/admin/scheduling", "Scheduling", "CRM"],
  ["/admin/integrations", "Integrations", "Platform"], ["/admin/entra-setup", "Microsoft Entra ID", "Platform"], ["/admin/api-keys", "API keys", "Platform"], ["/admin/inbound-webhooks", "Inbound webhooks", "Platform"], ["/admin/outbound", "Outbound connections", "Platform"], ["/admin/ai-hub", "AI hub", "Platform"], ["/admin/ab-tests", "A/B tests", "Platform"], ["/admin/wizard-slides", "Wizard slides", "Platform"], ["/admin/announcements", "Announcements", "Platform"], ["/admin/support-permissions", "Support permissions", "Platform"], ["/admin/backups", "Backups", "Platform"], ["/admin/security", "Security centre", "Platform"], ["/admin/siem-export", "SIEM export", "Platform"], ["/admin/activity-replay", "Activity replay", "Platform"], ["/admin/login-config", "Login page", "Platform"], ["/admin/preferences", "My preferences", "Platform"], ["/admin/navigation", "Navigation menu", "Platform"], ["/admin/system", "System", "Platform"],
].map(([href, label, section], order) => ({ href: href!, label: label!, section: section!, hidden: false, order, custom: false }));

export function AdminNavigationPage() {
  const toast = useToast();
  const config = trpc.adminNavigation.get.useQuery();
  const [entries, setEntries] = useState<MenuEntry[]>(DEFAULT_ENTRIES);
  useEffect(() => { if (config.data) { const configured = new Map(config.data.map((item) => [item.href, item])); setEntries([...DEFAULT_ENTRIES.map((item) => ({ ...item, ...configured.get(item.href), custom: false })), ...config.data.filter((item) => item.custom)]); } }, [config.data]);
  const save = trpc.adminNavigation.save.useMutation({ onSuccess() { toast.success("Navigation saved", "The sidebar menu updates immediately for administrators."); }, onError(error) { toast.error("Could not save navigation", errorMessage(error)); } });
  const update = (index: number, patch: Partial<MenuEntry>) => setEntries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const addCustom = () => setEntries((items) => [...items, { href: "https://", label: "Custom link", section: "Platform", hidden: false, order: items.length, custom: true }]);
  if (config.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  return <><PageHeader title="Navigation menu" description="Customize the administration sidebar. You can rename, hide, group, reorder, and add secure custom links without changing code." actions={<Button busy={save.isPending} leadingIcon={<Save className="size-4" />} onClick={() => save.mutate({ items: entries })}>Save navigation</Button>} /><Card><CardHeader title="Menu items" description="External custom links must use HTTPS. Hiding a page only changes the navigation; the server still controls access permissions." actions={<Button variant="outline" leadingIcon={<Plus className="size-4" />} onClick={addCustom}>Add custom link</Button>} /><div className="mt-5 space-y-3">{entries.sort((a, b) => a.order - b.order).map((entry, index) => <div key={`${entry.href}-${index}`} className="grid gap-3 rounded-lg border border-line p-3 lg:grid-cols-[auto_minmax(9rem,1fr)_minmax(8rem,0.8fr)_6rem_minmax(10rem,1fr)_auto]"><GripVertical className="mt-8 size-4 text-muted" aria-hidden="true" /><Input label="Label" value={entry.label} onChange={(event) => update(index, { label: event.target.value })} /><Input label="Group" value={entry.section} onChange={(event) => update(index, { section: event.target.value })} /><Input label="Order" type="number" min={0} value={String(entry.order)} onChange={(event) => update(index, { order: Number(event.target.value) || 0 })} /><Input label="Path or HTTPS URL" value={entry.href} disabled={!entry.custom} onChange={(event) => update(index, { href: event.target.value })} /><div className="flex items-end gap-2 pb-1"><Checkbox label="Hide" checked={entry.hidden} onChange={(event) => update(index, { hidden: event.target.checked })} />{entry.custom ? <Button aria-label={`Remove ${entry.label}`} variant="ghost" onClick={() => setEntries((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4" /></Button> : null}</div></div>)}</div></Card></>;
}
