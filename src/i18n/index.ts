import { en, type MessageKey } from "./en";
import { ptBR } from "./pt-BR";

export type Locale = "en" | "pt-BR";
export const LOCALES: readonly Locale[] = ["en", "pt-BR"];
export type { MessageKey };

const DICTS: Record<Locale, Record<MessageKey, string>> = { en, "pt-BR": ptBR };

export type Params = Record<string, string | number>;

/** Replace `{name}` placeholders. Unknown placeholders are left as they are. */
export function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return interpolate(DICTS[locale][key], params);
}

export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

export function dictionary(locale: Locale): Readonly<Record<MessageKey, string>> {
  return DICTS[locale];
}

/**
 * Pick the starting language: a remembered choice, then a `?lang=` URL override, then English
 * (the plan's default).
 */
export function initialLocale(stored: Locale | null, search: string): Locale {
  const fromUrl = new URLSearchParams(search).get("lang");
  if (fromUrl === "pt-BR" || fromUrl === "pt") return "pt-BR";
  if (fromUrl === "en") return "en";
  return stored ?? "en";
}

/** Pick a localized field from data (`{ en, "pt-BR" }`). */
export function pick(locale: Locale, text: { en: string; "pt-BR": string }): string {
  return text[locale];
}
