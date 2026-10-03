"use client";

import { Icon } from "./Icon";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

/** Edits a baht string with at most 2 decimals and no leading zeros. Pure so it can be unit-tested. */
export function pressKey(current: string, key: string): string {
  if (key === "⌫") return current.slice(0, -1);
  if (key === ".") return current.includes(".") ? current : current === "" ? "0." : current + ".";
  const [, dec] = current.split(".");
  if (dec !== undefined && dec.length >= 2) return current;
  if (current === "0") return key === "0" ? current : key;
  if (current.replace(".", "").length >= 9) return current;
  return current + key;
}

export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-4 px-2 pt-2">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="btn3d key h-14 text-2xl"
          aria-label={k === "⌫" ? "ลบ" : k}
          onClick={() => onChange(pressKey(value, k))}
        >
          {k === "⌫" ? <Icon name="backspace" /> : k}
        </button>
      ))}
    </div>
  );
}
