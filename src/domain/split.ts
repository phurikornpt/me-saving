import { DomainError } from "./errors";
import { assertSatang, type Satang } from "./money";

/** What one person owes us for one entry. People are the user's own contacts, not accounts. */
export interface Share {
  personId: string;
  amount: Satang;
}

/**
 * How a fronted expense is divided ("ออกก่อน"). Every division rounds down per person, so the odd
 * satang always stays with us and nobody is ever charged more than their fair part.
 */
export type SplitMode =
  | { kind: "none" }
  /** Us and these people pay the same part. */
  | { kind: "equal"; people: string[] }
  /** Only these people pay, in equal parts; we pay nothing. */
  | { kind: "theirs"; people: string[] }
  | { kind: "custom"; shares: Share[] };

function assertPeople(people: string[]): void {
  if (people.length === 0) throw new DomainError("INVALID_SPLIT", "pick at least one person");
  if (new Set(people).size !== people.length) throw new DomainError("INVALID_SPLIT", "a person is listed twice");
}

/** Each of `people` gets floor(amount / parts); the leftover is ours. */
const equalParts = (amount: Satang, people: string[], parts: number): Share[] => {
  const each = Math.floor(amount / parts);
  return each === 0 ? [] : people.map((personId) => ({ personId, amount: each }));
};

export function sharesFor(total: Satang, mode: SplitMode): Share[] {
  assertSatang(total);
  switch (mode.kind) {
    case "none":
      return [];
    case "equal":
      assertPeople(mode.people);
      return equalParts(total, mode.people, mode.people.length + 1);
    case "theirs":
      assertPeople(mode.people);
      return equalParts(total, mode.people, mode.people.length);
    case "custom": {
      assertPeople(mode.shares.map((s) => s.personId));
      mode.shares.forEach((s) => assertSatang(s.amount));
      if (sumShares(mode.shares) > total) throw new DomainError("INVALID_SPLIT", "shares exceed the total");
      return mode.shares.filter((s) => s.amount > 0);
    }
  }
}

export const sumShares = (shares: Share[]): Satang => shares.reduce((s, x) => s + x.amount, 0);

/** Who a receipt line (or hand-typed item) is for. Its price is divided equally between them. */
export interface LineOwners {
  me: boolean;
  people: string[];
}

export const ME_ONLY: LineOwners = { me: true, people: [] };

export function assertLineOwners(o: LineOwners): void {
  if (!o.me && o.people.length === 0) throw new DomainError("INVALID_SPLIT", "a line needs an owner");
  if (new Set(o.people).size !== o.people.length) throw new DomainError("INVALID_SPLIT", "a person is listed twice");
}

export function lineShares(price: Satang, owners: LineOwners): Share[] {
  assertSatang(price);
  assertLineOwners(owners);
  return equalParts(price, owners.people, owners.people.length + (owners.me ? 1 : 0));
}

/** Roll lines up into one share per person, in the order people first appear. */
export function sharesOfLines(lines: { price: Satang; owners: LineOwners }[]): Share[] {
  const byPerson = new Map<string, Satang>();
  for (const l of lines) {
    for (const s of lineShares(l.price, l.owners)) byPerson.set(s.personId, (byPerson.get(s.personId) ?? 0) + s.amount);
  }
  return [...byPerson].map(([personId, amount]) => ({ personId, amount }));
}
