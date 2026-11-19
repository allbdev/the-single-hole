import { isSpoonId, type SpoonId } from "../../shared/data/spoons";

/**
 * Everything the game keeps in the browser. No account, no identity: language, sound, your own
 * scoop counts, chosen spoon, and what you last saw (for "while you were away").
 */
export interface LocalState {
  lang: "en" | "pt-BR" | null;
  sound: boolean;
  lifetimeScoops: number;
  /** Your scoops per season number. */
  seasonScoops: Record<string, number>;
  spoon: SpoonId;
  golden: boolean;
  /** Last world total and season you saw, and when. */
  lastSeen: { total: number; season: number; at: number } | null;
  /** Seasons whose arrival you have already been shown. */
  seenArrival: number;
}

export const DEFAULT_LOCAL_STATE: LocalState = {
  lang: null,
  sound: true,
  lifetimeScoops: 0,
  seasonScoops: {},
  spoon: "teaspoon",
  golden: false,
  lastSeen: null,
  seenArrival: 0,
};

const KEY = "um-buraco-so:v1";

const count = (x: unknown): number => (typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : 0);

/** Tolerant parse: anything wrong falls back to the default for that field. */
export function parseLocalState(text: string | null): LocalState {
  if (!text) return { ...DEFAULT_LOCAL_STATE };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ...DEFAULT_LOCAL_STATE };
  }
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_LOCAL_STATE };
  const r = raw as Record<string, unknown>;
  const seasonScoops: Record<string, number> = {};
  if (typeof r.seasonScoops === "object" && r.seasonScoops !== null) {
    for (const [k, v] of Object.entries(r.seasonScoops)) if (/^\d+$/.test(k)) seasonScoops[k] = count(v);
  }
  const ls = r.lastSeen as Record<string, unknown> | null | undefined;
  return {
    lang: r.lang === "en" || r.lang === "pt-BR" ? r.lang : null,
    sound: typeof r.sound === "boolean" ? r.sound : true,
    lifetimeScoops: count(r.lifetimeScoops),
    seasonScoops,
    spoon: isSpoonId(r.spoon) ? r.spoon : "teaspoon",
    golden: r.golden === true,
    lastSeen:
      ls && typeof ls === "object" && count(ls.season) > 0
        ? { total: count(ls.total), season: count(ls.season), at: count(ls.at) }
        : null,
    seenArrival: count(r.seenArrival),
  };
}

/** Reads and writes `LocalState`, surviving private windows and blocked storage. */
export class LocalStore {
  private state: LocalState;

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem"> | null) {
    let text: string | null;
    try {
      text = storage?.getItem(KEY) ?? null;
    } catch {
      text = null;
    }
    this.state = parseLocalState(text);
  }

  get value(): Readonly<LocalState> {
    return this.state;
  }

  update(patch: Partial<LocalState>): void {
    this.state = { ...this.state, ...patch };
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Storage full or blocked: keep going in memory.
    }
  }

  addScoops(n: number, season: number): void {
    if (n <= 0) return;
    const key = String(season);
    this.update({
      lifetimeScoops: this.state.lifetimeScoops + n,
      seasonScoops: { ...this.state.seasonScoops, [key]: (this.state.seasonScoops[key] ?? 0) + n },
    });
  }

  seasonScoopsFor(season: number): number {
    return this.state.seasonScoops[String(season)] ?? 0;
  }
}
