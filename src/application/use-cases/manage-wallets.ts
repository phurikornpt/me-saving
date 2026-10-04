import { DomainError } from "@/domain/errors";
import type { Satang } from "@/domain/money";
import { assertSignedSatang, openingFor, walletBalance } from "@/domain/wallet";
import { assertActiveWallets } from "../known-wallets";
import type { TransactionRunner, WalletRecord, WalletRepo } from "../ports";

export interface WalletView extends WalletRecord {
  /** Opening balance + everything that went through it. Negative for a card that is owed. */
  balance: Satang;
  isDefault: boolean;
}

/** Every wallet (archived ones too, so old entries keep their name) with its balance now. */
export async function walletViews(wallets: WalletRepo): Promise<WalletView[]> {
  const [list, net, defaultId] = await Promise.all([wallets.list(), wallets.netFlows(), wallets.defaultId()]);
  return list.map((w) => ({ ...w, balance: walletBalance(w.openingBalance, net.get(w.id)), isDefault: w.id === defaultId }));
}

const cleanName = (name: string) => {
  const n = name.trim();
  if (!n) throw new DomainError("INVALID_WALLET", "a wallet needs a name");
  return n.slice(0, 40);
};

export interface WalletPatch {
  name?: string;
  icon?: string;
  sort?: number;
  archived?: boolean;
  /** What is really in the wallet now: the opening balance is worked out backwards from it. */
  balance?: Satang;
}

/** Wallets are archived (hidden), never deleted: old entries keep their wallet. */
export class ManageWallets {
  constructor(private readonly tx: TransactionRunner) {}

  list(): Promise<WalletView[]> {
    return this.tx.run((repos) => walletViews(repos.wallets));
  }

  create(w: { name: string; icon: string; balance?: Satang }): Promise<WalletView> {
    return this.tx.run(async (repos) => {
      const all = await repos.wallets.list();
      const created = await repos.wallets.create({
        name: cleanName(w.name),
        icon: w.icon,
        openingBalance: assertSignedSatang(w.balance ?? 0),
        sort: Math.max(-1, ...all.map((x) => x.sort)) + 1,
      });
      return (await walletViews(repos.wallets)).find((x) => x.id === created.id)!;
    });
  }

  update(id: string, patch: WalletPatch): Promise<WalletView> {
    return this.tx.run(async (repos) => {
      const all = await repos.wallets.list();
      const current = all.find((w) => w.id === id);
      if (!current) throw new DomainError("NOT_FOUND", "wallet not found");
      if (patch.archived && !current.archived && !all.some((w) => w.id !== id && !w.archived)) {
        throw new DomainError("LAST_WALLET", "keep at least one wallet");
      }
      const opening =
        patch.balance === undefined
          ? undefined
          : openingFor(assertSignedSatang(patch.balance), (await repos.wallets.netFlows()).get(id));
      await repos.wallets.update(id, {
        ...(patch.name !== undefined && { name: cleanName(patch.name) }),
        ...(patch.icon !== undefined && { icon: patch.icon }),
        ...(patch.sort !== undefined && { sort: patch.sort }),
        ...(patch.archived !== undefined && { archived: patch.archived }),
        ...(opening !== undefined && { openingBalance: opening }),
      });
      return (await walletViews(repos.wallets)).find((x) => x.id === id)!;
    });
  }

  /** Where new entries go unless another wallet is picked. */
  setDefault(id: string): Promise<WalletView[]> {
    return this.tx.run(async (repos) => {
      await assertActiveWallets(repos.wallets, [id]);
      await repos.wallets.setDefault(id);
      return walletViews(repos.wallets);
    });
  }
}
