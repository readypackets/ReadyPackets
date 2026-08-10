/**
 * Password strength meter.
 *
 * Evaluation is intentionally local. Sending a candidate password to the server
 * on every keystroke would put plaintext passwords in request logs and rate-limit
 * counters, so the client mirrors the server's policy rules for feedback while
 * the server remains the authority at submission time.
 */
import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbols: number;
  blockSequential: boolean;
}

export const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbols: 1,
  blockSequential: true,
};

const SYMBOL_PATTERN = /[^A-Za-z0-9]/g;

function hasSequentialRun(value: string): boolean {
  const lowered = value.toLowerCase();
  for (let index = 0; index + 2 < lowered.length; index += 1) {
    const first = lowered.charCodeAt(index);
    const second = lowered.charCodeAt(index + 1);
    const third = lowered.charCodeAt(index + 2);
    if (second - first === 1 && third - second === 1) return true;
    if (first - second === 1 && second - third === 1) return true;
  }
  return false;
}

function hasRepeatedRun(value: string): boolean {
  return /(.)\1\1/.test(value);
}

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  requirements: { label: string; met: boolean }[];
  valid: boolean;
}

export function evaluatePasswordLocally(
  password: string,
  policy: PasswordPolicy = DEFAULT_POLICY,
): StrengthResult {
  const symbolCount = (password.match(SYMBOL_PATTERN) ?? []).length;

  const requirements: { label: string; met: boolean }[] = [
    { label: `At least ${policy.minLength} characters`, met: password.length >= policy.minLength },
  ];
  if (policy.requireUppercase) {
    requirements.push({ label: "An uppercase letter", met: /[A-Z]/.test(password) });
  }
  if (policy.requireLowercase) {
    requirements.push({ label: "A lowercase letter", met: /[a-z]/.test(password) });
  }
  if (policy.requireNumber) {
    requirements.push({ label: "A number", met: /[0-9]/.test(password) });
  }
  if (policy.requireSymbols > 0) {
    requirements.push({
      label: policy.requireSymbols === 1 ? "A symbol" : `${policy.requireSymbols} symbols`,
      met: symbolCount >= policy.requireSymbols,
    });
  }
  if (policy.blockSequential) {
    requirements.push({
      label: "No runs like 123 or aaa",
      met: password.length === 0 ? false : !hasSequentialRun(password) && !hasRepeatedRun(password),
    });
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, SYMBOL_PATTERN].filter((pattern) =>
    pattern.test(password),
  ).length;

  let score = 0;
  if (password.length >= policy.minLength) score += 1;
  if (password.length >= policy.minLength + 4) score += 1;
  if (classes >= 3) score += 1;
  if (classes === 4 && password.length >= 16) score += 1;

  const valid = requirements.every((requirement) => requirement.met) && password.length <= policy.maxLength;
  if (!valid) score = Math.min(score, 1);

  const labels = ["Too weak", "Weak", "Fair", "Strong", "Very strong"] as const;
  return {
    score: score as StrengthResult["score"],
    label: labels[score] ?? "Too weak",
    requirements,
    valid,
  };
}

export function PasswordStrength({
  password,
  policy = DEFAULT_POLICY,
  showRequirements = true,
}: {
  password: string;
  policy?: PasswordPolicy;
  showRequirements?: boolean;
}) {
  const result = useMemo(() => evaluatePasswordLocally(password, policy), [password, policy]);

  if (password.length === 0) {
    return showRequirements ? (
      <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
        {result.requirements.map((requirement) => (
          <li key={requirement.label} className="flex items-center gap-1.5">
            <span className="size-3.5 shrink-0 rounded-full border border-line" aria-hidden="true" />
            {requirement.label}
          </li>
        ))}
      </ul>
    ) : null;
  }

  const barColors = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"] as const;
  const textColors = [
    "text-danger",
    "text-danger",
    "text-warning",
    "text-success",
    "text-success",
  ] as const;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                index < result.score ? barColors[result.score] : "bg-surface-sunken",
              )}
            />
          ))}
        </div>
        <span
          className={cn("w-20 text-right text-xs font-semibold", textColors[result.score])}
          // Announce changes politely so a screen reader user gets the feedback.
          aria-live="polite"
        >
          {result.label}
        </span>
      </div>

      {showRequirements ? (
        <ul className="mt-2.5 grid gap-1 text-xs sm:grid-cols-2">
          {result.requirements.map((requirement) => (
            <li
              key={requirement.label}
              className={cn(
                "flex items-center gap-1.5",
                requirement.met ? "text-success" : "text-muted",
              )}
            >
              {requirement.met ? (
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <X className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {requirement.label}
              <span className="sr-only">{requirement.met ? " (met)" : " (not met)"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
