import { balances, outstandingByEntry, type OutstandingItem } from "@/domain/ledger";
import type { Satang } from "@/domain/money";
import type { Repos } from "../ports";

export interface PersonOutstanding {
  personId: string;
  balance: Satang;
  items: OutstandingItem[];
}

/** Everyone who still owes us something, biggest balance first, with the entries it comes from. */
export class GetOutstanding {
  constructor(private readonly repos: Repos) {}

  async execute(): Promise<PersonOutstanding[]> {
    const ledger = await this.repos.entries.ledger();
    return [...balances(ledger)]
      .filter(([, balance]) => balance > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([personId, balance]) => ({ personId, balance, items: outstandingByEntry(ledger, personId) }));
  }
}
