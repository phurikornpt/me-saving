import { createInterface } from "node:readline";
import { createUser } from "../src/infrastructure/db/repos/user-repo";
import { getSequelize } from "../src/infrastructure/db/sequelize";
import { hashPassword } from "../src/infrastructure/security/password";

// Adds an account with its own empty data (default categories and a "เงินสด" wallet only).
//   dev:  pnpm user:add
//   prod: DATABASE_URL=<neon direct url> pnpm user:add:prod
// The password is read from a hidden prompt so it never lands in shell history.

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    const write = out._writeToOutput;
    if (hidden) {
      process.stdout.write(question);
      out._writeToOutput = () => {};
    }
    rl.question(hidden ? "" : question, (answer) => {
      out._writeToOutput = write;
      if (hidden) process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const email = (await ask("Email: ")).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("that doesn't look like an email");
  const pw = await ask("Password (min 12 chars): ", true);
  if (pw.length < 12) throw new Error("too short: use at least 12 characters (a passphrase is best)");
  if ((await ask("Again: ", true)) !== pw) throw new Error("the passwords don't match");

  const sequelize = getSequelize();
  try {
    const id = await createUser(sequelize, email, await hashPassword(pw));
    console.log(`\nCreated ${email} (${id}) with the default categories and a "เงินสด" wallet.`);
  } finally {
    await sequelize.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
