import { useState } from "react";
import { Building2, Plus, UserPlus } from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";

export function WorkspacesPage() {
  const toast = useToast();
  const workspaces = trpc.orders.workspaces.useQuery();
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("contributor");

  const createWorkspace = trpc.orders.createWorkspace.useMutation({
    async onSuccess() {
      setWorkspaceName("");
      await workspaces.refetch();
      toast.success("Packet Collective created", "You are the organization owner and can now invite customer accounts.");
    },
    onError(error) { toast.error("Could not create Packet Collective", errorMessage(error)); },
  });
  const addMember = trpc.orders.addWorkspaceMember.useMutation({
    onSuccess() { setInviteEmail(""); toast.success("Member invited", "The customer account now has access to this Packet Collective."); },
    onError(error) { toast.error("Could not add member", errorMessage(error)); },
  });

  if (workspaces.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  return <>
    <PageHeader title="Packet Collective" description="Create an organization workspace for founders, team members, and collaborators to work together on ReadyPackets orders." />
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader title="Your workspaces" description="Workspace owners can share an order with every active member from the order page." />
        <div className="mt-4 space-y-3">
          {(workspaces.data ?? []).length === 0 ? <EmptyState icon={Building2} title="No Packet Collectives yet" description="Create one to organize collaboration around your business packets." /> : workspaces.data?.map((workspace) => <div key={workspace.id} className="rounded-lg border border-line p-4"><p className="font-semibold text-ink">{workspace.name}</p><p className="mt-1 text-xs text-muted">Role: {workspace.role} · Reference: {workspace.slug}</p></div>)}
        </div>
      </Card>
      <div className="space-y-6">
        <Card><CardHeader title="Create a workspace" description="Give your organization a clear, recognizable name." /><div className="mt-4 space-y-3"><Input label="Workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Acme Ventures" /><Button fullWidth busy={createWorkspace.isPending} disabled={workspaceName.trim().length < 2} leadingIcon={<Plus className="size-4" />} onClick={() => createWorkspace.mutate({ name: workspaceName })}>Create Packet Collective</Button></div></Card>
        <Card><CardHeader title="Invite a member" description="The recipient must already have an active ReadyPackets customer account." /><div className="mt-4 space-y-3"><Select label="Packet Collective" value={inviteWorkspaceId} onChange={(event) => setInviteWorkspaceId(event.target.value)} options={[{ value: "", label: "Select a workspace" }, ...(workspaces.data ?? []).filter((workspace) => workspace.role === "owner").map((workspace) => ({ value: String(workspace.id), label: workspace.name }))]} /><Input label="Customer email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="team@example.com" /><Select label="Role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} options={[{ value: "viewer", label: "Viewer" }, { value: "contributor", label: "Contributor" }, { value: "manager", label: "Manager" }]} /><Button fullWidth busy={addMember.isPending} disabled={!inviteWorkspaceId || !inviteEmail.trim()} leadingIcon={<UserPlus className="size-4" />} onClick={() => addMember.mutate({ workspaceId: Number(inviteWorkspaceId), email: inviteEmail, role: inviteRole as "viewer" | "contributor" | "manager" })}>Add member</Button></div></Card>
      </div>
    </div>
  </>;
}
