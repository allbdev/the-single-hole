/**
 * The eight layers on the design canvas ("Layers as core samples").
 *
 * `startScoops`/`startMeters` are the knots of a piecewise-linear curve: meters per scoop grow with
 * depth. The knots are calibrated to the canvas: 9.381.220 scoops reach 8.919,4 m (inside the
 * Pré-Sal), and 13.412.006 scoops reach Japan at 12.742 km.
 */
export type LayerId =
  "backyard" | "worms" | "clay" | "fossils" | "preSalt" | "groundwater" | "mantle" | "core";

export interface LayerData {
  id: LayerId;
  name: { en: string; "pt-BR": string };
  line: { en: string; "pt-BR": string };
  /** Milestone card joke. */
  joke: { en: string; "pt-BR": string };
  startScoops: number;
  startMeters: number;
  /** Base colors for the procedural material and the core sample (light to dark). */
  palette: [string, string, string];
}

export const LAYERS: readonly LayerData[] = [
  {
    id: "backyard",
    name: { en: "Backyard", "pt-BR": "Quintal" },
    line: { en: "Black soil and roots.", "pt-BR": "Terra preta e raiz." },
    joke: {
      en: "The grass is gone. Someone will have to explain this to the landlord.",
      "pt-BR": "A grama já era. Alguém vai ter que explicar isso pro dono da casa.",
    },
    startScoops: 0,
    startMeters: 0,
    palette: ["#5b4632", "#3a2b1f", "#1f1711"],
  },
  {
    id: "worms",
    name: { en: "Worms", "pt-BR": "Minhocas" },
    line: { en: "Soil, pebbles, worms.", "pt-BR": "Terra, pedrinha, minhoca." },
    joke: {
      en: "The worms were here first. They are not impressed.",
      "pt-BR": "As minhocas chegaram primeiro. Elas não estão impressionadas.",
    },
    startScoops: 20_000,
    startMeters: 2,
    palette: ["#6e5238", "#4a3626", "#2b2018"],
  },
  {
    id: "clay",
    name: { en: "Clay", "pt-BR": "Argila" },
    line: { en: "Red, sticks to the spoon.", "pt-BR": "Vermelha, gruda na colher." },
    joke: {
      en: "Red clay. Every spoon on Earth now needs a wash.",
      "pt-BR": "Argila vermelha. Toda colher do planeta agora precisa de uma lavada.",
    },
    startScoops: 760_000,
    startMeters: 150,
    palette: ["#b0583a", "#8a3f27", "#5c2a1b"],
  },
  {
    id: "fossils",
    name: { en: "Fossils", "pt-BR": "Fósseis" },
    line: { en: "Limestone with shells.", "pt-BR": "Calcário com concha." },
    joke: {
      en: "Shells, a kilometre down. The sea was here. It left.",
      "pt-BR": "Concha a um quilômetro de fundura. O mar passou por aqui. E foi embora.",
    },
    startScoops: 2_885_000,
    startMeters: 1_000,
    palette: ["#d8cdb4", "#b9ab8c", "#8e8165"],
  },
  {
    id: "preSalt",
    name: { en: "Pre-Salt", "pt-BR": "Pré-Sal" },
    line: { en: "Salt on top, black rock below.", "pt-BR": "Sal em cima, pedra preta embaixo." },
    joke: {
      en: "Salt on top, black rock below. They say there's oil. Nobody brought a bucket for that.",
      "pt-BR":
        "Sal em cima, pedra preta embaixo. Dizem que tem petróleo. Ninguém aqui trouxe balde pra isso.",
    },
    startScoops: 8_885_000,
    startMeters: 7_000,
    palette: ["#e9e6df", "#5d5f61", "#1c1d1f"],
  },
  {
    id: "groundwater",
    name: { en: "Groundwater", "pt-BR": "Lençol Freático" },
    line: { en: "Wet sandstone.", "pt-BR": "Arenito molhado." },
    joke: {
      en: "Wet sandstone. The hole now has a puddle. Mind your socks.",
      "pt-BR": "Arenito molhado. O buraco agora tem poça. Cuidado com a meia.",
    },
    startScoops: 9_660_586,
    startMeters: 10_000,
    palette: ["#c79a62", "#9a7448", "#5e4a33"],
  },
  {
    id: "mantle",
    name: { en: "Mantle", "pt-BR": "Manto" },
    line: { en: "Green rock. Hot.", "pt-BR": "Pedra verde. Quente." },
    joke: {
      en: "Green rock, and it's hot. Plastic spoons, step back.",
      "pt-BR": "Pedra verde, e quente. Colher de plástico, um passo pra trás.",
    },
    startScoops: 10_160_586,
    startMeters: 35_000,
    palette: ["#6f8a4e", "#4b6233", "#2b3a1e"],
  },
  {
    id: "core",
    name: { en: "Core", "pt-BR": "Núcleo" },
    line: { en: "Iron. Still hasn't cooled.", "pt-BR": "Ferro. Ainda não esfriou." },
    joke: {
      en: "Iron, still hasn't cooled. From here on, it's downhill to Japan. Sort of.",
      "pt-BR": "Ferro, ainda não esfriou. Daqui pra frente é descida até o Japão. Mais ou menos.",
    },
    startScoops: 12_070_586,
    startMeters: 2_900_000,
    palette: ["#ffb347", "#d2582a", "#6b2210"],
  },
];

/** Where the hole comes out: Japan, through the middle of the Earth. */
export const ARRIVAL_METERS = 12_742_000;
/** Scoops for a whole season (the arrival board's total). */
export const ARRIVAL_SCOOPS = 13_412_006;
