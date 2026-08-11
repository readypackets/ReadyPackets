/**
 * Admin Preferences page.
 * Allows admins to customise their nav, pinned quick-add actions, and default view.
 */
import { useState, useEffect } from "react";
import { Save, Plus, Trash2, GripVertical } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input } from "@/components/ui/Field";
import { Card, CardHeader, Alert, Skeleton } from "@/components/ui/Surface";
import { PageHeader } from "@/components/layout/PortalLayout";
import { useToast } from "@/components/ui/Toast";

const QUICK_ADD_PRESETS = [
  { actionKey: "new_order", label: "New order", href: "/admin/orders/new" },
  { actionKey: "new_customer", label: "New customer", href: "/admin/customers/new" },
  { actionKey: "new_ticket", label: "New ticket", href: "/admin/tickets/new" },
  { actionKey: "new_product", label: "New product", href: "/admin/catalog" },
];

interface QuickAddItem {
  id?: number;
  actionKey: string;
  label: string;
  href: string;
  sortOrder: number;
}

export function AdminPreferences() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const prefs = trpc.tier3.adminPrefs.getNavPrefs.useQuery();
  const quickAdd = trpc.tier3.adminPrefs.listQuickAdd.useQuery();

  const saveNavPrefs = trpc.tier3.adminPrefs.saveNavPrefs.useMutation({
    onSuccess: () => {
      utils.tier3.adminPrefs.getNavPrefs.invalidate();
      toast.success("Saved", "Navigation preferences updated.");
    },
    onError: (e) => toast.error("Error", e.message),
  });

  const upsertQuickAdd = trpc.tier3.adminPrefs.upsertQuickAdd.useMutation({
    onSuccess: () => utils.tier3.adminPrefs.listQuickAdd.invalidate(),
    onError: (e) => toast.error("Error", e.message),
  });

  const deleteQuickAdd = trpc.tier3.adminPrefs.deleteQuickAdd.useMutation({
    onSuccess: () => utils.tier3.adminPrefs.listQuickAdd.invalidate(),
    onError: (e) => toast.error("Error", e.message),
  });

  const [defaultView, setDefaultView] = useState("");
  const [newItem, setNewItem] = useState<Omit<QuickAddItem, "id" | "sortOrder">>({
    actionKey: "",
    label: "",
    href: "",
  });

  useEffect(() => {
    if (prefs.data) {
      setDefaultView(prefs.data.defaultView ?? "");
    }
  }, [prefs.data]);

  const handleSaveNavPrefs = () => {
    saveNavPrefs.mutate({ defaultView: defaultView || undefined });
  };

  const handleAddQuickAdd = () => {
    if (!newItem.label || !newItem.href) {
      toast.error("Validation", "Label and URL are required.");
      return;
    }
    const sortOrder = (quickAdd.data?.length ?? 0);
    upsertQuickAdd.mutate({
      actionKey: newItem.actionKey || `custom_${Date.now()}`,
      label: newItem.label,
      href: newItem.href,
      sortOrder,
    });
    setNewItem({ actionKey: "", label: "", href: "" });
  };

  const handleAddPreset = (preset: typeof QUICK_ADD_PRESETS[0]) => {
    const sortOrder = (quickAdd.data?.length ?? 0);
    upsertQuickAdd.mutate({ ...preset, sortOrder });
  };

  if (prefs.isLoading || quickAdd.isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <>
      <PageHeader
        title="Admin preferences"
        description="Customise your admin panel navigation and quick-add shortcuts."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Navigation preferences" />
          <div className="mt-4 space-y-4">
            <FieldShell
              label="Default view"
              help="The page shown when you first open the admin panel. Leave blank for the dashboard."
            >
              <Input
                value={defaultView}
                onChange={(e) => setDefaultView(e.target.value)}
                placeholder="/admin/orders"
              />
            </FieldShell>
            <Button
              onClick={handleSaveNavPrefs}
              busy={saveNavPrefs.isPending}
              leadingIcon={<Save className="size-4" aria-hidden="true" />}
            >
              Save preferences
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Quick-add shortcuts" description="Shortcuts shown in the admin sidebar for fast access." />
          <div className="mt-4 space-y-3">
            {(quickAdd.data ?? []).length === 0 ? (
              <p className="text-sm text-muted">No shortcuts yet. Add one below or use a preset.</p>
            ) : (
              <ul className="space-y-2">
                {(quickAdd.data ?? []).map((item) => (
                  <li key={item.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-soft px-3 py-2">
                    <GripVertical className="size-4 text-muted" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{item.label}</p>
                      <p className="text-xs text-muted truncate">{item.href}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      leadingIcon={<Trash2 className="size-3.5" aria-hidden="true" />}
                      onClick={() => deleteQuickAdd.mutate({ id: item.id })}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-line pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Presets</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_ADD_PRESETS.map((preset) => (
                  <Button
                    key={preset.actionKey}
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddPreset(preset)}
                  >
                    + {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="border-t border-line pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Custom shortcut</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={newItem.label}
                  onChange={(e) => setNewItem((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="Label"
                />
                <Input
                  value={newItem.href}
                  onChange={(e) => setNewItem((prev) => ({ ...prev, href: e.target.value }))}
                  placeholder="/admin/..."
                />
              </div>
              <Button
                className="mt-2"
                size="sm"
                onClick={handleAddQuickAdd}
                busy={upsertQuickAdd.isPending}
                leadingIcon={<Plus className="size-4" aria-hidden="true" />}
              >
                Add shortcut
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Alert tone="info" title="Preferences are per-admin">
          These settings are saved to your account and do not affect other administrators.
        </Alert>
      </div>
    </>
  );
}
