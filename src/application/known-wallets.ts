import { DomainError } from "@/domain/errors";
import type { WalletRepo } from "./ports";

/**
 * The wallet a new entry goes to: the one picked, which must be one of the user's active wallets, or the
 * default wallet when none is picked (older clients never send one).
 */
export async function resolveWallet(wallets: WalletRepo, id: string | null | undefined): Promise<string> {
  if (id == null) {
    const fallback = await wallets.defaultId();
    if (!fallback) throw new DomainError("UNKNOWN_WALLET", "no active wallet");
    return fallback;
  }
  await assertActiveWallets(wallets, [id]);
  return id;
}

export async function assertActiveWallets(wallets: WalletRepo, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const active = new Set((await wallets.list()).filter((w) => !w.archived).map((w) => w.id));
  for (const id of ids) if (!active.has(id)) throw new DomainError("UNKNOWN_WALLET", `unknown wallet ${id}`);
}
