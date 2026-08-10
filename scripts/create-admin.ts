/**
 * Create or promote an administrator.
 *
 * The password is read from stdin rather than an argument so it never lands in
 * the shell history or the process table. If no password is supplied on a
 * non-interactive terminal, a strong one is generated and printed once.
 */
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "../server/db/client.js";
import { users } from "../server/db/schema.js";
import { createUser, getUserByEmail, setPasswordHash } from "../server/db/users.js";
import { hashPassword } from "../server/security/crypto.js";
import { evaluatePassword } from "../server/auth/passwordPolicy.js";
import { getPasswordPolicy } from "../server/services/settings.js";

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      // Suppress echo while the password is typed.
      const stdin = process.stdin as unknown as { isTTY?: boolean };
      const originalWrite = (
        rl as unknown as { output: { write: (chunk: string) => void } }
      ).output.write.bind((rl as unknown as { output: NodeJS.WriteStream }).output);
      let firstPrompt = true;
      (rl as unknown as { _writeToOutput: (chunk: string) => void })._writeToOutput = (
        chunk: string,
      ) => {
        if (firstPrompt) {
          originalWrite(chunk);
          if (chunk.includes(question)) firstPrompt = false;
          return;
        }
        if (chunk.includes("\n")) originalWrite("\n");
      };
      void stdin;
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function generatePassword(): string {
  // 24 bytes of entropy, plus one of each required class.
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg.startsWith("--email="))?.split("=")[1];
  const nameArg = args.find((arg) => arg.startsWith("--name="))?.split("=")[1];
  const generate = args.includes("--generate-password");

  const email = (emailArg ?? (await ask("Administrator email address: "))).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("That is not a valid email address.");
    process.exit(1);
  }

  const fullName = nameArg ?? (await ask("Full name: "));
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? "Site";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "Administrator";

  let password: string;
  if (generate || !process.stdin.isTTY) {
    password = generatePassword();
    console.log("\nGenerated password (store it now; it will not be shown again):");
    console.log(`  ${password}\n`);
  } else {
    password = await ask("Password: ", true);
    const confirmation = await ask("Confirm password: ", true);
    if (password !== confirmation) {
      console.error("The passwords do not match.");
      process.exit(1);
    }
    const policy = await getPasswordPolicy();
    const result = evaluatePassword(password, policy, {
      email,
      names: [firstName, lastName],
    });
    if (!result.valid) {
      console.error("That password does not meet the policy:");
      for (const problem of result.problems) console.error(`  - ${problem}`);
      process.exit(1);
    }
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    await setPasswordHash(existing.id, await hashPassword(password), {
      mustChangePassword: false,
    });
    await db
      .update(users)
      .set({ role: "admin", status: "active", emailVerified: true })
      .where(eq(users.id, existing.id));
    console.log(`Existing account ${email} promoted to administrator and password reset.`);
  } else {
    const created = await createUser({
      email,
      passwordHash: await hashPassword(password),
      firstName,
      lastName,
      role: "admin",
      emailVerified: true,
      mustChangePassword: false,
    });
    console.log(`Administrator created with id ${created.id}.`);
  }

  console.log(
    "\nTwo-factor authentication is mandatory for administrators. Enrol an authenticator app\n" +
      "the first time you sign in; you will be prompted automatically.",
  );

  await closeDatabase();
}

void main().catch(async (error) => {
  console.error("Failed to create the administrator:", error);
  await closeDatabase();
  process.exit(1);
});
