import { describe, expect, it } from "vitest";
import { createFakeRepos, FixedClock } from "../testing/fakes";
import { DeleteEntry, UpdateEntry } from "./change-entry";
import { ManageWallets } from "./manage-wallets";
import { RecordEntry } from "./record-entry";
import { RecordRepayment } from "./record-repayment";
import { RecordTransfer } from "./record-transfer";
import { SaveReceiptEntry } from "./save-receipt-entry";

const NOON = new Date("2026-10-03T05:00:00Z");
const FAN = "p-fan";
const CASH = "w-cash"; // default wallet in createFakeRepos
const BANK = "w-bank";

function setup() {
  const fake = createFakeRepos();
  const clock = new FixedClock(NOON);
  return {
    ...fake,
    recordEntry: new RecordEntry(fake.tx, clock),
    recordRepayment: new RecordRepayment(fake.tx, clock),
    recordTransfer: new RecordTransfer(fake.tx, clock),
    saveReceipt: new SaveReceiptEntry(fake.tx, clock),
    updateEntry: new UpdateEntry(fake.tx),
    deleteEntry: new DeleteEntry(fake.tx),
    wallets: new ManageWallets(fake.tx),
  };
}

const balanceOf = async (s: ReturnType<typeof setup>, id: string) =>
  (await s.wallets.list()).find((w) => w.id === id)!.balance;

describe("wallets on entries", () => {
  it("entries go to the default wallet unless one is picked", async () => {
    const s = setup();
    const a = await s.recordEntry.execute({ kind: "expense", total: 100 });
    const b = await s.recordEntry.execute({ kind: "income", total: 500, walletId: BANK });
    const d = await s.saveReceipt.execute({
      total: 300,
      lines: [{ rawName: "x", canonicalName: "x", qty: 1, price: 300, owners: { me: true, people: [] } }],
    });
    expect([a.entry.walletId, b.entry.walletId, d.entry.walletId]).toEqual([CASH, BANK, CASH]);
    expect(a.entry.toWalletId).toBeNull();
  });

  it("the default follows settings, and falls back to the first active wallet when it is archived", async () => {
    const s = setup();
    await s.wallets.setDefault(BANK);
    expect((await s.recordEntry.execute({ kind: "expense", total: 100 })).entry.walletId).toBe(BANK);
    await s.wallets.update(BANK, { archived: true });
    expect((await s.recordEntry.execute({ kind: "expense", total: 100 })).entry.walletId).toBe(CASH);
  });

  it("refuses an unknown or archived wallet", async () => {
    const s = setup();
    await expect(s.recordEntry.execute({ kind: "expense", total: 100, walletId: "nope" })).rejects.toMatchObject({
      code: "UNKNOWN_WALLET",
    });
    await s.wallets.update(BANK, { archived: true });
    await expect(s.recordEntry.execute({ kind: "expense", total: 100, walletId: BANK })).rejects.toMatchObject({
      code: "UNKNOWN_WALLET",
    });
    expect(s.entries).toHaveLength(0);
  });

  it("a fronted expense takes the full total out; the repayment brings it back in", async () => {
    const s = setup();
    await s.recordEntry.execute({ kind: "expense", total: 10000, split: { kind: "equal", people: [FAN] } });
    expect(await balanceOf(s, CASH)).toBe(-10000);
    await s.recordRepayment.execute({ personId: FAN, amount: 5000, walletId: BANK });
    expect(await balanceOf(s, BANK)).toBe(5000);
  });
});

