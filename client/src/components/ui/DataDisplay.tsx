/**
 * Table, tab, pagination and progress primitives.
 *
 * The table renders as a real `<table>` with scoped headers and a caption for
 * screen readers, and switches to a stacked card layout below `sm` so it remains
 * usable at 375px without horizontal scrolling.
 */
import { useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** Cell renderer. Receives the row and its index. */
  cell: (row: Row, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  /** Hide this column on small screens where space is scarce. */
  hideOnMobile?: boolean;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<Row> {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string | number;
  onRowClick?: (row: Row) => void;
  empty?: ReactNode;
  className?: string;
  dense?: boolean;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  className,
  dense = false,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  const alignClass = (align?: "left" | "right" | "center") =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border border-line bg-white",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-surface-soft">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-4 font-semibold text-ink",
                    dense ? "py-2.5" : "py-3",
                    alignClass(column.align),
                    column.hideOnMobile && "hidden sm:table-cell",
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className={cn(
                  "border-b border-line last:border-b-0",
                  onRowClick && "cursor-pointer transition-colors hover:bg-surface-soft",
                )}
                {...(onRowClick
                  ? {
                      onClick: () => onRowClick(row),
                      // Keyboard parity for a clickable row.
                      tabIndex: 0,
                      role: "button",
                      onKeyDown: (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      },
                    }
                  : {})}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 align-middle text-body",
                      dense ? "py-2.5" : "py-3.5",
                      alignClass(column.align),
                      column.hideOnMobile && "hidden sm:table-cell",
                      column.className,
                    )}
                  >
                    {column.cell(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface TabItem {
  id: string;
  label: string;
  badge?: ReactNode;
  /** Panel content. Omitted when the parent renders the panel itself. */
  content?: ReactNode;
}

/**
 * Tab strip driven entirely by the parent.
 *
 * Some screens need the selected tab to participate in data fetching decisions,
 * so this variant keeps the state outside the component and renders no panel.
 */
export function TabStrip({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; badge?: ReactNode }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const baseId = useId();

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    if (index < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex]!;
    onChange(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`${baseId}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
              selected
                ? "border-teal text-teal-dark"
                : "border-transparent text-body hover:border-line hover:text-ink",
            )}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Tabs implementing the ARIA tabs pattern including arrow-key navigation. */
export function Tabs({
  items,
  initialId,
  className,
  onChange,
}: {
  items: TabItem[];
  initialId?: string;
  className?: string;
  onChange?: (id: string) => void;
}) {
  const baseId = useId();
  const [active, setActive] = useState(initialId ?? items[0]?.id ?? "");

  const select = (id: string) => {
    setActive(id);
    onChange?.(id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === active);
    if (index < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = items[nextIndex]!;
    select(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  const activeItem = items.find((item) => item.id === active) ?? items[0];

  return (
    <div className={className}>
      <div
        role="tablist"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                selected
                  ? "border-teal text-teal-dark"
                  : "border-transparent text-body hover:border-line hover:text-ink",
              )}
            >
              {item.label}
              {item.badge}
            </button>
          );
        })}
      </div>
      {activeItem ? (
        <div
          id={`${baseId}-panel-${activeItem.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${activeItem.id}`}
          tabIndex={0}
          className="pt-5 focus-visible:outline-none"
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
      aria-label="Pagination"
    >
      <p className="text-sm text-body" aria-live="polite">
        Showing <span className="font-medium text-ink">{from}</span>–
        <span className="font-medium text-ink">{to}</span> of{" "}
        <span className="font-medium text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          leadingIcon={<ChevronLeft className="size-4" aria-hidden="true" />}
        >
          Previous
        </Button>
        <span className="text-sm tabular-nums text-body">
          {page} / {pageCount}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          trailingIcon={<ChevronRight className="size-4" aria-hidden="true" />}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

/** Determinate progress bar with an accessible value. */
export function ProgressBar({
  value,
  max = 100,
  label,
  tone = "teal",
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: "teal" | "gold" | "success" | "warning";
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  const tones = {
    teal: "bg-teal",
    gold: "bg-gold",
    success: "bg-success",
    warning: "bg-warning",
  } as const;

  return (
    <div className={className}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-ink">{label}</span>
          <span className="tabular-nums text-muted">{Math.round(percent)}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tones[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Compact statistic tile used on dashboards. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: React.ElementType;
  tone?: "teal" | "gold" | "navy" | "success" | "warning" | "danger" | "neutral";
}) {
  const tones = {
    neutral: "bg-surface-sunken text-body",
    teal: "bg-teal/10 text-teal-dark",
    gold: "bg-gold/16 text-[#7d6620]",
    navy: "bg-navy/8 text-navy",
    success: "bg-success/10 text-success",
    warning: "bg-warning/12 text-warning",
    danger: "bg-danger/10 text-danger",
  } as const;

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
          {hint ? <p className="mt-1 text-xs text-body">{hint}</p> : null}
        </div>
        {Icon ? (
          <span
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
