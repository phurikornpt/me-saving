import { describe, expect, it } from "vitest";
import { parseFailureMessage } from "./entryDraft";

describe("parseFailureMessage", () => {
  it("maps the AI failure codes like the scan screen", () => {
    expect(parseFailureMessage("RATE_LIMITED")).toContain("โควตา");
    expect(parseFailureMessage("AI_UNAVAILABLE")).toContain("AI พักอยู่");
    expect(parseFailureMessage("UNKNOWN")).toBeTruthy();
  });
});
