import { describe, expect, it } from "vitest";
import { collapseToSingle, draftProblem, parseFailureMessage, splitOf } from "./entryDraft";
import type { EntryDraftDTO } from "./types";

describe("splitOf", () => {
  it("builds the split the save call needs", () => {
    expect(splitOf("expense", "equal", ["a"])).toEqual({ kind: "equal", people: ["a"] });
    expect(splitOf("expense", "theirs", ["a", "b"])).toEqual({ kind: "theirs", people: ["a", "b"] });
  });
  it("is all ours for income, none, or nobody picked", () => {
    expect(splitOf("income", "equal", ["a"])).toBeUndefined();
    expect(splitOf("expense", "none", ["a"])).toBeUndefined();
    expect(splitOf("expense", "equal", [])).toBeUndefined();
  });
});

describe("draftProblem", () => {
  it("needs an amount, and people when splitting", () => {
    expect(draftProblem(0, "none", [], "expense")).toContain("จำนวนเงิน");
    expect(draftProblem(6000, "equal", [], "expense")).toContain("เลือกคน");
    expect(draftProblem(6000, "equal", ["a"], "expense")).toBeNull();
    expect(draftProblem(6000, "none", [], "income")).toBeNull();
  });
});

describe("parseFailureMessage", () => {
  it("maps the AI failure codes like the scan screen", () => {
    expect(parseFailureMessage("RATE_LIMITED")).toContain("โควตา");
    expect(parseFailureMessage("AI_UNAVAILABLE")).toContain("AI พักอยู่");
    expect(parseFailureMessage("UNKNOWN")).toBeTruthy();
  });
});

describe("collapseToSingle", () => {
  const single = (o: object = {}): EntryDraftDTO => ({
    mode: "single", kind: "expense", amount: 6000, categoryId: "c1", note: "ข้าว", split: "equal", personIds: ["p"], walletId: null, uncertain: [], ...o,
  });
  const group: EntryDraftDTO = {
    mode: "group", name: "7-11", walletId: "w1", personIds: [], uncertain: [],
    lines: [
      { note: "นม", amount: 3000, categoryId: "c1", owners: { me: true, people: [] }, uncertain: [] },
      { note: "ไก่", amount: 4500, categoryId: "c1", owners: { me: true, people: [] }, uncertain: [] },
    ],
  };

  it("keeps one single expense as it is", () => {
    expect(collapseToSingle([single()])).toEqual({
      kind: "expense", amount: 6000, categoryId: "c1", note: "ข้าว", split: "equal", personIds: ["p"], walletId: null, uncertain: [],
    });
  });
  it("ignores incomes when there is an expense, and keeps one if that's all there is", () => {
    expect(collapseToSingle([single({ kind: "income", amount: 99 }), single()]).amount).toBe(6000);
    expect(collapseToSingle([single({ kind: "income", amount: 99 })])).toMatchObject({ kind: "income", amount: 99 });
  });
  it("merges a group: total = sum, note = its name and items", () => {
    expect(collapseToSingle([group])).toMatchObject({ kind: "expense", amount: 7500, note: "7-11: นม, ไก่", categoryId: "c1", walletId: "w1", split: "none" });
  });
  it("merges several expenses, dropping a category they don't share and flagging a missing amount", () => {
    const d = collapseToSingle([single({ categoryId: "c2" }), group, single({ amount: null, note: null })]);
    expect(d).toMatchObject({ amount: 13500, categoryId: null, note: "ข้าว, นม, ไก่", split: "none", personIds: [] });
    expect(d.uncertain).toContain("amount");
  });
});
