import { describe, expect, it } from "vitest";
import { uploadScale } from "./resizeImage";

const size = (w: number, h: number) => {
  const s = uploadScale(w, h);
  return [Math.round(w * s), Math.round(h * s)];
};

describe("uploadScale", () => {
  it("keeps a camera photo at 1600px on the long side, as before", () => {
    expect(size(3000, 4000)).toEqual([1200, 1600]);
  });
  it("never enlarges a small picture", () => {
    expect(size(800, 1200)).toEqual([800, 1200]);
  });
  it("keeps a phone screenshot wide enough to read", () => {
    const [w, h] = size(1080, 2400);
    expect(w).toBeGreaterThanOrEqual(900);
    expect(h).toBeLessThanOrEqual(4096);
  });
  it("a long screenshot keeps its width as far as the height cap allows (was ~290px wide)", () => {
    const [w, h] = size(1080, 6000);
    expect(h).toBe(4096);
    expect(w).toBeGreaterThan(700);
  });
});
