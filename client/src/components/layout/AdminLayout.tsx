/**
 * Admin shell.
 *
 * Visually distinct from the customer portal — darker chrome, explicit role badge
 * — so staff always know which surface they are operating in. The navigation is
 * filtered by role, and the server enforces the same boundary independently.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogOut,
  Mail,
  Menu,
  Package,
  ScrollText,
  Server,
  ShieldAlert,
  Star,
  Users,
  X,
  Zap,
} from "lucide-react";
import { BRAND, BRAND_ASSETS } from "@shared/brand";
import { trpc, errorMessage } from "@/lib/trpc";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operations",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/orders", label: "Orders", icon: ClipboardList },
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/tickets", label: "Support", icon: LifeBuoy },
      { href: "/admin/files", label: "Files", icon: FileText },
    ],
  },
  {
    section: "Content",
    items: [
      { href: "/admin/catalog", label: "Catalogue", icon: Package, adminOnly: true },
      { href: "/admin/moderation", label: "Moderation", icon: Star },
      { href: "/admin/content", label: "Site content", icon: ScrollText, adminOnly: true },
    ],
  },
  {
    section: "Email",
    items: [
      { href: "/admin/email-settings", label: "Email settings", icon: Mail, adminOnly: true },
      { href: "/admin/email-automations", label: "Automations", icon: Zap, adminOnly: true },
    ],
  },
  {
    section: "Finance",
    items: [
      { href: "/admin/finance", label: "Finance", icon: CreditCard, adminOnly: true },
    ],
  },
  {
    section: "Platform",
    items: [
      { href: "/admin/integrations", label: "Integrations", icon: Link2, adminOnly: true },
      { href: "/admin/security", label: "Security centre", icon: ShieldAlert, adminOnly: true },
      { href: "/admin/system", label: "System", icon: Server, adminOnly: true },
    ],
  },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const session = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const logout = trpc.auth.logout.useMutation({
    async onSuccess() {
      await session.refresh();
      navigate("/login");
    },
    onError(error) {
      toast.error("Could not sign out", errorMessage(error));
    },
  });

  useEffect(() => {
    setOpen(false);
  }, [location]);

  const isActive = (href: string) =>
    href === "/admin" ? location === "/admin" : location.startsWith(href);

  const navigation = (
    <nav aria-label="Administration">
      {NAV.map((group) => {
        const items = group.items.filter((item) => !item.adminOnly || session.isAdmin);
        if (items.length === 0) return null;
        return (
          <div key={group.section} className="mb-6">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline transition-colors ${
                        active
                          ? "bg-teal/20 font-semibold text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-surface-soft">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-navy px-4 py-6 lg:flex">
        <Link href="/admin" className="mb-8 flex items-center gap-2.5 px-2 no-underline">
          <img
            src={BRAND_ASSETS.icon.px64}
            alt=""
            width={32}
            height={32}
            className="size-8"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {BRAND.companyShortName}
            </span>
            <span className="block text-xs text-white/50">Administration</span>
          </span>
        </Link>

        <div className="flex-1 overflow-y-auto">{navigation}</div>

        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="truncate px-3 text-sm font-medium text-white">
            {session.user?.preferredName ?? session.user?.firstName ?? session.user?.email}
          </p>
          <p className="mt-1 px-3">
            <Badge tone={session.isAdmin ? "danger" : "teal"}>{session.user?.role}</Badge>
          </p>
          <div className="mt-3 space-y-1">
            <Link
              href="/portal"
              className="block rounded-lg px-3 py-2 text-sm text-white/70 no-underline hover:bg-white/5 hover:text-white"
            >
              Customer portal
            </Link>
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-navy/70"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-navy px-4 py-6">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Administration</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-white hover:bg-white/10"
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">{navigation}</div>
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="mt-4 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Gauge className="size-4 text-teal" aria-hidden="true" />
            Administration
          </span>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
