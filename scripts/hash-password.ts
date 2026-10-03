import { createInterface } from "node:readline";
import { hashPassword } from "../src/infrastructure/security/password";

// Reads the password from a hidden prompt so it never lands in shell history.
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    process.stdout.write(question);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question("", (answer) => {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = write;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const pw = await promptHidden("Password (min 12 chars): ");
  if (pw.length < 12) {
    console.error("Too short: use at least 12 characters (a passphrase is best).");
    process.exit(1);
  }
  console.log("\nPut this in .env.local (and in Vercel env):\n");
  console.log(`AUTH_PASSWORD_HASH=${await hashPassword(pw)}`);
}

main();
