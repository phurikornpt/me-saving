import { AuthenticateUser } from "@/application/use-cases/authenticate-user";
import { DeleteEntry, GetEntryDetail, UpdateEntry, UpdateGroupEntry } from "@/application/use-cases/change-entry";
import { GetCalendarMonth } from "@/application/use-cases/get-calendar-month";
import { GetCategoryBreakdown } from "@/application/use-cases/get-category-breakdown";
import { GetDashboard } from "@/application/use-cases/get-dashboard";
import { GetOutstanding } from "@/application/use-cases/get-outstanding";
import { ListEntries } from "@/application/use-cases/list-entries";
import { ManageCategories, ManagePeople, ManagePresets, ManageSettings } from "@/application/use-cases/manage-settings";
import { ManageWallets } from "@/application/use-cases/manage-wallets";
import { FindDuplicates } from "@/application/use-cases/find-duplicates";
import { GetMonthSummary } from "@/application/use-cases/get-month-summary";
import { ParseEntryText } from "@/application/use-cases/parse-entry-text";
import { ParseReceipt } from "@/application/use-cases/parse-receipt";
import { SaveReceiptEntry } from "@/application/use-cases/save-receipt-entry";
import { MarkNoSpendDay } from "@/application/use-cases/mark-no-spend-day";
import { RecordBackfill } from "@/application/use-cases/record-backfill";
import { RecordEntry } from "@/application/use-cases/record-entry";
import { RecordRepayment } from "@/application/use-cases/record-repayment";
import { RecordTransfer } from "@/application/use-cases/record-transfer";
import { systemClock } from "@/infrastructure/clock/SystemClock";
import { createLoginAttemptRepo } from "@/infrastructure/db/repos/login-attempt-repo";
import { createRepos, createTransactionRunner } from "@/infrastructure/db/repos";
import { createCategoryRepo, createPresetRepo, createSettingsRepo, createStatsRepo } from "@/infrastructure/db/repos/read-repos";
import { createDbCredentialVerifier } from "@/infrastructure/db/repos/user-repo";
import { createGeminiReceiptParser } from "@/infrastructure/ai/GeminiReceiptParser";
import { createGeminiMonthSummarizer } from "@/infrastructure/ai/GeminiMonthSummarizer";
import { createGeminiTextEntryParser } from "@/infrastructure/ai/GeminiTextEntryParser";
import { createSummaryRepo } from "@/infrastructure/db/repos/summary-repo";
import { getSequelize } from "@/infrastructure/db/sequelize";
import { aiDailyLimit } from "./env";

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

  let textParser: ReturnType<typeof createGeminiTextEntryParser> | undefined;
  const textEntryParser = () =>
    (textParser ??= createGeminiTextEntryParser({
      apiKey: process.env.GEMINI_API_KEY ?? "",
      model: process.env.GEMINI_MODEL || undefined,
    }));
  let summarizer: ReturnType<typeof createGeminiMonthSummarizer> | undefined;
  const monthSummarizer = () =>
    (summarizer ??= createGeminiMonthSummarizer({
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
      updateGroupEntry: new UpdateGroupEntry(tx, systemClock),
      getEntryDetail: new GetEntryDetail(repos),
      manageCategories: new ManageCategories(categories),
      managePresets: new ManagePresets(presets, repos.wallets),
      manageWallets: new ManageWallets(tx),
      manageSettings: new ManageSettings(settings),
      managePeople: new ManagePeople(repos.people),
      saveReceiptEntry: new SaveReceiptEntry(tx, systemClock),
      parseReceipt: () =>
        new ParseReceipt(receiptParser(), repos.ownerMemory, categories, repos.people, settings, attempts, systemClock, {
          // One budget per account for every AI feature: new ones must count under this same key.
          key: `ai:${userId}`,
          perDay: aiDailyLimit(process.env.AI_DAILY_LIMIT, process.env.RECEIPT_SCAN_DAILY_LIMIT),
        }),
      parseEntryText: () =>
        new ParseEntryText(textEntryParser(), categories, repos.people, repos.wallets, attempts, systemClock, {
          key: `ai:${userId}`, // the same budget as a receipt scan
          perDay: aiDailyLimit(process.env.AI_DAILY_LIMIT, process.env.RECEIPT_SCAN_DAILY_LIMIT),
        }),
      getMonthSummary: () =>
        new GetMonthSummary(stats, categories, createSummaryRepo(sequelize, userId), monthSummarizer(), attempts, systemClock, {
          key: `ai:${userId}`, // the same shared AI budget as parseReceipt
          perDay: aiDailyLimit(process.env.AI_DAILY_LIMIT, process.env.RECEIPT_SCAN_DAILY_LIMIT),
        }),
      findDuplicates: new FindDuplicates(repos.entries),
      recordBackfill: new RecordBackfill(tx, systemClock),
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
