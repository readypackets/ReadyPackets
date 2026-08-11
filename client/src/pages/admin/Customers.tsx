/**
 * Admin customer directory and customer detail.
 *
 * Features:
 * - List view (DataTable) and Grid view toggle
 * - Filter by role and status (All statuses shows all users)
 * - Password reset: generate temporary password or send reset link
 * - Suspend / disable / reinstate from grid view
 * - Full customer detail page with session control
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  Ban,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Grid2X2,
  KeyRound,
  LayoutList,
  Link2,
  Lock,
  Mail,
  MailCheck,
  RotateCcw,
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

// ─────────────────────────────────────────────────────────────────────────────
// Password Reset Modal
// ─────────────────────────────────────────────────────────────────────────────
function PasswordResetModal({
  userId,
  userName,
  open,
  onClose,
}: {
  userId: number;
  userName: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [issued, setIssued] = useState<string | null>(null);

  const resetMut = trpc.admin.adminResetPassword.useMutation({
    onSuccess(result) {
      setIssued(result.temporaryPassword);
    },
    onError(err) {
      toast.error("Reset failed", errorMessage(err));
    },
  });

  const sendLinkMut = trpc.admin.adminSendPasswordResetLink.useMutation({
    onSuccess() {
      toast.success("Reset link sent", `An email with a reset link has been sent to ${userName}.`);
      onClose();
    },
    onError(err) {
      toast.error("Could not send link", errorMessage(err));
    },
  });

  function handleClose() {
    setIssued(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Reset password"
      description={`Choose how to reset the password for ${userName}.`}
      footer={<Button variant="outline" onClick={handleClose}>Close</Button>}
    >
      {issued ? (
        <div className="space-y-4">
          <Alert tone="warning">
            This temporary password is shown only once. The user will be required to change it at
            next sign-in. All existing sessions have been revoked.
          </Alert>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted mb-1">Temporary password</p>
            <code className="block rounded border border-line bg-surface-soft px-3 py-2 font-mono text-sm text-ink break-all">
              {issued}
            </code>
          </div>
          <Button
            size="sm"
            variant="outline"
            leadingIcon={<Copy className="size-4" aria-hidden="true" />}
            onClick={() => {
              void navigator.clipboard.writeText(issued);
              toast.success("Copied to clipboard");
            }}
          >
            Copy password
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <Alert tone="info">
            <strong>Option 1 — Generate temporary password:</strong> A random password is generated
            server-side and shown once. All sessions are revoked. The user must change it on next
            sign-in.
          </Alert>
          <Button
            fullWidth
            variant="outline"
            busy={resetMut.isPending}
            leadingIcon={<RotateCcw className="size-4" aria-hidden="true" />}
            onClick={() => resetMut.mutate({ userId })}
          >
            Generate temporary password
          </Button>

          <Alert tone="info">
            <strong>Option 2 — Send reset link:</strong> An email is sent to the user with a
            secure link valid for 24 hours. The user sets their own new password.
          </Alert>
          <Button
            fullWidth
            variant="outline"
            busy={sendLinkMut.isPending}
            leadingIcon={<Mail className="size-4" aria-hidden="true" />}
            onClick={() => sendLinkMut.mutate({ userId })}
          >
            Send password reset link
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer Grid Card
// ─────────────────────────────────────────────────────────────────────────────
function CustomerCard({
  row,
  isAdmin,
  onSuspend,
  onDeactivate,
  onReinstate,
  onResetPassword,
  onVerifyEmail,
  onValidateAccount,
}: {
  row: CustomerRow;
  isAdmin: boolean;
  onSuspend: (id: number) => void;
  onDeactivate: (id: number) => void;
  onReinstate: (id: number) => void;
  onResetPassword: (id: number, name: string) => void;
  onVerifyEmail: (id: number) => void;
  onValidateAccount: (id: number) => void;
}) {
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{row.name}</p>
          <p className="text-xs text-muted truncate">{row.email}</p>
          {row.company ? <p className="text-xs text-muted truncate">{row.company}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge tone={ROLE_TONES[row.role] ?? "neutral"}>{row.role}</Badge>
          <Badge tone={USER_STATUS_TONES[row.status] ?? "neutral"}>{row.status}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {row.emailVerified ? null : <Badge tone="warning">unverified</Badge>}
        {row.mfaEnabled ? (
          <Badge tone="success">
            <ShieldCheck className="mr-1 size-3" aria-hidden="true" />
            MFA
          </Badge>
        ) : null}
      </div>

      <p className="text-xs text-muted">
        Last sign-in: {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "never"}
      </p>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
        <Link
          href={`/admin/customers/${row.id}`}
          className="text-xs font-semibold text-teal-dark no-underline hover:text-teal"
        >
          Open →
        </Link>
        {isAdmin && (
          <>
            <button
              type="button"
              className="text-xs text-muted hover:text-ink flex items-center gap-1"
              onClick={() => onResetPassword(row.id, row.name)}
            >
              <KeyRound className="size-3" aria-hidden="true" />
              Reset pw
            </button>
            {!row.emailVerified ? (
              <button type="button" className="text-xs text-teal-dark hover:text-teal flex items-center gap-1" onClick={() => onVerifyEmail(row.id)}>
                <MailCheck className="size-3" aria-hidden="true" /> Verify email
              </button>
            ) : null}
            <button type="button" className="text-xs text-green-700 hover:text-green-800 flex items-center gap-1" onClick={() => onValidateAccount(row.id)}>
              <BadgeCheck className="size-3" aria-hidden="true" /> Validate
            </button>
            {row.status === "active" || row.status === "pending" ? (
              <>
                <button
                  type="button"
                  className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
                  onClick={() => onSuspend(row.id)}
                >
                  <Ban className="size-3" aria-hidden="true" />
                  Suspend
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                  onClick={() => onDeactivate(row.id)}
                >
                  <Lock className="size-3" aria-hidden="true" />
                  Disable
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
                onClick={() => onReinstate(row.id)}
              >
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Reinstate
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Customers Page
// ─────────────────────────────────────────────────────────────────────────────
export function AdminCustomersPage() {
  const session = useSession();
  const toast = useToast();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [createOpen, setCreateOpen] = useState(false);

  // Password reset modal state
  const [resetTarget, setResetTarget] = useState<{ id: number; name: string } | null>(null);

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: "primary" | "danger";
    onConfirm: () => void;
  } | null>(null);

  const customers = trpc.admin.customers.useQuery({
    search: search.trim() || undefined,
    role: (role || undefined) as never,
    status: status || undefined,
    limit: 200,
    offset: 0,
  });

  const setStatusMut = trpc.admin.setCustomerStatus.useMutation({
    async onSuccess() {
      await utils.admin.customers.invalidate();
      toast.success("Account status updated");
      setConfirmAction(null);
    },
    onError(err) {
      toast.error("Could not change status", errorMessage(err));
    },
  });

  const verifyEmailMut = trpc.admin.adminVerifyEmail.useMutation({
    async onSuccess() {
      await utils.admin.customers.invalidate();
      toast.success("Email verified", "The account no longer needs email validation.");
    },
    onError(err) { toast.error("Could not verify email", errorMessage(err)); },
  });

  const validateAccountMut = trpc.admin.adminValidateAccount.useMutation({
    async onSuccess() {
      await utils.admin.customers.invalidate();
      toast.success("Account validated", "The account is active and its email is verified.");
    },
    onError(err) { toast.error("Could not validate account", errorMessage(err)); },
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
      await utils.admin.customers.invalidate();
      toast.success("Account created", "Share the temporary password over a secure channel.");
    },
    onError(error) {
      setCreateError(errorMessage(error));
    },
  });

  const rows = (customers.data ?? []) as unknown as CustomerRow[];

  function handleSuspend(id: number) {
    setConfirmAction({
      title: "Suspend this account?",
      message: "The user is signed out everywhere and cannot sign in until reinstated. Their data is retained.",
      confirmLabel: "Suspend",
      variant: "danger",
      onConfirm: () => setStatusMut.mutate({ userId: id, status: "suspended" }),
    });
  }

  function handleDeactivate(id: number) {
    setConfirmAction({
      title: "Disable this account?",
      message: "The account is deactivated. The user cannot sign in. Their data is retained.",
      confirmLabel: "Disable",
      variant: "danger",
      onConfirm: () => setStatusMut.mutate({ userId: id, status: "deactivated" }),
    });
  }

  function handleVerifyEmail(id: number) {
    verifyEmailMut.mutate({ userId: id });
  }

  function handleValidateAccount(id: number) {
    validateAccountMut.mutate({ userId: id });
  }

  function handleReinstate(id: number) {
    setConfirmAction({
      title: "Reinstate this account?",
      message: "The user will be able to sign in again immediately.",
      confirmLabel: "Reinstate",
      variant: "primary",
      onConfirm: () => setStatusMut.mutate({ userId: id, status: "active" }),
    });
  }

  const columns: Column<CustomerRow>[] = useMemo(
    () => [
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
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        align: "right",
        cell: (row) => (
          <div className="flex items-center gap-2 justify-end">
            {session.isAdmin && (
              <>
                <button
                  type="button"
                  title="Reset password"
                  className="text-muted hover:text-ink"
                  onClick={() => setResetTarget({ id: row.id, name: row.name })}
                >
                  <KeyRound className="size-4" aria-hidden="true" />
                </button>
                {!row.emailVerified ? (
                  <button type="button" title="Verify email" className="text-teal-600 hover:text-teal-800" onClick={() => handleVerifyEmail(row.id)}>
                    <MailCheck className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
                <button type="button" title="Validate account" className="text-green-600 hover:text-green-800" onClick={() => handleValidateAccount(row.id)}>
                  <BadgeCheck className="size-4" aria-hidden="true" />
                </button>
                {row.status === "active" || row.status === "pending" ? (
                  <button
                    type="button"
                    title="Suspend"
                    className="text-orange-500 hover:text-orange-700"
                    onClick={() => handleSuspend(row.id)}
                  >
                    <Ban className="size-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Reinstate"
                    className="text-green-600 hover:text-green-800"
                    onClick={() => handleReinstate(row.id)}
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </>
            )}
            <Link
              href={`/admin/customers/${row.id}`}
              className="text-sm font-semibold text-teal-dark no-underline hover:text-teal"
            >
              Open
            </Link>
          </div>
        ),
      },
    ],
    [session.isAdmin],
  );

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
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
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
          <div className="flex items-end gap-1 pb-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view"
              className={`rounded p-1.5 transition-colors ${
                viewMode === "list" ? "bg-teal/10 text-teal" : "text-muted hover:text-ink"
              }`}
            >
              <LayoutList className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              className={`rounded p-1.5 transition-colors ${
                viewMode === "grid" ? "bg-teal/10 text-teal" : "text-muted hover:text-ink"
              }`}
            >
              <Grid2X2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Card>

      {customers.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No accounts match"
          description="Try a different search term or clear the filters."
        />
      ) : viewMode === "list" ? (
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <CustomerCard
              key={row.id}
              row={row}
              isAdmin={session.isAdmin}
              onSuspend={handleSuspend}
              onDeactivate={handleDeactivate}
              onReinstate={handleReinstate}
              onResetPassword={(id, name) => setResetTarget({ id, name })}
              onVerifyEmail={handleVerifyEmail}
              onValidateAccount={handleValidateAccount}
            />
          ))}
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <PasswordResetModal
          userId={resetTarget.id}
          userName={resetTarget.name}
          open={true}
          onClose={() => setResetTarget(null)}
        />
      )}

      {/* Confirm Dialog for status changes */}
      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.onConfirm()}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel={confirmAction?.confirmLabel ?? "Confirm"}
        variant={confirmAction?.variant ?? "primary"}
        busy={setStatusMut.isPending}
      />

      {/* Create Staff Modal */}
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
            A random temporary password is generated by the server and shown once after creation.
            The new user is required to change it at first sign-in.
          </Alert>
        </div>
      </Modal>

      {/* Issued password Modal */}
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
          leadingIcon={<Copy className="size-4" aria-hidden="true" />}
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

