"use client";

import { activeWallets, defaultWalletId } from "@/client/wallets";
import type { WalletDTO } from "@/client/types";
import { Icon } from "./Icon";

/**
 * Pick a wallet. Shows nothing with only one wallet, so people who never set up a second one never see
 * an extra control. `value` null = the default wallet.
 */
export function WalletPicker({
  wallets, value, onChange, label = "กระเป๋า", exclude,
}: { wallets: WalletDTO[]; value: string | null; onChange: (id: string) => void; label?: string; exclude?: string | null }) {
  const visible = activeWallets(wallets).filter((w) => w.id !== exclude);
  if (activeWallets(wallets).length <= 1) return null;
  const selected = value ?? defaultWalletId(wallets);
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={label}>
      {visible.map((w) => (
        <button
          key={w.id}
          type="button"
          className="pill flex shrink-0 items-center gap-1 text-sm"
          aria-pressed={w.id === selected}
          onClick={() => onChange(w.id)}
        >
          <Icon name={w.icon} size={18} /> {w.name}
        </button>
      ))}
    </div>
  );
}
