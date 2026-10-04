import { describe, expect, it } from "vitest";
import { matchesSpend } from "./spendFilter";

describe("matchesSpend", () => {
  const ours = { kind: "expense", othersShare: 0 };
  const fronted = { kind: "expense", othersShare: 5000 };
  const income = { kind: "income", othersShare: 0 };
  it("keeps everything under all", () => {
    expect([ours, fronted, income].every((e) => matchesSpend(e, "all"))).toBe(true);
  });
  it("mine = expenses nobody else shares", () => {
    expect([ours, fronted, income].map((e) => matchesSpend(e, "mine"))).toEqual([true, false, false]);
  });
  it("fronted = expenses someone else owes a share of", () => {
    expect([ours, fronted, income].map((e) => matchesSpend(e, "fronted"))).toEqual([false, true, false]);
  });
});