// ─────────────────────────────────────────────────────────────────────────────
// Customer Detail Page
// ─────────────────────────────────────────────────────────────────────────────
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
  const [resetOpen, setResetOpen] = useState(false);

  const setNotesMutation = trpc.admin.setCustomerNotes.useMutation({
    async onSuccess() {
      await detail.refetch();
      toast.success("Notes saved");
    },
    onError(error) {
      toast.error("Could not save notes", errorMessage(error));
    },
  });

  const verifyEmail = trpc.admin.adminVerifyEmail.useMutation({
    async onSuccess() { await detail.refetch(); toast.success("Email verified", "The account no longer requires email validation."); },
    onError(error) { toast.error("Could not verify email", errorMessage(error)); },
  });

  const validateAccount = trpc.admin.adminValidateAccount.useMutation({
    async onSuccess() { await detail.refetch(); toast.success("Account validated", "The account is active and the email address is verified."); },
    onError(error) { toast.error("Could not validate account", errorMessage(error)); },
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
              {!user.emailVerified ? (
                <Button variant="outline" busy={verifyEmail.isPending} onClick={() => verifyEmail.mutate({ userId })} leadingIcon={<MailCheck className="size-4" aria-hidden="true" />}>
                  Verify email
                </Button>
              ) : null}
              <Button variant="outline" busy={validateAccount.isPending} onClick={() => validateAccount.mutate({ userId })} leadingIcon={<BadgeCheck className="size-4" aria-hidden="true" />}>
                Validate account
              </Button>
              <Button
                variant="outline"
                onClick={() => setResetOpen(true)}
                leadingIcon={<KeyRound className="size-4" aria-hidden="true" />}
              >
                Reset password
              </Button>
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
                <dd><Badge tone={ROLE_TONES[user.role] ?? "neutral"}>{user.role}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Status</dt>
                <dd><Badge tone={USER_STATUS_TONES[user.status] ?? "neutral"}>{user.status}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Email verified</dt>
                <dd><Badge tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "yes" : "no"}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Two-factor</dt>
                <dd><Badge tone={user.mfaEnabled ? "success" : "neutral"}>{user.mfaEnabled ? "enabled" : "not enabled"}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Sign-in method</dt>
                <dd className="text-ink">{user.loginMethod}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-body">Last sign-in</dt>
                <dd className="text-ink">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "never"}</dd>
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
              <div className="mt-4 space-y-2">
                <Button
                  variant="outline"
                  fullWidth
                  busy={revokeSessions.isPending}
                  onClick={() => revokeSessions.mutate({ userId })}
                  leadingIcon={<KeyRound className="size-4" aria-hidden="true" />}
                >
                  Revoke all sessions
                </Button>
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => setResetOpen(true)}
                  leadingIcon={<Link2 className="size-4" aria-hidden="true" />}
                >
                  Reset password
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Password Reset Modal */}
      <PasswordResetModal
        userId={userId}
        userName={user.name}
        open={resetOpen}
        onClose={() => setResetOpen(false)}
      />

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
