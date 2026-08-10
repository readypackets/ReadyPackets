/**
 * Button and link-button primitives.
 *
 * A busy button stays in the accessibility tree with `aria-busy` and remains
 * focusable, rather than disappearing behind a spinner. Minimum hit area is
 * 44px on the medium and large sizes to satisfy WCAG 2.5.5 target size.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "gold"
  | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-teal text-white shadow-sm hover:bg-teal-dark active:bg-teal-dark disabled:bg-teal/50",
  secondary:
    "bg-navy text-white shadow-sm hover:bg-navy-raised active:bg-navy-elevated disabled:bg-navy/50",
  outline:
    "border border-line bg-white text-ink hover:border-teal hover:text-teal-dark active:bg-surface-soft disabled:text-muted",
  ghost: "text-ink hover:bg-surface-sunken active:bg-surface-sunken disabled:text-muted",
  danger: "bg-danger text-white shadow-sm hover:bg-[#8f1e18] active:bg-[#7a1a14] disabled:bg-danger/50",
  gold: "bg-gold text-navy shadow-sm hover:bg-gold-dark active:bg-gold-dark disabled:bg-gold/50",
  link: "text-teal-dark underline underline-offset-2 hover:text-teal disabled:text-muted",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-sm",
  md: "h-11 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
  icon: "size-11 justify-center",
};

const BASE =
  "inline-flex items-center justify-center rounded-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed select-none";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    busy = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      // Busy implies disabled behaviour, but the state is announced properly.
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        variant === "link" && "h-auto px-0",
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {busy ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        leadingIcon
      )}
      {children}
      {!busy && trailingIcon}
    </button>
  );
});

export interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/** Anchor styled as a button. External links always get noopener noreferrer. */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  {
    variant = "primary",
    size = "md",
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    href,
    ...rest
  },
  ref,
) {
  const external = typeof href === "string" && /^https?:\/\//i.test(href);
  return (
    <a
      ref={ref}
      href={href}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        variant === "link" && "h-auto px-0",
        fullWidth && "w-full",
        "no-underline",
        className,
      )}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </a>
  );
});

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-2", className)}>
      <Loader2 className="size-4 animate-spin text-teal" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
