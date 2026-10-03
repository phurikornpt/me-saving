import { AuthenticateUser } from "@/application/use-cases/authenticate-user";
import { MarkNoSpendDay } from "@/application/use-cases/mark-no-spend-day";
import { RecordEntry } from "@/application/use-cases/record-entry";
import { RecordRepayment } from "@/application/use-cases/record-repayment";
import { systemClock } from "@/infrastructure/clock/SystemClock";
import { createLoginAttemptRepo } from "@/infrastructure/db/repos/login-attempt-repo";
import { createTransactionRunner } from "@/infrastructure/db/repos";
import { getSequelize } from "@/infrastructure/db/sequelize";
import { createEnvCredentialVerifier } from "@/infrastructure/security/env-credential-verifier";

/** Composition root: the only place that knows which implementation backs each port. */
function build() {
  const sequelize = getSequelize();
  const tx = createTransactionRunner(sequelize);
  const email = process.env.AUTH_EMAIL;
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!email || !hash) throw new Error("AUTH_EMAIL and AUTH_PASSWORD_HASH must be set");

  return {
    sequelize,
    authenticateUser: new AuthenticateUser(
      createLoginAttemptRepo(sequelize),
      createEnvCredentialVerifier(email, hash),
      systemClock,
    ),
    recordEntry: new RecordEntry(tx, systemClock),
    recordRepayment: new RecordRepayment(tx, systemClock),
    markNoSpendDay: new MarkNoSpendDay(tx, systemClock),
  };
}

const g = globalThis as unknown as { __container?: ReturnType<typeof build> };
export const container = () => (g.__container ??= build());
