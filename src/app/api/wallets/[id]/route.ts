import { api, readJson } from "@/lib/http";
import { container } from "@/lib/container";
import { walletPatchBody } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

// No DELETE: wallets are archived (hidden), so old entries keep their wallet.
export const PATCH = api<Ctx>(async (req, { params }, me) => {
  const { id } = await params;
  const { isDefault, ...patch } = await readJson(req, walletPatchBody.parse);
  const wallets = container().forUser(me.userId).manageWallets;
  const out = await wallets.update(id, patch);
  if (!isDefault) return out;
  return (await wallets.setDefault(id)).find((w) => w.id === id);
});
