/** The spoons on the canvas ("Spoons: the players"). Cosmetic only: every spoon digs the same. */
export type SpoonId =
  "teaspoon" | "soup" | "wooden" | "plastic" | "grandmaSilver" | "enamel" | "bent" | "golden";

export type SpoonFinish = "mirror" | "brushed" | "wood" | "plastic" | "tarnished" | "enamel" | "gold";

export interface SpoonData {
  id: SpoonId;
  name: { en: string; "pt-BR": string };
  line: { en: string; "pt-BR": string };
  /** Lifetime scoops needed, or null when unlocked another way (the golden spoon). */
  unlockAt: number | null;
  finish: SpoonFinish;
  /** Base color for the material. */
  color: string;
  /** Bowl kink in radians (the bent spoon). */
  bend: number;
  /** Bowl scale (soup spoon is bigger). */
  size: number;
}

export const SPOONS: readonly SpoonData[] = [
  {
    id: "teaspoon",
    name: { en: "Teaspoon", "pt-BR": "Colher de chá" },
    line: { en: "Stainless. Everyone starts here.", "pt-BR": "Inox. Todo mundo começa aqui." },
    unlockAt: 0,
    finish: "mirror",
    color: "#d9dde0",
    bend: 0,
    size: 0.8,
  },
  {
    id: "soup",
    name: { en: "Soup spoon", "pt-BR": "Colher de sopa" },
    line: { en: "Brushed steel.", "pt-BR": "Inox escovado." },
    unlockAt: 100,
    finish: "brushed",
    color: "#c4c8cb",
    bend: 0,
    size: 1,
  },
  {
    id: "wooden",
    name: { en: "Wooden spoon", "pt-BR": "Colher de pau" },
    line: { en: "From the kitchen drawer.", "pt-BR": "Da gaveta da cozinha." },
    unlockAt: 500,
    finish: "wood",
    color: "#a97a4a",
    bend: 0,
    size: 1.05,
  },
  {
    id: "plastic",
    name: { en: "Plastic spoon", "pt-BR": "Colher de plástico" },
    line: { en: "Left over from the birthday party.", "pt-BR": "Sobrou do aniversário." },
    unlockAt: 1_000,
    finish: "plastic",
    color: "#f1efe9",
    bend: 0,
    size: 0.85,
  },
  {
    id: "grandmaSilver",
    name: { en: "Grandma's silver", "pt-BR": "Prata da vó" },
    line: { en: "It was never supposed to leave the house.", "pt-BR": "Não era pra sair de casa." },
    unlockAt: 5_000,
    finish: "tarnished",
    color: "#a9a49a",
    bend: 0,
    size: 0.95,
  },
  {
    id: "enamel",
    name: { en: "Enamel spoon", "pt-BR": "Esmaltada" },
    line: { en: "From a camping trip.", "pt-BR": "De acampamento." },
    unlockAt: 10_000,
    finish: "enamel",
    color: "#2f5d8a",
    bend: 0,
    size: 1,
  },
  {
    id: "bent",
    name: { en: "Bent spoon", "pt-BR": "Colher torta" },
    line: { en: "Dug too much.", "pt-BR": "Cavou demais." },
    unlockAt: 25_000,
    finish: "brushed",
    color: "#bfc3c6",
    bend: 0.45,
    size: 1,
  },
  {
    id: "golden",
    name: { en: "Golden spoon", "pt-BR": "Colher dourada" },
    line: {
      en: "Only for those online at the arrival.",
      "pt-BR": "Só pra quem estava online na chegada.",
    },
    unlockAt: null,
    finish: "gold",
    color: "#d4a93c",
    bend: 0,
    size: 1,
  },
];

export const SPOON_IDS: readonly SpoonId[] = SPOONS.map((s) => s.id);

export function isSpoonId(value: unknown): value is SpoonId {
  return typeof value === "string" && (SPOON_IDS as readonly string[]).includes(value);
}

export function spoonById(id: SpoonId): SpoonData {
  return SPOONS.find((s) => s.id === id)!;
}

/** Spoons unlocked by a lifetime scoop count (plus the golden one when earned). */
export function unlockedSpoons(lifetimeScoops: number, hasGolden: boolean): SpoonId[] {
  const n = Number.isFinite(lifetimeScoops) ? lifetimeScoops : 0;
  return SPOONS.filter((s) => (s.unlockAt === null ? hasGolden : n >= s.unlockAt)).map((s) => s.id);
}

/** The next spoon to unlock by scoops, or null when all are unlocked. */
export function nextSpoonUnlock(lifetimeScoops: number): SpoonData | null {
  return SPOONS.find((s) => s.unlockAt !== null && lifetimeScoops < s.unlockAt) ?? null;
}
