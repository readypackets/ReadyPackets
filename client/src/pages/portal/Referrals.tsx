import { CheckCircle2, ClipboardCopy, Clock, Gift, Link as LinkIcon, Mail, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Skeleton } from "@/components/ui/Surface";
import { StatTile } from "@/components/ui/DataDisplay";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

export function ReferralsPage() {
  const toast = useToast();
  const code = trpc.tier4.referral.myCode.useQuery();
  const stats = trpc.tier4.referral.myStats.useQuery();
  const referralLink = code.data?.code
    ? `${window.location.origin}/register?ref=${encodeURIComponent(code.data.code)}`
    : "";

  async function copy(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied", `${label} copied to your clipboard.`);
    } catch {
      toast.error("Copy failed", `Could not copy the ${label.toLowerCase()}.`);
    }
  }

  function composeEmail() {
    if (!referralLink || !code.data?.code) return;
    const subject = "A ReadyPackets referral for you";
    const body = `I thought ReadyPackets may be helpful for your business. Use my referral code ${code.data.code} at checkout, or start here: ${referralLink}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <>
      <PageHeader title="Referrals" description="Share ReadyPackets, track referral activity, and monitor rewards." />
      <Card className="border-gold/35">
        <CardHeader title={<span className="flex items-center gap-2"><Gift className="size-5 text-gold" aria-hidden="true" />Your referral code</span>} description="Share your code or referral link. Rewards are recorded after an eligible referred order is paid." />
        {code.isLoading ? <Skeleton className="mt-5 h-12 w-full" /> : <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="flex-1 rounded-lg border border-line bg-surface-sunken px-4 py-3 font-mono text-lg font-semibold tracking-wide text-ink">{code.data?.code ?? "—"}</code>
            <Button variant="outline" onClick={() => void copy(code.data?.code ?? "", "Referral code")} leadingIcon={<ClipboardCopy className="size-4" aria-hidden="true" />}>Copy code</Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input aria-label="Referral web link" readOnly value={referralLink} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-body" />
            <Button variant="outline" onClick={() => void copy(referralLink, "Referral link")} leadingIcon={<LinkIcon className="size-4" aria-hidden="true" />}>Copy link</Button>
            <Button onClick={composeEmail} leadingIcon={<Mail className="size-4" aria-hidden="true" />}>Email referral</Button>
          </div>
        </div>}
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.isLoading ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />) : <>
          <StatTile label="Total referrals" value={stats.data?.total ?? 0} icon={Users} tone="teal" />
          <StatTile label="Pending review" value={stats.data?.pending ?? 0} icon={Clock} tone="warning" />
          <StatTile label="Approved" value={stats.data?.approved ?? 0} icon={CheckCircle2} tone="success" />
          <StatTile label="Reward value" value={formatMoney(stats.data?.totalRewardCents ?? 0)} icon={Gift} tone="gold" hint={`${formatMoney(stats.data?.paidRewardCents ?? 0)} paid`} />
        </>}
      </div>
    </>
  );
}
