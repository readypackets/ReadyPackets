/**
 * Layout and status surfaces: Card, Badge, StatusPill, Alert, EmptyState,
 * Skeleton, SectionHeading, and a definition list for record detail views.
 */
import type { ElementType, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  as: Tag = "div",
  padded = true,
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  padded?: boolean;
  /** Anchor target, used by in-page navigation such as the intake outline. */
  id?: string;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-body">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type BadgeTone =
  | "neutral"
  | "teal"
  | "gold"
  | "navy"
  | "success"
  | "warning"
  | "danger"
  | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-body",
  teal: "bg-teal/12 text-teal-dark",
  gold: "bg-gold/18 text-[#7d6620]",
  navy: "bg-navy text-white",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Status indicator with a shape as well as a colour, so the state is not
 * conveyed by colour alone.
 */
export function StatusPill({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: BadgeTone;
  className?: string;
}) {
  const dot: Record<BadgeTone, string> = {
    neutral: "bg-muted",
    teal: "bg-teal",
    gold: "bg-gold",
    navy: "bg-navy",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-semibold text-ink",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}

export type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_TONES: Record<AlertTone, { wrapper: string; icon: typeof Info; iconClass: string }> = {
  info: { wrapper: "border-info/30 bg-info/6", icon: Info, iconClass: "text-info" },
  success: {
    wrapper: "border-success/30 bg-success/6",
    icon: CheckCircle2,
    iconClass: "text-success",
  },
  warning: {
    wrapper: "border-warning/35 bg-warning/8",
    icon: TriangleAlert,
    iconClass: "text-warning",
  },
  danger: { wrapper: "border-danger/30 bg-danger/6", icon: AlertCircle, iconClass: "text-danger" },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  actions,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  const config = ALERT_TONES[tone];
  const Icon = config.icon;
  return (
    <div
      // Errors and warnings are announced; informational notices are not.
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-lg border p-3.5", config.wrapper, className)}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", config.iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="text-sm font-semibold text-ink">{title}</p> : null}
        {children ? (
          <div className={cn("text-sm text-body", title && "mt-1")}>{children}</div>
        ) : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line bg-surface-soft px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-white text-teal shadow-sm">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-sm text-body">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-sunken", className)}
      aria-hidden="true"
    />
  );
}

/** Skeleton block for a loading table or list. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-dark">
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          "text-balance text-2xl font-semibold text-ink sm:text-3xl",
          eyebrow && "mt-2",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-3 text-pretty text-base leading-relaxed text-body",
            align === "center" && "mx-auto max-w-2xl",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Key/value list used across order, customer and file detail views. */
export function DetailList({
  items,
  className,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
