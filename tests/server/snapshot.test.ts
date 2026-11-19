import { describe, expect, it } from "vitest";
import { ARRIVAL_SCOOPS } from "../../shared/data/layers";
import { chooseSnapshot, emptySnapshot, validateSnapshot } from "../../server/snapshot";

const good = () => ({ ...emptySnapshot(1000), total: 42, countries: { BR: 42 }, days: [[1, 42]] });

describe("validateSnapshot", () => {
  it("accepts a good snapshot", () => {
    expect(validateSnapshot(good())).toMatchObject({ total: 42, countries: { BR: 42 } });
  });

  it.each([
    ["null", null],
    ["wrong version", { ...good(), v: 2 }],
    ["negative total", { ...good(), total: -1 }],
    ["total past Japan", { ...good(), total: ARRIVAL_SCOOPS + 1 }],
    ["fractional total", { ...good(), total: 1.5 }],
    ["bad country code", { ...good(), countries: { brasil: 1 } }],
    ["bad country count", { ...good(), countries: { BR: "1" } }],
    ["short layer list", { ...good(), season: { number: 1, startedAt: 0, layerEnteredAt: [0] } }],
    ["season zero", { ...good(), season: { ...emptySnapshot(0).season, number: 0 } }],
    ["bad days", { ...good(), days: [["x", 1]] }],
    ["bad fame", { ...good(), fame: [{ season: 1 }] }],
  ])("rejects %s", (_n, data) => {
    expect(validateSnapshot(data)).toBeNull();
  });
});

describe("chooseSnapshot", () => {
  const text = JSON.stringify(good());
  it("prefers the primary, falls back to the backup", () => {
    expect(chooseSnapshot(text, null).source).toBe("primary");
    expect(chooseSnapshot("{corrupt", text).source).toBe("backup");
  });

  it("reports 'none' only when nothing was ever saved", () => {
    expect(chooseSnapshot(null, null)).toEqual({ snapshot: null, source: "none" });
  });

  it("never silently resets: corrupt files are reported as corrupt", () => {
    expect(chooseSnapshot("{corrupt", "also bad")).toEqual({ snapshot: null, source: "corrupt" });
    expect(chooseSnapshot("{corrupt", null).source).toBe("corrupt");
  });
});
