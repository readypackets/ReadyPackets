/**
 * Password policy evaluation.
 *
 * The same rules run on the server and are mirrored to the client for the
 * strength meter, but the server is authoritative: a client that skips the
 * check simply receives a validation error.
 */
import { getPasswordPolicy, type PasswordPolicy } from "../services/settings.js";

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "123456",
  "12345678",
  "123456789",
  "qwerty",
  "qwerty123",
  "letmein",
  "welcome",
  "welcome1",
  "admin",
  "admin123",
  "iloveyou",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "trustno1",
  "readypackets",
  "readypackets1",
]);

const SYMBOL_PATTERN = /[^A-Za-z0-9]/g;

function hasSequentialRun(value: string, minRun = 3): boolean {
  let ascending = 1;
  let descending = 1;
  for (let i = 1; i < value.length; i += 1) {
    const previous = value.charCodeAt(i - 1);
    const current = value.charCodeAt(i);
    if (current === previous + 1) {
      ascending += 1;
      descending = 1;
    } else if (current === previous - 1) {
      descending += 1;
      ascending = 1;
    } else {
      ascending = 1;
      descending = 1;
    }
    if (ascending >= minRun || descending >= minRun) return true;
  }
  return false;
}

function hasRepeatedRun(value: string, minRun = 3): boolean {
  let run = 1;
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === value[i - 1]) {
      run += 1;
      if (run >= minRun) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

export interface PasswordEvaluation {
  valid: boolean;
  problems: string[];
  /** 0–4, matching the strength meter shown in the UI. */
  score: number;
}

export function evaluatePassword(
  password: string,
  policy: PasswordPolicy,
  context: { email?: string; names?: (string | null | undefined)[] } = {},
): PasswordEvaluation {
  const problems: string[] = [];

  if (password.length < policy.minLength) {
    problems.push(`Use at least ${policy.minLength} characters.`);
  }
  if (password.length > policy.maxLength) {
    problems.push(`Use no more than ${policy.maxLength} characters.`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    problems.push("Include at least one uppercase letter.");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    problems.push("Include at least one lowercase letter.");
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    problems.push("Include at least one number.");
  }
  const symbolCount = (password.match(SYMBOL_PATTERN) ?? []).length;
  if (policy.requireSymbols > 0 && symbolCount < policy.requireSymbols) {
    problems.push(
      policy.requireSymbols === 1
        ? "Include at least one symbol."
        : `Include at least ${policy.requireSymbols} symbols.`,
    );
  }
  if (policy.blockSequential && hasSequentialRun(password)) {
    problems.push("Avoid sequential characters such as 123 or abc.");
  }
  if (policy.blockSequential && hasRepeatedRun(password)) {
    problems.push("Avoid three or more repeated characters.");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    problems.push("This password appears on common-password lists.");
  }

  const localPart = context.email?.split("@")[0]?.toLowerCase();
  const lowered = password.toLowerCase();
  if (localPart && localPart.length >= 4 && lowered.includes(localPart)) {
    problems.push("Do not include your email address in your password.");
  }
  for (const name of context.names ?? []) {
    const candidate = name?.trim().toLowerCase();
    if (candidate && candidate.length >= 4 && lowered.includes(candidate)) {
      problems.push("Do not include your name in your password.");
      break;
    }
  }

  let score = 0;
  if (password.length >= policy.minLength) score += 1;
  if (password.length >= policy.minLength + 4) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, SYMBOL_PATTERN].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (classes >= 3) score += 1;
  if (classes === 4 && password.length >= 16) score += 1;
  if (problems.length > 0) score = Math.min(score, 1);

  return { valid: problems.length === 0, problems, score };
}

export async function assertPasswordAcceptable(
  password: string,
  context: { email?: string; names?: (string | null | undefined)[] } = {},
): Promise<void> {
  const policy = await getPasswordPolicy();
  const result = evaluatePassword(password, policy, context);
  if (!result.valid) {
    throw new Error(result.problems.join(" "));
  }
}
