import { AuthenticateUser } from "@/application/use-cases/authenticate-user";
import { DeleteEntry, UpdateEntry } from "@/application/use-cases/change-entry";
import { GetCalendarMonth } from "@/application/use-cases/get-calendar-month";
import { GetCategoryBreakdown } from "@/application/use-cases/get-category-breakdown";
import { GetDashboard } from "@/application/use-cases/get-dashboard";
import { GetOutstanding } from "@/application/use-cases/get-outstanding";
import { ListEntries } from "@/application/use-cases/list-entries";
import { ManageCategories, ManagePeople, ManagePresets, ManageSettings } from "@/application/use-cases/manage-settings";
import { ManageWallets } from "@/application/use-cases/manage-wallets";
import { ParseReceipt } from "@/application/use-cases/parse-receipt";
import { SaveReceiptEntry } from "@/application/use-cases/save-receipt-entry";
import { MarkNoSpendDay } from "@/application/use-cases/mark-no-spend-day";
import { RecordEntry } from "@/application/use-cases/record-entry";
import { RecordRepayment } from "@/application/use-cases/record-repayment";
import { RecordTransfer } from "@/application/use-cases/record-transfer";
import { systemClock } from "@/infrastructure/clock/SystemClock";
import { createLoginAttemptRepo } from "@/infrastructure/db/repos/login-attempt-repo";
import { createRepos, createTransactionRunner } from "@/infrastructure/db/repos";
import { createCategoryRepo, createPresetRepo, createSettingsRepo, createStatsRepo } from "@/infrastructure/db/repos/read-repos";
import { createDbCredentialVerifier } from "@/infrastructure/db/repos/user-repo";
import { createGeminiReceiptParser } from "@/infrastructure/ai/GeminiReceiptParser";
import { getSequelize } from "@/infrastructure/db/sequelize";
import { cleanEnv } from "./env";

/** Optional daily receipt-scan limit per account. Unset = scans are counted but never blocked. */
function scanLimitPerDay(): number | null {
  const n = Number(cleanEnv(process.env.RECEIPT_SCAN_DAILY_LIMIT));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Composition root: the only place that knows which implementation backs each port. */
function build() {
  const sequelize = getSequelize();
  const attempts = createLoginAttemptRepo(sequelize);
  // Lazily built: the key only matters once someone scans a receipt.
  let parser: ReturnType<typeof createGeminiReceiptParser> | undefined;
  const receiptParser = () =>
    (parser ??= createGeminiReceiptParser({
      apiKey: process.env.GEMINI_API_KEY ?? "",
      model: process.env.GEMINI_MODEL || undefined,
    }));

  /** Every use case for one signed-in account. Its repos only ever see that account's rows. */
  const forUser = (userId: string) => {
    const tx = createTransactionRunner(sequelize, userId);
    const repos = createRepos(sequelize, userId);
    const stats = createStatsRepo(sequelize, userId);
    const categories = createCategoryRepo(sequelize, userId);
    const presets = createPresetRepo(sequelize, userId);
    const settings = createSettingsRepo(sequelize, userId);
    return {
      getDashboard: new GetDashboard(repos, stats, presets, settings, systemClock),
      getCalendarMonth: new GetCalendarMonth(stats),
      getCategoryBreakdown: new GetCategoryBreakdown(stats, categories),
      getOutstanding: new GetOutstanding(repos),
      listEntries: new ListEntries(repos),
      updateEntry: new UpdateEntry(tx),
      deleteEntry: new DeleteEntry(tx),
      manageCategories: new ManageCategories(categories),
      managePresets: new ManagePresets(presets, repos.wallets),
      manageWallets: new ManageWallets(tx),
      manageSettings: new ManageSettings(settings),
      managePeople: new ManagePeople(repos.people),
      saveReceiptEntry: new SaveReceiptEntry(tx, systemClock),
      parseReceipt: () =>
        new ParseReceipt(receiptParser(), repos.ownerMemory, categories, repos.people, attempts, systemClock, {
          key: `receipt-parse:${userId}`,
          perDay: scanLimitPerDay(),
        }),
      recordEntry: new RecordEntry(tx, systemClock),
      recordRepayment: new RecordRepayment(tx, systemClock),
      recordTransfer: new RecordTransfer(tx, systemClock),
      markNoSpendDay: new MarkNoSpendDay(tx, systemClock),
    };
  };

  return {
    sequelize,
    authenticateUser: new AuthenticateUser(attempts, createDbCredentialVerifier(sequelize), systemClock),
    forUser,
  };
}

const g = globalThis as unknown as { __container?: ReturnType<typeof build> };
export const container = () => (g.__container ??= build());
