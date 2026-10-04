import { describe, expect, it } from "vitest";
import { summaryLines } from "./summaryLines";

describe("summaryLines", () => {
  it("one line per line, blank lines gone", () => {
    expect(summaryLines("ก\n\nข\n  ค  \n")).toEqual(["ก", "ข", "ค"]);
  });
  it("strips bullets the model sometimes adds", () => {
    expect(summaryLines("- ก\n• ข\n* ค")).toEqual(["ก", "ข", "ค"]);
  });
  it("a single paragraph stays one piece, and empty text gives nothing", () => {
    expect(summaryLines("เดือนนี้ใช้ไป ฿8,420")).toEqual(["เดือนนี้ใช้ไป ฿8,420"]);
    expect(summaryLines("  \n ")).toEqual([]);
  });
});