describe("RecordTransfer", () => {
  it("moves money between two wallets, with no XP or streak", async () => {
    const s = setup();
    await s.recordEntry.execute({ kind: "income", total: 50000, walletId: BANK });
    const xpBefore = s.xp.length;
    const { entry } = await s.recordTransfer.execute({ fromWalletId: BANK, toWalletId: CASH, amount: 20000 });
    expect(entry).toMatchObject({ kind: "transfer", walletId: BANK, toWalletId: CASH, total: 20000, shares: [] });
    expect(await balanceOf(s, BANK)).toBe(30000);
    expect(await balanceOf(s, CASH)).toBe(20000);
    expect(s.xp.length).toBe(xpBefore);
  });

  it("refuses the same wallet twice, zero, and unknown wallets", async () => {
    const s = setup();
    await expect(s.recordTransfer.execute({ fromWalletId: CASH, toWalletId: CASH, amount: 100 })).rejects.toMatchObject({
      code: "INVALID_TRANSFER",
    });
    await expect(s.recordTransfer.execute({ fromWalletId: CASH, toWalletId: BANK, amount: 0 })).rejects.toMatchObject({
      code: "INVALID_AMOUNT",
    });
    await expect(s.recordTransfer.execute({ fromWalletId: CASH, toWalletId: "nope", amount: 100 })).rejects.toMatchObject({
      code: "UNKNOWN_WALLET",
    });
    expect(s.entries).toHaveLength(0);
  });
});

describe("UpdateEntry and wallets", () => {
  it("moves an entry to another wallet", async () => {
    const s = setup();
    const { entry } = await s.recordEntry.execute({ kind: "expense", total: 100 });
    const out = await s.updateEntry.execute(entry.id, { walletId: BANK });
    expect(out.walletId).toBe(BANK);
    expect(await balanceOf(s, CASH)).toBe(0);
    expect(await balanceOf(s, BANK)).toBe(-100);
  });

  it("edits a transfer's ends, never to the same wallet; other kinds have no 'to'", async () => {
    const s = setup();
    const { entry: t } = await s.recordTransfer.execute({ fromWalletId: BANK, toWalletId: CASH, amount: 100 });
    await expect(s.updateEntry.execute(t.id, { toWalletId: BANK })).rejects.toMatchObject({ code: "INVALID_TRANSFER" });
    const w = await s.wallets.create({ name: "บัตร", icon: "credit_card" });
    expect((await s.updateEntry.execute(t.id, { toWalletId: w.id, total: 300 })).toWalletId).toBe(w.id);

    const { entry: e } = await s.recordEntry.execute({ kind: "expense", total: 100 });
    await expect(s.updateEntry.execute(e.id, { toWalletId: BANK })).rejects.toMatchObject({ code: "INVALID_TRANSFER" });
  });

  it("an entry can stay on an archived wallet, but can't be moved onto one", async () => {
    const s = setup();
    const { entry } = await s.recordEntry.execute({ kind: "expense", total: 100, walletId: BANK });
    await s.wallets.update(BANK, { archived: true });
    expect((await s.updateEntry.execute(entry.id, { note: "ok" })).walletId).toBe(BANK);
    const { entry: other } = await s.recordEntry.execute({ kind: "expense", total: 100 });
    await expect(s.updateEntry.execute(other.id, { walletId: BANK })).rejects.toMatchObject({ code: "UNKNOWN_WALLET" });
  });
});

describe("ManageWallets", () => {
  it("creates with a starting balance, and 'set balance' works the opening out from what went through", async () => {
    const s = setup();
    const card = await s.wallets.create({ name: "  บัตร  ", icon: "credit_card", balance: -150000 });
    expect(card).toMatchObject({ name: "บัตร", balance: -150000, sort: 2, isDefault: false });

    await s.recordEntry.execute({ kind: "expense", total: 2000 });
    await s.recordEntry.execute({ kind: "income", total: 500 });
    const fixed = await s.wallets.update(CASH, { balance: 4200 });
    expect(fixed).toMatchObject({ balance: 4200, openingBalance: 5700 });
  });

  it("keeps at least one active wallet", async () => {
    const s = setup();
    await s.wallets.update(BANK, { archived: true });
    await expect(s.wallets.update(CASH, { archived: true })).rejects.toMatchObject({ code: "LAST_WALLET" });
    await expect(s.wallets.update("nope", { name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(s.wallets.setDefault(BANK)).rejects.toMatchObject({ code: "UNKNOWN_WALLET" });
  });

  it("marks the default", async () => {
    const s = setup();
    const list = await s.wallets.setDefault(BANK);
    expect(list.map((w) => [w.id, w.isDefault])).toEqual([[CASH, false], [BANK, true]]);
  });
});
