/**
 * Form field primitives.
 *
 * Every control is wired to its label, help text and error message through
 * generated ids and `aria-describedby`, and an invalid control sets
 * `aria-invalid`. Errors are rendered in text as well as colour, so the state is
 * not conveyed by colour alone.
 */
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const CONTROL_BASE =
  "block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted transition-colors disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted";
const CONTROL_NORMAL = "border-line hover:border-muted focus:border-teal";
const CONTROL_INVALID = "border-danger hover:border-danger focus:border-danger";

interface FieldShellProps {
  label?: string;
  htmlFor?: string;
  help?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  labelSuffix?: ReactNode;
}

export function FieldShell({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
  className,
  labelSuffix,
}: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
            {label}
            {required ? (
              <span className="ml-0.5 text-danger" aria-hidden="true">
                *
              </span>
            ) : null}
            {required ? <span className="sr-only"> (required)</span> : null}
          </label>
          {labelSuffix}
        </div>
      ) : null}
      {children}
      {help && !error ? <p className="text-xs text-muted">{help}</p> : null}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label?: string;
  help?: string;
  error?: string | null;
  className?: string;
  containerClassName?: string;
  leadingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, help, error, className, containerClassName, leadingIcon, id, required, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      help={help}
      error={error}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        {leadingIcon ? (
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          >
            {leadingIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error ? errorId : undefined, help && !error ? helpId : undefined) || undefined}
          className={cn(
            CONTROL_BASE,
            error ? CONTROL_INVALID : CONTROL_NORMAL,
            leadingIcon && "pl-9",
            className,
          )}
          {...rest}
        />
      </div>
    </FieldShell>
  );
});

export interface PasswordInputProps extends InputProps {
  /** Rendered under the control, e.g. a strength meter. */
  footer?: ReactNode;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, help, error, className, footer, id, required, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const helpId = `${inputId}-help`;
    const errorId = `${inputId}-error`;

    return (
      <FieldShell label={label} htmlFor={inputId} help={help} error={error} required={required}>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              cn(error ? errorId : undefined, help && !error ? helpId : undefined) || undefined
            }
            className={cn(CONTROL_BASE, error ? CONTROL_INVALID : CONTROL_NORMAL, "pr-11", className)}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            // The label changes with state so a screen reader reads the action.
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            tabIndex={-1}
          >
            {visible ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {footer}
      </FieldShell>
    );
  },
);

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  label?: string;
  help?: string;
  error?: string | null;
  className?: string;
  /** Show a live character counter; requires maxLength. */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, help, error, className, showCount, id, required, maxLength, value, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const length = typeof value === "string" ? value.length : 0;

  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      help={help}
      error={error}
      required={required}
      labelSuffix={
        showCount && maxLength ? (
          <span
            className={cn(
              "text-xs tabular-nums",
              length > maxLength * 0.9 ? "text-warning" : "text-muted",
            )}
          >
            {length} / {maxLength}
          </span>
        ) : null
      }
    >
      <textarea
        ref={ref}
        id={inputId}
        required={required}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          cn(error ? errorId : undefined, help && !error ? helpId : undefined) || undefined
        }
        className={cn(
          CONTROL_BASE,
          error ? CONTROL_INVALID : CONTROL_NORMAL,
          "min-h-28 resize-y leading-relaxed",
          className,
        )}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  label?: string;
  help?: string;
  error?: string | null;
  className?: string;
  options?: { value: string; label: string; disabled?: boolean }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, help, error, className, options, children, id, required, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  return (
    <FieldShell label={label} htmlFor={inputId} help={help} error={error} required={required}>
      <select
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          cn(error ? errorId : undefined, help && !error ? helpId : undefined) || undefined
        }
        className={cn(CONTROL_BASE, error ? CONTROL_INVALID : CONTROL_NORMAL, "pr-9", className)}
        {...rest}
      >
        {options
          ? options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))
          : children}
      </select>
    </FieldShell>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  help?: string;
  error?: string | null;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, help, error, id, className, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2.5">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={
            cn(error ? errorId : undefined, help ? helpId : undefined) || undefined
          }
          className={cn(
            "mt-0.5 size-4 shrink-0 rounded border-line text-teal accent-teal",
            error && "border-danger",
            className,
          )}
          {...rest}
        />
        <label htmlFor={inputId} className="text-sm leading-snug text-body">
          {label}
        </label>
      </div>
      {help ? (
        <p id={helpId} className="pl-6.5 text-xs text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="pl-6.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export interface RadioGroupProps {
  legend: string;
  name: string;
  value: string | null;
  options: { value: string; label: string; description?: string }[];
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
}

/** Radio group in a fieldset so the legend is announced with each option. */
export function RadioGroup({
  legend,
  name,
  value,
  options,
  onChange,
  error,
  required,
}: RadioGroupProps) {
  const groupId = useId();
  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${groupId}-error` : undefined}>
      <legend className="text-sm font-medium text-ink">
        {legend}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>
      <div className="space-y-2">
        {options.map((option) => {
          const optionId = `${groupId}-${option.value}`;
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                selected ? "border-teal bg-teal/5" : "border-line hover:border-muted",
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="mt-0.5 size-4 shrink-0 accent-teal"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs text-body">{option.description}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${groupId}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
