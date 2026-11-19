import { describe, expect, it } from "vitest";
import { FINDS, findById, findsForLayer } from "../../shared/data/finds";
import { ARRIVAL_SCOOPS, LAYERS } from "../../shared/data/layers";
import { SPOONS, isSpoonId, nextSpoonUnlock, spoonById, unlockedSpoons } from "../../shared/data/spoons";

describe("layers data", () => {
  it("has the eight canvas layers in order with ascending knots", () => {
    expect(LAYERS.map((l) => l.name["pt-BR"])).toEqual([
      "Quintal",
      "Minhocas",
      "Argila",
      "Fósseis",
      "Pré-Sal",
      "Lençol Freático",
      "Manto",
      "Núcleo",
    ]);
    expect(LAYERS.map((l) => l.startMeters)).toEqual([0, 2, 150, 1000, 7000, 10000, 35000, 2_900_000]);
    for (let i = 1; i < LAYERS.length; i++) {
      expect(LAYERS[i]!.startScoops).toBeGreaterThan(LAYERS[i - 1]!.startScoops);
      expect(Number.isSafeInteger(LAYERS[i]!.startScoops)).toBe(true);
    }
    expect(ARRIVAL_SCOOPS).toBeGreaterThan(LAYERS.at(-1)!.startScoops);
  });

  it("has every text in both languages and three palette colors", () => {
    for (const l of LAYERS) {
      for (const field of [l.name, l.line, l.joke]) {
        expect(field.en.length).toBeGreaterThan(0);
        expect(field["pt-BR"].length).toBeGreaterThan(0);
      }
      expect(l.palette).toHaveLength(3);
      for (const c of l.palette) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps the canvas lines on the core box", () => {
    expect(LAYERS[0]!.line["pt-BR"]).toBe("Terra preta e raiz.");
    expect(LAYERS[7]!.line["pt-BR"]).toBe("Ferro. Ainda não esfriou.");
    expect(LAYERS[4]!.joke["pt-BR"]).toBe(
      "Sal em cima, pedra preta embaixo. Dizem que tem petróleo. Ninguém aqui trouxe balde pra isso.",
    );
  });
});

describe("spoons data", () => {
  it("has the eight canvas spoons with ascending unlocks", () => {
    expect(SPOONS.map((s) => s.unlockAt)).toEqual([0, 100, 500, 1000, 5000, 10000, 25000, null]);
    expect(SPOONS.map((s) => s.name["pt-BR"])).toEqual([
      "Colher de chá",
      "Colher de sopa",
      "Colher de pau",
      "Colher de plástico",
      "Prata da vó",
      "Esmaltada",
      "Colher torta",
      "Colher dourada",
    ]);
    for (const s of SPOONS) expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("unlocks by lifetime scoops; the golden spoon only at a season end", () => {
    expect(unlockedSpoons(0, false)).toEqual(["teaspoon"]);
    expect(unlockedSpoons(100, false)).toEqual(["teaspoon", "soup"]);
    expect(unlockedSpoons(1_000_000, false)).not.toContain("golden");
    expect(unlockedSpoons(0, true)).toEqual(["teaspoon", "golden"]);
    expect(unlockedSpoons(Number.NaN, false)).toEqual(["teaspoon"]);
  });

  it("knows the next unlock", () => {
    expect(nextSpoonUnlock(0)?.id).toBe("soup");
    expect(nextSpoonUnlock(24_999)?.id).toBe("bent");
    expect(nextSpoonUnlock(25_000)).toBeNull();
  });

  it("validates ids", () => {
    expect(isSpoonId("wooden")).toBe(true);
    expect(isSpoonId("spork")).toBe(false);
    expect(isSpoonId(3)).toBe(false);
    expect(spoonById("golden").finish).toBe("gold");
  });
});

describe("finds data", () => {
  it("has at least one find per layer, with both languages and unique ids", () => {
    for (const l of LAYERS) expect(findsForLayer(l.id).length).toBeGreaterThan(0);
    expect(new Set(FINDS.map((f) => f.id)).size).toBe(FINDS.length);
    for (const f of FINDS) {
      expect(f.text.en).not.toBe("");
      expect(f.text["pt-BR"]).not.toBe("");
    }
    expect(findById("bone")?.text["pt-BR"]).toBe("um osso");
    expect(findById("nope")).toBeUndefined();
  });
});
