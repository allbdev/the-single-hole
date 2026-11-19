import type { LayerId } from "./layers";

/** Things the world digs up ("Alguém achou um osso"). Feed only; no gameplay effect. */
export interface FindData {
  id: string;
  layers: readonly LayerId[];
  text: { en: string; "pt-BR": string };
}

export const FINDS: readonly FindData[] = [
  { id: "bone", layers: ["backyard", "worms"], text: { en: "a bone", "pt-BR": "um osso" } },
  { id: "marble", layers: ["backyard"], text: { en: "a lost marble", "pt-BR": "uma bolinha de gude" } },
  { id: "coin", layers: ["backyard", "worms"], text: { en: "a 1994 coin", "pt-BR": "uma moeda de 1994" } },
  { id: "toy", layers: ["backyard"], text: { en: "a toy soldier", "pt-BR": "um soldadinho" } },
  { id: "pipe", layers: ["worms"], text: { en: "a water pipe (sorry)", "pt-BR": "um cano (foi mal)" } },
  {
    id: "potsherd",
    layers: ["clay"],
    text: { en: "a piece of old pottery", "pt-BR": "um caco de cerâmica" },
  },
  { id: "brick", layers: ["clay"], text: { en: "a whole brick", "pt-BR": "um tijolo inteiro" } },
  { id: "shell", layers: ["fossils"], text: { en: "a fossil shell", "pt-BR": "uma concha fóssil" } },
  { id: "tooth", layers: ["fossils"], text: { en: "a shark tooth", "pt-BR": "um dente de tubarão" } },
  { id: "oil", layers: ["preSalt"], text: { en: "a drop of oil", "pt-BR": "uma gota de petróleo" } },
  { id: "salt", layers: ["preSalt"], text: { en: "a perfect salt crystal", "pt-BR": "um cristal de sal" } },
  { id: "fish", layers: ["groundwater"], text: { en: "a very confused fish", "pt-BR": "um peixe confuso" } },
  { id: "olivine", layers: ["mantle"], text: { en: "a green gem", "pt-BR": "uma pedra verde" } },
  {
    id: "diamond",
    layers: ["mantle"],
    text: { en: "a diamond (allegedly)", "pt-BR": "um diamante (dizem)" },
  },
  {
    id: "meteorite",
    layers: ["core"],
    text: { en: "a hot iron pebble", "pt-BR": "uma pedrinha de ferro quente" },
  },
  {
    id: "spoon",
    layers: ["core"],
    text: { en: "someone else's spoon", "pt-BR": "a colher de outra pessoa" },
  },
];

export function findsForLayer(layer: LayerId): FindData[] {
  return FINDS.filter((f) => f.layers.includes(layer));
}

export function findById(id: string): FindData | undefined {
  return FINDS.find((f) => f.id === id);
}
