import { describe, expect, it } from "vitest";
import { globeDots, type Places } from "../../src/core/globe-dots";

const COUNTRIES: Record<string, [number, number]> = { BR: [-10, -55], JP: [36, 138] };
const REGIONS: Record<string, [number, number]> = { "BR-ES": [-19.7, -40.5], "BR-SP": [-22.2, -48.5] };
const places: Places = {
  country: (c) => COUNTRIES[c] ?? null,
  region: (c, r) => REGIONS[`${c}-${r}`] ?? null,
};

describe("globeDots", () => {
  it("puts a country without regions at its point", () => {
    expect(globeDots([{ code: "JP", players: 4, scoops: 0 }], places)).toEqual([
      { lat: 36, lon: 138, players: 4 },
    ]);
  });

  it("splits a country into its reported regions plus the rest at the country point", () => {
    const dots = globeDots(
      [{ code: "BR", players: 10, scoops: 0, regions: [{ code: "SP", players: 6 }] }],
      places,
    );
    expect(dots).toEqual([
      { lat: -22.2, lon: -48.5, players: 6 },
      { lat: -10, lon: -55, players: 4 },
    ]);
  });

  it("moves you to your region even when it wasn't reported", () => {
    const dots = globeDots([{ code: "BR", players: 1, scoops: 0 }], places, { country: "BR", region: "ES" });
    expect(dots).toEqual([{ lat: -19.7, lon: -40.5, players: 1 }]);
  });

  it("doesn't count you twice when your region is reported", () => {
    const dots = globeDots(
      [{ code: "BR", players: 3, scoops: 0, regions: [{ code: "ES", players: 3 }] }],
      places,
      { country: "BR", region: "ES" },
    );
    expect(dots).toEqual([{ lat: -19.7, lon: -40.5, players: 3 }]);
  });

  it("falls back to the country point for unknown regions and skips empty countries", () => {
    const dots = globeDots(
      [
        { code: "BR", players: 3, scoops: 0, regions: [{ code: "ZZ", players: 3 }] },
        { code: "JP", players: 0, scoops: 9 },
      ],
      places,
      { country: "BR", region: "ZZ" },
    );
    expect(dots).toEqual([{ lat: -10, lon: -55, players: 3 }]);
  });

  it("never reports more players than the country has", () => {
    const dots = globeDots(
      [{ code: "BR", players: 2, scoops: 0, regions: [{ code: "SP", players: 5 }] }],
      places,
    );
    expect(dots.reduce((a, d) => a + d.players, 0)).toBe(2);
  });
});
