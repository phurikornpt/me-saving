import { outstandingByEntry, partnerBalance, type OutstandingItem } from "@/domain/partner";
import type { Satang } from "@/domain/money";
import type { Repos } from "../ports";

export class GetPartnerOutstanding {
  constructor(private readonly repos: Repos) {}

  async execute(): Promise<{ balance: Satang; items: OutstandingItem[] }> {
    const { expenses, repayments } = await this.repos.entries.partnerLedger();
    return {
      balance: partnerBalance(expenses, repayments),
      items: outstandingByEntry(expenses, repayments),
    };
  }
}
