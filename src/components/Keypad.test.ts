import { describe, expect, it } from "vitest";
import { pressKey } from "./Keypad";

const type = (keys: string[]) => keys.reduce(pressKey, "");

describe("pressKey", () => {
  it("builds numbers", () => expect(type(["1", "2", "0"])).toBe("120"));
  it("no leading zeros", () => expect(type(["0", "0", "5"])).toBe("5"));
  it("a lone dot becomes 0.", () => expect(type(["."])).toBe("0."));
  it("one dot only", () => expect(type(["1", ".", "5", "."])).toBe("1.5"));
  it("max two decimals", () => expect(type(["1", ".", "2", "3", "4"])).toBe("1.23"));
  it("backspace", () => expect(type(["1", "2", "⌫"])).toBe("1"));
  it("backspace on empty is a no-op", () => expect(pressKey("", "⌫")).toBe(""));
  it("caps the length", () => expect(type(Array(15).fill("9")).length).toBe(9));
});
