import { LAYERS } from "../../shared/data/layers";
import { layerIndexAtScoops } from "../../shared/depth";
import type {
  CountryStat,
  FameEntry,
  FeedItem,
  RimSpoon,
  SeasonInfo,
  ServerMessage,
  WeekRate,
} from "../../shared/protocol";

/** What the client knows about the world, built only from server messages. */
export interface WorldState {
  connected: boolean;
  you: string | null;
  total: number;
  players: number;
  season: SeasonInfo;
  rim: RimSpoon[];
  countries: CountryStat[];
  feed: FeedItem[];
  week: WeekRate;
  fame: FameEntry[];
  /** Server clock minus local clock (ms). */
  clockOffset: number;
}

/** Things the UI reacts to (cards, sounds), derived while applying a message. */
export type WorldEvent =
  | { kind: "welcome"; firstTime: boolean }
  | { kind: "ack"; seq: number; accepted: number }
  | { kind: "layer"; layer: number }
  | { kind: "seasonEnd"; entry: FameEntry }
  | { kind: "feed"; item: FeedItem }
  | { kind: "error"; code: string };

export function initialWorld(now: number): WorldState {
  return {
    connected: false,
    you: null,
    total: 0,
    players: 0,
    season: { number: 0, startedAt: now, layerEnteredAt: LAYERS.map(() => null) },
    rim: [],
    countries: [],
    feed: [],
    week: { scoops: 0, spanMs: 0 },
    fame: [],
    clockOffset: 0,
  };
}

const FEED_KEEP = 8;

/** Apply one server message. Returns the new state and any events. Never mutates the input. */
export function applyServerMessage(
  state: WorldState,
  msg: ServerMessage,
  localNow: number,
): { state: WorldState; events: WorldEvent[] } {
  const events: WorldEvent[] = [];
  let s = state;
  switch (msg.t) {
    case "welcome":
      events.push({ kind: "welcome", firstTime: state.you === null });
      s = {
        ...s,
        connected: true,
        you: msg.you,
        total: msg.total,
        players: msg.players,
        season: msg.season,
        rim: msg.rim,
        countries: msg.countries,
        feed: msg.feed.slice(-FEED_KEEP),
        week: msg.week,
        fame: msg.fame,
        clockOffset: msg.now - localNow,
      };
      break;
    case "state":
      s = { ...s, total: msg.total, players: msg.players, clockOffset: msg.now - localNow };
      break;
    case "ack":
      events.push({ kind: "ack", seq: msg.seq, accepted: msg.accepted });
      break;
    case "rim":
      s = { ...s, rim: msg.rim };
      break;
    case "world":
      s = { ...s, countries: msg.countries, week: msg.week };
      break;
    case "feed":
      if (!s.feed.some((f) => f.id === msg.item.id && f.at === msg.item.at)) {
        s = { ...s, feed: [...s.feed, msg.item].slice(-FEED_KEEP) };
        events.push({ kind: "feed", item: msg.item });
      }
      break;
    case "layer": {
      const before = s.season.layerEnteredAt;
      s = { ...s, season: msg.season };
      msg.season.layerEnteredAt.forEach((at, i) => {
        if (at !== null && before[i] == null && i > 0 && msg.season.number === state.season.number) {
          events.push({ kind: "layer", layer: i });
        }
      });
      break;
    }
    case "fame":
      s = { ...s, fame: msg.fame };
      break;
    case "seasonEnd":
      s = {
        ...s,
        season: msg.next,
        total: 0,
        feed: [],
        countries: s.countries.map((c) => ({ ...c, scoops: 0 })),
        fame: [msg.entry, ...s.fame.filter((f) => f.season !== msg.entry.season)],
      };
      events.push({ kind: "seasonEnd", entry: msg.entry });
      break;
    case "activity":
      break;
    case "error":
      events.push({ kind: "error", code: msg.code });
      break;
  }
  return { state: s, events };
}

export function currentLayerIndex(state: WorldState): number {
  return layerIndexAtScoops(state.total);
}

/** How long the world took to go from layer i-1 to layer i (ms), or null. */
export function layerDuration(season: SeasonInfo, layer: number): number | null {
  const start = season.layerEnteredAt[layer - 1];
  const end = season.layerEnteredAt[layer];
  if (layer < 1 || start == null || end == null) return null;
  return Math.max(0, end - start);
}

/** The "Quem está cavando" list: top countries by players now, plus "Outros N países". */
export function topCountries(
  countries: CountryStat[],
  limit = 5,
): { top: CountryStat[]; others: { count: number; players: number } } {
  const active = countries
    .filter((c) => c.players > 0)
    .sort((a, b) => b.players - a.players || b.scoops - a.scoops);
  const top = active.slice(0, limit);
  const rest = active.slice(limit);
  return { top, others: { count: rest.length, players: rest.reduce((n, c) => n + c.players, 0) } };
}
