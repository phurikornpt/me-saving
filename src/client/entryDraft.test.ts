import { describe, expect, it } from "vitest";
import { draftProblem, parseFailureMessage, splitOf } from "./entryDraft";

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
