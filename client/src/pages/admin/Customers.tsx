/**
 * Admin customer directory and customer detail.
 *
 * Email search runs against the blind index on the server: the plaintext address
 * is never stored, yet an exact-match lookup is still possible. Role and status
 * changes are restricted to administrators and always audited.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Save,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { trpc, errorMessage } from "@/lib/trpc";
import { useSession } from "@/lib/session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  type BadgeTone,
} from "@/components/ui/Surface";
import { DataTable, type Column } from "@/components/ui/DataDisplay";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PortalLayout";
import { STATUS_LABELS, STATUS_TONES } from "../portal/orderStatus";

const USER_STATUS_TONES: Record<string, BadgeTone> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  deactivated: "neutral",
  locked: "danger",
};

const ROLE_TONES: Record<string, BadgeTone> = {
  admin: "danger",
  staff: "teal",
  customer: "neutral",
};

interface CustomerRow {
  id: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | Date | null;
  createdAt: string | Date;
}

export function AdminCustomersPage() {
  const session = useSession();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const customers = trpc.admin.customers.useQuery({
    search: search.trim() || undefined,
    role: (role || undefined) as never,
    status: status || undefined,
    limit: 200,
    offset: 0,
  });

  const [staffEmail, setStaffEmail] = useState("");
  const [staffFirstName, setStaffFirstName] = useState("");
  const [staffLastName, setStaffLastName] = useState("");
  const [staffRole, setStaffRole] = useState("staff");
  const [createError, setCreateError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const createStaff = trpc.admin.createStaffAccount.useMutation({
    async onSuccess(result) {
      setCreateOpen(false);
      setIssued({ email: staffEmail.trim(), password: result.temporaryPassword });
      setStaffEmail("");
      setStaffFirstName("");
      setStaffLastName("");
      await customers.refetch();
      toast.success("Account created", "Share the temporary password over a secure channel.");
    },
    onError(error) {
      setCreateError(errorMessage(error));
    },
  });

  const rows = (customers.data ?? []) as unknown as CustomerRow[];

  const columns: Column<CustomerRow>[] = [
    {
      key: "person",
      header: "Customer",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{row.email}</p>
          {row.company ? (
            <p className="mt-0.5 truncate text-xs text-muted">{row.company}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      hideOnMobile: true,
      cell: (row) => <Badge tone={ROLE_TONES[row.role] ?? "neutral"}>{row.role}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      hideOnMobile: true,
      cell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={USER_STATUS_TONES[row.status] ?? "neutral"}>{row.status}</Badge>
          {row.emailVerified ? null : <Badge tone="warning">unverified</Badge>}
          {row.mfaEnabled ? (
            <Badge tone="success">
              <ShieldCheck className="mr-1 size-3" aria-hidden="true" />
              MFA
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "lastLogin",
      header: "Last sign-in",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-xs text-muted">
          {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "never"}
        </span>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      align: "right",
      cell: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "go",
      header: <span className="sr-only">Open</span>,
      align: "right",
      cell: (row) => (
        <Link
          href={`/admin/customers/${row.id}`}
          className="text-sm font-semibold text-teal-dark no-underline hover:text-teal"
        >
          Open
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Every account on the platform, including staff and administrators."
        actions={
          session.isAdmin ? (
            <Button
              onClick={() => setCreateOpen(true)}
              leadingIcon={<UserPlus className="size-4" aria-hidden="true" />}
            >
              New staff account
            </Button>
          ) : null
        }
      />

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Search"
            help="Exact email, or partial name and company"
            placeholder="name@example.com"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leadingIcon={<Search className="size-4" aria-hidden="true" />}
          />
          <Select
            label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            options={[
              { value: "", label: "All roles" },
              { value: "customer", label: "Customer" },
              { value: "staff", label: "Staff" },
              { value: "admin", label: "Administrator" },
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: "", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "pending", label: "Pending verification" },
              { value: "suspended", label: "Suspended" },
              { value: "deactivated", label: "Deactivated" },
            ]}
          />
        </div>
      </Card>

      {customers.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          caption="Customer accounts"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Users}
              title="No accounts match"
              description="Try a different search term or clear the filters."
            />
          }
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a staff account"
        description="Staff can manage orders and support. Administrators additionally control the catalogue, content, and security settings."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={createStaff.isPending}
              onClick={() => {
                setCreateError(null);
                createStaff.mutate({
                  email: staffEmail.trim(),
                  firstName: staffFirstName.trim(),
                  lastName: staffLastName.trim(),
                  role: staffRole as never,
                });
              }}
            >
              Create account
            </Button>
          </>
        }
      >
        {createError ? <Alert tone="danger">{createError}</Alert> : null}

        <div className="mt-4 space-y-4">
          <Input
            label="Email"
            type="email"
            value={staffEmail}
            onChange={(event) => setStaffEmail(event.target.value)}
            autoComplete="off"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First name"
              value={staffFirstName}
              onChange={(event) => setStaffFirstName(event.target.value)}
              required
            />
            <Input
              label="Last name"
              value={staffLastName}
              onChange={(event) => setStaffLastName(event.target.value)}
              required
            />
          </div>
          <Select
            label="Role"
            value={staffRole}
            onChange={(event) => setStaffRole(event.target.value)}
            options={[
              { value: "staff", label: "Staff" },
              { value: "admin", label: "Administrator" },
            ]}
          />
          <Alert tone="info">
            A random temporary password is generated by the server and shown once after creation. The
            new user is required to change it at first sign-in, and administrators must also enrol a
            second factor.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={issued !== null}
        onClose={() => setIssued(null)}
        title="Temporary password"
        description="This is shown only once. Deliver it over a channel other than email where possible."
        footer={<Button onClick={() => setIssued(null)}>I have recorded it</Button>}
      >
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Email</dt>
            <dd className="mt-0.5 break-all font-medium text-ink">{issued?.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Temporary password</dt>
            <dd className="mt-1">
              <code className="block rounded border border-line bg-surface-soft px-3 py-2 font-mono text-sm text-ink">
                {issued?.password}
              </code>
            </dd>
          </div>
        </dl>
        <Button
          className="mt-4"
          size="sm"
          variant="outline"
          onClick={() => {
            if (issued) void navigator.clipboard.writeText(issued.password);
            toast.success("Copied");
          }}
        >
          Copy password
        </Button>
      </Modal>
    </>
  );
}

export function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const session = useSession();
  const toast = useToast();

  const detail = trpc.admin.customerDetail.useQuery(
    { userId },
    { enabled: Number.isFinite(userId) },
  );

  const [notes, setNotes] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [newRole, setNewRole] = useState("customer");

  const setNotesMutation = trpc.admin.setCustomerNotes.useMutation({
    async onSuccess() {
      await detail.refetch();
      toast.success("Notes saved");
    },
    onError(error) {
      toast.error("Could not save notes", errorMessage(error));
    },
  });

  const setStatus = trpc.admin.setCustomerStatus.useMutation({
    async onSuccess() {
      setSuspendOpen(false);
      await detail.refetch();
      toast.success("Account status updated");
    },
    onError(error) {
      toast.error("Could not change the status", errorMessage(error));
    },
  });

  const setRole = trpc.admin.setCustomerRole.useMutation({
    async onSuccess() {
      setRoleOpen(false);
      await detail.refetch();
      toast.success("Role updated", "The change takes effect at the user's next sign-in.");
    },
    onError(error) {
      toast.error("Could not change the role", errorMessage(error));
    },
  });

  const revokeSessions = trpc.adminSecurity.revokeAllSessionsForUser.useMutation({
    onSuccess() {
      toast.success("All sessions revoked", "The user has been signed out everywhere.");
    },
    onError(error) {
      toast.error("Could not revoke sessions", errorMessage(error));
    },
  });

  const lifetimeValue = useMemo(
    () => detail.data?.lifetimeValueCents ?? 0,
    [detail.data?.lifetimeValueCents],
  );

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <EmptyState
        icon={Users}
        title="Customer not found"
        description="This account may have been deleted."
        action={
          <LinkButton href="/admin/customers" variant="outline">
            Back to customers
          </LinkButton>
        }
      />
    );
  }

  const { user, orders, tickets } = detail.data;

  return (
    <>
      <PageHeader
        title={user.name}
        description={`${user.email} · joined ${formatDate(user.createdAt)}`}
        breadcrumb={{ href: "/admin/customers", label: "Customers" }}
        actions={
          session.isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setNewRole(user.role);
                  setRoleOpen(true);
                }}
                leadingIcon={<ShieldCheck className="size-4" aria-hidden="true" />}
              >
                Change role
              </Button>
              <Button
                variant={user.status === "suspended" ? "primary" : "danger"}
                onClick={() => setSuspendOpen(true)}
                leadingIcon={
                  user.status === "suspended" ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <Ban className="size-4" aria-hidden="true" />
                  )
                }
              >
                {user.status === "suspended" ? "Reinstate" : "Suspend"}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Orders" description={`${orders.length} on record`} />
            {orders.length === 0 ? (
              <p className="mt-4 text-sm text-body">This customer has not placed an order.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {orders.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-mono text-xs font-semibold no-underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="mt-1">
                        <Badge tone={STATUS_TONES[order.status] ?? "neutral"}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-ink">
                        {formatMoney(order.totalCents)}
                      </p>
                      <p className="text-xs text-muted">{formatDate(order.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Support tickets" description={`${tickets.length} on record`} />
            {tickets.length === 0 ? (
              <p className="mt-4 text-sm text-body">No support tickets.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/admin/tickets/${ticket.id}`} className="font-mono text-xs no-underline">
                      {ticket.ticketNumber}
                    </Link>
                    <span className="flex items-center gap-2">
                      <Badge tone="neutral">{ticket.status}</Badge>
                      <span className="text-xs text-muted">{formatDate(ticket.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Internal notes"
              description="Visible to staff only; never shown to the customer."
            />
            <Textarea
              label="Notes"
              className="mt-4"
              rows={6}
              maxLength={20_000}
              value={notes ?? user.notes ?? ""}
              onChange={(event) => setNotes(event.target.value)}
            />
            <Button
              className="mt-3"
              variant="outline"
              busy={setNotesMutation.isPending}
              onClick={() => setNotesMutation.mutate({ userId, notes: notes ?? "" })}
              leadingIcon={<Save className="size-4" aria-hidden="true" />}
            >
              Save notes
            </Button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Account" />
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Role</dt>
                <dd>
                  <Badge tone={ROLE_TONES[user.role] ?? "neutral"}>{user.role}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Status</dt>
                <dd>
                  <Badge tone={USER_STATUS_TONES[user.status] ?? "neutral"}>{user.status}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Email verified</dt>
                <dd>
                  <Badge tone={user.emailVerified ? "success" : "warning"}>
                    {user.emailVerified ? "yes" : "no"}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Two-factor</dt>
                <dd>
                  <Badge tone={user.mfaEnabled ? "success" : "neutral"}>
                    {user.mfaEnabled ? "enabled" : "not enabled"}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Sign-in method</dt>
                <dd className="text-ink">{user.loginMethod}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Last sign-in</dt>
                <dd className="text-ink">
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "never"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Lifetime value</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatMoney(lifetimeValue)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Email</dt>
                <dd className="mt-0.5 break-all text-ink">{user.email}</dd>
              </div>
              {user.company ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Company</dt>
                  <dd className="mt-0.5 text-ink">{user.company}</dd>
                </div>
              ) : null}
              {user.phone ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Phone</dt>
                  <dd className="mt-0.5 text-ink">{user.phone}</dd>
                </div>
              ) : null}
              {user.address ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Address</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-ink">{user.address}</dd>
                </div>
              ) : null}
              {user.timezone ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Time zone</dt>
                  <dd className="mt-0.5 text-ink">{user.timezone}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {session.isAdmin ? (
            <Card>
              <CardHeader
                title="Session control"
                description="Use after a suspected account compromise."
              />
              <Button
                className="mt-4"
                variant="outline"
                fullWidth
                busy={revokeSessions.isPending}
                onClick={() => revokeSessions.mutate({ userId })}
                leadingIcon={<KeyRound className="size-4" aria-hidden="true" />}
              >
                Revoke all sessions
              </Button>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        onConfirm={() =>
          setStatus.mutate({
            userId,
            status: user.status === "suspended" ? "active" : "suspended",
          })
        }
        title={user.status === "suspended" ? "Reinstate this account?" : "Suspend this account?"}
        message={
          user.status === "suspended"
            ? "The user will be able to sign in again immediately."
            : "The user is signed out everywhere and cannot sign in until reinstated. Their data is retained."
        }
        confirmLabel={user.status === "suspended" ? "Reinstate" : "Suspend"}
        variant={user.status === "suspended" ? "primary" : "danger"}
        busy={setStatus.isPending}
      />

      <Modal
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        title="Change role"
        description="Elevating an account to administrator grants full control over the platform, including security settings."
        footer={
          <>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={setRole.isPending}
              onClick={() => setRole.mutate({ userId, role: newRole as never })}
            >
              Apply role
            </Button>
          </>
        }
      >
        <Select
          label="Role"
          value={newRole}
          onChange={(event) => setNewRole(event.target.value)}
          options={[
            { value: "customer", label: "Customer" },
            { value: "staff", label: "Staff" },
            { value: "admin", label: "Administrator" },
          ]}
        />
        {newRole === "admin" ? (
          <Alert tone="warning" className="mt-4">
            Administrators must enrol a second factor before they can use the admin panel.
          </Alert>
        ) : null}
      </Modal>
    </>
  );
}
