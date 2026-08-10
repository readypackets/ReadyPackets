/**
 * Account settings: profile detail, notification preferences, data export, and
 * the account deletion request.
 *
 * The export is assembled by the server and written to a file in the browser, so
 * the data never transits a third party. Deletion is a request rather than an
 * immediate purge, because retention obligations attached to signed agreements
 * and delivered work have to be reviewed first.
 */
import { useEffect, useState } from "react";
import { Download, Save, Trash2, UserCog } from "lucide-react";
import { BRAND } from "@shared/brand";
import { trpc, errorMessage } from "@/lib/trpc";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Field";
import { Alert, Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

const CHANNEL_LABELS: Record<string, { title: string; detail: string }> = {
  order_status: {
    title: "Order status changes",
    detail: "When your order moves between phases or a delivery date changes.",
  },
  deliverable_ready: {
    title: "New deliverables",
    detail: "When a file is published to one of your orders.",
  },
  ticket_reply: {
    title: "Support replies",
    detail: "When our team replies to one of your support tickets.",
  },
  forum_reply: {
    title: "Community replies",
    detail: "When someone replies to a topic you started.",
  },
  product_updates: {
    title: "Product updates",
    detail: "Occasional notes about new packets and portal features.",
  },
  maintenance_notices: {
    title: "Maintenance notices",
    detail: "Advance warning of scheduled maintenance windows.",
  },
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

export function ProfilePage() {
  const session = useSession();
  const toast = useToast();
  const channels = trpc.account.notificationChannels.useQuery();
  const customFields = trpc.account.profileFields.useQuery();

  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    preferredName: "",
    suffix: "",
    company: "",
    phone: "",
    address: "",
    timezone: "America/New_York",
    marketingOptIn: false,
  });
  const [hydrated, setHydrated] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (hydrated || !session.user) return;
    setHydrated(true);
    setForm((current) => ({
      ...current,
      firstName: session.user?.firstName ?? "",
      lastName: session.user?.lastName ?? "",
      preferredName: session.user?.preferredName ?? "",
      company: session.user?.company ?? "",
      timezone: session.user?.timezone ?? "America/New_York",
    }));
  }, [session.user, hydrated]);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    async onSuccess() {
      await session.refresh();
      toast.success("Profile updated");
    },
    onError(error) {
      toast.error("Could not save your profile", errorMessage(error));
    },
  });

  const setPreference = trpc.account.setNotificationPreference.useMutation({
    async onSuccess() {
      await channels.refetch();
    },
    onError(error) {
      toast.error("Could not update that preference", errorMessage(error));
    },
  });

  const exportData = trpc.account.exportData.useMutation({
    onSuccess(data) {
      setExporting(false);
      // Serialise in the browser: the payload never touches a third-party service.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `readypackets-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready", "Your data has been downloaded as a JSON file.");
    },
    onError(error) {
      setExporting(false);
      toast.error("Export failed", errorMessage(error));
    },
  });

  const requestDeletion = trpc.account.requestDeletion.useMutation({
    async onSuccess() {
      setDeleteOpen(false);
      toast.info(
        "Deletion requested",
        "Your account has been deactivated and a compliance review has been queued.",
      );
      await session.refresh();
    },
    onError(error) {
      toast.error("Could not submit your request", errorMessage(error));
    },
  });

  const update = <Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <>
      <PageHeader
        title="Account settings"
        description="Your contact detail, how we notify you, and your data rights."
      />

      <div className="grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <UserCog className="size-4 text-teal" aria-hidden="true" />
                  Profile
                </span>
              }
              description="Used on agreements and correspondence, so please keep it accurate."
            />

            <form
              className="mt-5 space-y-5"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                updateProfile.mutate({
                  firstName: form.firstName.trim() || undefined,
                  middleName: form.middleName.trim() || undefined,
                  lastName: form.lastName.trim() || undefined,
                  preferredName: form.preferredName.trim() || undefined,
                  suffix: form.suffix.trim() || undefined,
                  company: form.company.trim() || undefined,
                  phone: form.phone.trim() || undefined,
                  address: form.address.trim() || undefined,
                  timezone: form.timezone || undefined,
                  marketingOptIn: form.marketingOptIn,
                });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="First name"
                  value={form.firstName}
                  onChange={(event) => update("firstName", event.target.value)}
                  autoComplete="given-name"
                  maxLength={80}
                />
                <Input
                  label="Last name"
                  value={form.lastName}
                  onChange={(event) => update("lastName", event.target.value)}
                  autoComplete="family-name"
                  maxLength={80}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Middle name"
                  help="Optional"
                  value={form.middleName}
                  onChange={(event) => update("middleName", event.target.value)}
                  maxLength={80}
                />
                <Input
                  label="Preferred name"
                  help="How we address you"
                  value={form.preferredName}
                  onChange={(event) => update("preferredName", event.target.value)}
                  maxLength={80}
                />
                <Input
                  label="Suffix"
                  help="e.g. Jr., PhD"
                  value={form.suffix}
                  onChange={(event) => update("suffix", event.target.value)}
                  maxLength={80}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Company"
                  value={form.company}
                  onChange={(event) => update("company", event.target.value)}
                  autoComplete="organization"
                  maxLength={160}
                />
                <Input
                  label="Phone"
                  type="tel"
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  autoComplete="tel"
                  maxLength={40}
                />
              </div>

              <Textarea
                label="Address"
                help="Optional. Used only where an agreement requires it."
                value={form.address}
                onChange={(event) => update("address", event.target.value)}
                rows={3}
                maxLength={400}
              />

              <Select
                label="Time zone"
                help="Used when we schedule your Phase II call."
                value={form.timezone}
                onChange={(event) => update("timezone", event.target.value)}
                options={TIMEZONES.map((zone) => ({ value: zone, label: zone }))}
              />

              <Checkbox
                label="Send me occasional updates about new packets and guidance."
                checked={form.marketingOptIn}
                onChange={(event) => update("marketingOptIn", event.target.checked)}
              />

              <Button
                type="submit"
                busy={updateProfile.isPending}
                leadingIcon={<Save className="size-4" aria-hidden="true" />}
              >
                Save changes
              </Button>
            </form>

            <div className="mt-6 border-t border-line pt-5">
              <p className="text-sm text-body">
                Your email address is {session.user?.email}. To change it, please{" "}
                <a href={`mailto:${BRAND.emails.general}`}>contact us</a> — we verify address changes
                manually to prevent account takeover.
              </p>
            </div>
          </Card>

          {Object.keys(customFields.data ?? {}).length > 0 ? (
            <Card>
              <CardHeader
                title="Additional information"
                description="Fields collected during registration."
              />
              <dl className="mt-4 space-y-3 text-sm">
                {Object.entries(customFields.data ?? {}).map(([fieldKey, value]) => (
                  <div key={fieldKey} className="flex justify-between gap-3">
                    <dt className="text-muted">{fieldKey.replace(/_/g, " ")}</dt>
                    <dd className="text-right text-ink">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Notifications"
              description="Transactional messages about your orders are always sent."
            />
            {channels.isLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <ul className="mt-4 space-y-4">
                {(channels.data ?? []).map((channel) => {
                  const meta = CHANNEL_LABELS[channel.channel];
                  return (
                    <li key={channel.channel}>
                      <Checkbox
                        label={
                          <span>
                            <span className="block font-medium text-ink">
                              {meta?.title ?? channel.channel}
                            </span>
                            {meta?.detail ? (
                              <span className="mt-0.5 block text-xs text-muted">{meta.detail}</span>
                            ) : null}
                          </span>
                        }
                        checked={channel.enabled}
                        onChange={(event) =>
                          setPreference.mutate({
                            channel: channel.channel as never,
                            enabled: event.target.checked,
                          })
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Your data"
              description="Exercise your rights under our privacy policy at any time."
            />
            <div className="mt-4 space-y-3">
              <Button
                variant="outline"
                fullWidth
                busy={exporting}
                onClick={() => {
                  setExporting(true);
                  exportData.mutate();
                }}
                leadingIcon={<Download className="size-4" aria-hidden="true" />}
              >
                Download my data
              </Button>
              <p className="text-xs leading-relaxed text-muted">
                Includes your profile, orders, intake answers, tickets, reviews, agreement records,
                and shared notes, as machine-readable JSON.
              </p>
            </div>
          </Card>

          <Card className="border-danger/30">
            <CardHeader
              title="Delete my account"
              description="This deactivates your account immediately and queues a retention review."
            />
            <Button
              variant="danger"
              fullWidth
              className="mt-4"
              onClick={() => setDeleteOpen(true)}
              leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
            >
              Request account deletion
            </Button>
          </Card>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Request account deletion"
        description="Your account will be deactivated at once. Records we are legally required to retain, such as signed agreements and completed engagements, are kept for the period set out in the privacy policy."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={requestDeletion.isPending}
              disabled={deletePhrase !== "DELETE MY ACCOUNT"}
              onClick={() =>
                requestDeletion.mutate({
                  confirmPhrase: "DELETE MY ACCOUNT",
                  reason: deleteReason.trim() || undefined,
                })
              }
            >
              Delete my account
            </Button>
          </>
        }
      >
        <Alert tone="danger" title="This cannot be undone from the portal">
          If you have open orders, deletion will be reviewed against the refund policy before any
          data is removed. You will receive written confirmation either way.
        </Alert>

        <Input
          label="Type DELETE MY ACCOUNT to confirm"
          className="mt-4"
          value={deletePhrase}
          onChange={(event) => setDeletePhrase(event.target.value)}
          autoComplete="off"
        />

        <Textarea
          label="Reason"
          help="Optional, but it helps us improve."
          className="mt-4"
          rows={3}
          maxLength={2000}
          value={deleteReason}
          onChange={(event) => setDeleteReason(event.target.value)}
        />
      </Modal>
    </>
  );
}
