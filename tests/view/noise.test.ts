import { describe, expect, it } from "vitest";
import { ValueNoise, hexToRgb, lerpRgb, ramp } from "../../src/view/noise";

describe("hexToRgb", () => {
  it("parses #rrggbb", () => {
    expect(hexToRgb("#ff5a1f")).toEqual([255, 90, 31]);
    expect(hexToRgb("#0c0e10")).toEqual([12, 14, 16]);
  });

  it("returns the cached color on repeat calls (texture loops call it per pixel)", () => {
    expect(hexToRgb("#123456")).toBe(hexToRgb("#123456"));
  });

  it("is not changed by lerping or ramping", () => {
    const a = hexToRgb("#000000");
    lerpRgb(a, [255, 255, 255], 0.5);
    ramp(["#000000", "#808080", "#ffffff"], 0.7);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });
});

describe("ramp", () => {
  it("hits the three stops", () => {
    const p = ["#000000", "#808080", "#ffffff"] as const;
    expect(ramp(p, 0)).toEqual([0, 0, 0]);
    expect(ramp(p, 0.5)).toEqual([128, 128, 128]);
    expect(ramp(p, 1)).toEqual([255, 255, 255]);
  });
});

describe("ValueNoise", () => {
  it("is deterministic per seed and stays in 0..1", () => {
    const a = new ValueNoise(7);
    const b = new ValueNoise(7);
    for (let i = 0; i < 50; i++) {
      const v = a.fbm(i * 0.37, i * 0.11, 5);
      expect(v).toBe(b.fbm(i * 0.37, i * 0.11, 5));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
