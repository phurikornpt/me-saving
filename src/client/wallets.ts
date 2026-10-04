import type { WalletDTO } from "./types";

export const activeWallets = (wallets: WalletDTO[]) => wallets.filter((w) => !w.archived);

/** Where an entry goes when nothing is picked (mirrors the server: the default, else the first active one). */
export const defaultWalletId = (wallets: WalletDTO[]): string | null =>
  (wallets.find((w) => w.isDefault && !w.archived) ?? activeWallets(wallets)[0])?.id ?? null;

export const walletOf = (wallets: WalletDTO[], id: string | null | undefined) => wallets.find((w) => w.id === id);

export const walletName = (wallets: WalletDTO[], id: string | null | undefined) => walletOf(wallets, id)?.name ?? "กระเป๋า";
