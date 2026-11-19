import { describe, expect, it } from "vitest";
import { dictionary, initialLocale, interpolate, placeholders, translate } from "../../src/i18n";
import { en } from "../../src/i18n/en";
import { ptBR } from "../../src/i18n/pt-BR";

describe("i18n", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
  });

  it("has the same placeholders for every key, and no empty strings", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ptBR[key]), key).toEqual(placeholders(en[key]));
      expect(en[key].length, key).toBeGreaterThan(0);
      expect(ptBR[key].length, key).toBeGreaterThan(0);
    }
  });

  it("keeps the canvas copy in PT-BR", () => {
    const pt = dictionary("pt-BR");
    expect(pt["landing.grab"]).toBe("Pegar uma colher");
    expect(pt["dig.hint"]).toBe("Clique no buraco ou aperte espaço para cavar");
    expect(pt["milestone.kicker"]).toBe("nova camada · o mundo inteiro chegou junto");
    expect(pt["share.privacy"]).toBe("Nenhum dado seu vai junto: só os números.");
    expect(pt["arrival.text"]).toBe("Saímos num jardim de pedras em Quioto. O dono ainda não viu.");
  });

  it("interpolates params and leaves unknown ones", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
    expect(translate("pt-BR", "share.progress", { percent: "0,07%" })).toBe(
      "Estamos a 0,07% do Japão. Falta você.",
    );
  });

  it("starts in English unless the player chose or the URL says otherwise", () => {
    expect(initialLocale(null, "")).toBe("en");
    expect(initialLocale("pt-BR", "")).toBe("pt-BR");
    expect(initialLocale(null, "?lang=pt")).toBe("pt-BR");
    expect(initialLocale("pt-BR", "?lang=en")).toBe("en");
  });
});
