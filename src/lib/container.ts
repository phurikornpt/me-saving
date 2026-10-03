import { cleanEnv } from "./env";
import { AuthenticateUser } from "@/application/use-cases/authenticate-user";
import { DeleteEntry, UpdateEntry } from "@/application/use-cases/change-entry";
import { GetCalendarMonth } from "@/application/use-cases/get-calendar-month";
import { GetCategoryBreakdown } from "@/application/use-cases/get-category-breakdown";
import { GetDashboard } from "@/application/use-cases/get-dashboard";
import { GetPartnerOutstanding } from "@/application/use-cases/get-partner-outstanding";
import { ListEntries } from "@/application/use-cases/list-entries";
import { ManageCategories, ManagePresets, ManageSettings } from "@/application/use-cases/manage-settings";
import { ParseReceipt } from "@/application/use-cases/parse-receipt";
import { SaveReceiptEntry } from "@/application/use-cases/save-receipt-entry";
import { MarkNoSpendDay } from "@/application/use-cases/mark-no-spend-day";
import { RecordEntry } from "@/application/use-cases/record-entry";
import { RecordRepayment } from "@/application/use-cases/record-repayment";
import { systemClock } from "@/infrastructure/clock/SystemClock";
import { createLoginAttemptRepo } from "@/infrastructure/db/repos/login-attempt-repo";
import { createRepos, createTransactionRunner } from "@/infrastructure/db/repos";
import { createCategoryRepo, createPresetRepo, createSettingsRepo, createStatsRepo } from "@/infrastructure/db/repos/read-repos";
import { createGeminiReceiptParser } from "@/infrastructure/ai/GeminiReceiptParser";
import { getSequelize } from "@/infrastructure/db/sequelize";
import { createEnvCredentialVerifier } from "@/infrastructure/security/env-credential-verifier";

/** Composition root: the only place that knows which implementation backs each port. */
function build() {
  const sequelize = getSequelize();
  const tx = createTransactionRunner(sequelize);
  const repos = createRepos(sequelize);
  const attempts = createLoginAttemptRepo(sequelize);
  const stats = createStatsRepo(sequelize);
  const categories = createCategoryRepo(sequelize);
  const presets = createPresetRepo(sequelize);
  const settings = createSettingsRepo(sequelize);
  const email = cleanEnv(process.env.AUTH_EMAIL);
  const hash = cleanEnv(process.env.AUTH_PASSWORD_HASH);
  if (!email || !hash) throw new Error("AUTH_EMAIL and AUTH_PASSWORD_HASH must be set");

  return {
    sequelize,
    authenticateUser: new AuthenticateUser(
      createLoginAttemptRepo(sequelize),
      createEnvCredentialVerifier(email, hash),
      systemClock,
    ),
    getDashboard: new GetDashboard(repos, stats, presets, settings, systemClock),
    getCalendarMonth: new GetCalendarMonth(stats),
    getCategoryBreakdown: new GetCategoryBreakdown(stats, categories),
    getPartnerOutstanding: new GetPartnerOutstanding(repos),
    listEntries: new ListEntries(repos),
    updateEntry: new UpdateEntry(tx),
    deleteEntry: new DeleteEntry(tx),
    manageCategories: new ManageCategories(categories),
    managePresets: new ManagePresets(presets),
    manageSettings: new ManageSettings(settings),
    saveReceiptEntry: new SaveReceiptEntry(tx, systemClock),
    // Lazily built: the key only matters once someone scans a receipt.
    parseReceipt: () =>
      new ParseReceipt(
        createGeminiReceiptParser({
          apiKey: process.env.GEMINI_API_KEY ?? "",
          model: process.env.GEMINI_MODEL || undefined,
        }),
        repos.ownerMemory,
        categories,
        settings,
        attempts,
        systemClock,
      ),
    recordEntry: new RecordEntry(tx, systemClock),
    recordRepayment: new RecordRepayment(tx, systemClock),
    markNoSpendDay: new MarkNoSpendDay(tx, systemClock),
  };
}

const g = globalThis as unknown as { __container?: ReturnType<typeof build> };
export const container = () => (g.__container ??= build());
