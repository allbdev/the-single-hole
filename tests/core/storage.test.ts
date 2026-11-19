import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_STATE, LocalStore, parseLocalState } from "../../src/core/storage";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("parseLocalState", () => {
  it("falls back to defaults for missing or corrupt data", () => {
    expect(parseLocalState(null)).toEqual(DEFAULT_LOCAL_STATE);
    expect(parseLocalState("{broken")).toEqual(DEFAULT_LOCAL_STATE);
    expect(parseLocalState("42")).toEqual(DEFAULT_LOCAL_STATE);
  });

  it("keeps good fields and drops bad ones", () => {
    const s = parseLocalState(
      JSON.stringify({
        lang: "pt-BR",
        lifetimeScoops: 412,
        spoon: "spork",
        seasonScoops: { "1": 9, bad: 3, "2": -4 },
        golden: "yes",
        lastSeen: { total: 10, season: 1, at: 5 },
      }),
    );
    expect(s.lang).toBe("pt-BR");
    expect(s.lifetimeScoops).toBe(412);
    expect(s.spoon).toBe("teaspoon");
    expect(s.seasonScoops).toEqual({ "1": 9, "2": 0 });
    expect(s.golden).toBe(false);
    expect(s.lastSeen).toEqual({ total: 10, season: 1, at: 5 });
  });
});

describe("LocalStore", () => {
  it("persists updates and counts scoops per season", () => {
    const storage = memoryStorage();
    const store = new LocalStore(storage);
    store.addScoops(5, 1);
    store.addScoops(3, 2);
    store.addScoops(0, 2);
    const again = new LocalStore(storage);
    expect(again.value.lifetimeScoops).toBe(8);
    expect(again.seasonScoopsFor(1)).toBe(5);
    expect(again.seasonScoopsFor(2)).toBe(3);
    expect(again.seasonScoopsFor(3)).toBe(0);
  });

  it("works without storage or when storage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const store = new LocalStore(throwing);
    store.update({ sound: false });
    expect(store.value.sound).toBe(false);
    const none = new LocalStore(null);
    none.addScoops(2, 1);
    expect(none.value.lifetimeScoops).toBe(2);
  });
});
