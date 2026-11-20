import { isSpoonId, type SpoonId } from "./data/spoons";

/** Bump when a message shape changes incompatibly. The server rejects other versions. */
export const PROTOCOL_VERSION = 1;

/** Limits shared by client and server so they agree on what will be accepted. */
export const LIMITS = {
  /** Scoops a second one connection may add (token bucket rate). */
  scoopsPerSecond: 15,
  /** Burst size for the per-connection bucket. */
  scoopBurst: 15,
  /** Scoops a second all connections from one IP may add together. */
  ipScoopsPerSecond: 45,
  ipScoopBurst: 45,
  /** Largest `n` accepted in one dig message. */
  maxBatch: 64,
  /** Largest raw client message in bytes. */
  maxClientMessageBytes: 256,
  /** Client messages a second before they are dropped. */
  messagesPerSecond: 12,
  /** Dropped/bad messages before the connection is closed. */
  maxStrikes: 50,
  /** Connections from one IP. */
  connectionsPerIp: 10,
  /** Lifetime scoop count a client may claim for its rim tag. */
  maxClaimedScoops: 100_000_000,
} as const;

/** How often the client sends a batch (ms). Within the plan's 250 to 500 ms. */
export const BATCH_INTERVAL_MS = 400;

export type CountryCode = string; // ISO 3166-1 alpha-2, or "XX" when unknown
/** First-level subdivision within a country (the part after the dash in ISO 3166-2, "ES" for
 * Espírito Santo), or "" when unknown. Only used to place dots on the globe: never shown as
 * text, never stored. */
export type RegionCode = string;

/** A region's online count is only sent when at least this many players are there, so a lone
 * player can't be picked out; smaller groups count at the country's point. */
export const MIN_REGION_PLAYERS = 3;

export interface SeasonInfo {
  number: number;
  startedAt: number;
  /** Epoch ms at which the world entered each layer, null if not yet. */
  layerEnteredAt: (number | null)[];
}

export interface RimSpoon {
  /** Random per-connection id, not tied to a person. */
  id: string;
  country: CountryCode;
  spoon: SpoonId;
  /** Lifetime scoops the player claims plus this session's accepted scoops (cosmetic). */
  scoops: number;
}

export interface CountryStat {
  code: CountryCode;
  /** Players online now. */
  players: number;
  /** Scoops this season. */
  scoops: number;
  /** Players online now by region, only regions with at least MIN_REGION_PLAYERS. */
  regions?: { code: RegionCode; players: number }[];
}

export interface FameEntry {
  season: number;
  startedAt: number;
  endedAt: number;
  scoops: number;
  topCountries: { code: CountryCode; scoops: number }[];
  /** Players online at the arrival (they got the golden spoon). */
  onlineAtArrival: number;
}

export type FeedItem =
  | { id: number; at: number; kind: "joined"; country: CountryCode; spoon: SpoonId }
  | { id: number; at: number; kind: "surge"; meters: number; minutes: number }
  | { id: number; at: number; kind: "streak"; country: CountryCode; count: number }
  | { id: number; at: number; kind: "find"; find: string }
  | { id: number; at: number; kind: "layer"; layer: number };

export interface ActivityFrame {
  /** Epoch ms at the start of the second. */
  at: number;
  scoops: number;
  /** Scoops by country in that second. */
  countries: Record<CountryCode, number>;
}

// ---------- client → server ----------

export type ClientMessage =
  | { t: "hello"; v: number; spoon: SpoonId; scoops: number }
  | { t: "dig"; seq: number; n: number }
  | { t: "spoon"; spoon: SpoonId }
  | { t: "activity" }
  | { t: "fame" };

// ---------- server → client ----------

export type ServerMessage =
  | {
      t: "welcome";
      v: number;
      you: string;
      /** Your own country and region (sent only to you), so your dot sits in your region. */
      place?: { country: CountryCode; region: RegionCode };
      now: number;
      season: SeasonInfo;
      total: number;
      players: number;
      rim: RimSpoon[];
      countries: CountryStat[];
      feed: FeedItem[];
      week: WeekRate;
      fame: FameEntry[];
    }
  | { t: "state"; total: number; players: number; now: number }
  | { t: "ack"; seq: number; accepted: number }
  | { t: "rim"; rim: RimSpoon[] }
  | { t: "world"; countries: CountryStat[]; week: WeekRate }
  | { t: "feed"; item: FeedItem }
  | { t: "layer"; season: SeasonInfo }
  | { t: "activity"; frames: ActivityFrame[] }
  | { t: "fame"; fame: FameEntry[] }
  | { t: "seasonEnd"; entry: FameEntry; next: SeasonInfo }
  | { t: "error"; code: "version" | "full" | "tooManyFromIp" | "strikes" };

/** Scoops dug over the last days, for "at this week's pace". */
export interface WeekRate {
  scoops: number;
  spanMs: number;
}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x);

/**
 * Parse and validate a raw client message. Returns null for anything unknown, oversized or
 * malformed: the room counts those as strikes and never throws on input.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string") return null;
  if (raw.length > LIMITS.maxClientMessageBytes) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case "hello":
      if (!isInt(m.v) || !isSpoonId(m.spoon) || !isInt(m.scoops) || m.scoops < 0) return null;
      return { t: "hello", v: m.v, spoon: m.spoon, scoops: Math.min(m.scoops, LIMITS.maxClaimedScoops) };
    case "dig":
      if (!isInt(m.seq) || m.seq < 0 || !isInt(m.n) || m.n < 1 || m.n > LIMITS.maxBatch) return null;
      return { t: "dig", seq: m.seq, n: m.n };
    case "spoon":
      if (!isSpoonId(m.spoon)) return null;
      return { t: "spoon", spoon: m.spoon };
    case "activity":
      return { t: "activity" };
    case "fame":
      return { t: "fame" };
    default:
      return null;
  }
}

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

/** Light validation of server messages on the client: drop anything without a known `t`. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const data = JSON.parse(raw) as { t?: unknown };
    const known = [
      "welcome",
      "state",
      "ack",
      "rim",
      "world",
      "feed",
      "layer",
      "activity",
      "fame",
      "seasonEnd",
      "error",
    ];
    if (typeof data !== "object" || data === null || typeof data.t !== "string" || !known.includes(data.t)) {
      return null;
    }
    return data as ServerMessage;
  } catch {
    return null;
  }
}

/** Normalize a region header value (Cloudflare's `regionCode`) to 1 to 3 letters/digits, "" when
 * unknown. */
export function normalizeRegion(value: string | null | undefined): RegionCode {
  if (typeof value !== "string") return "";
  const v = value.trim().toUpperCase();
  return /^[A-Z0-9]{1,3}$/.test(v) ? v : "";
}

/** Normalize a country header value to an alpha-2 code, "XX" when unknown or anonymized. */
export function normalizeCountry(value: string | null | undefined): CountryCode {
  if (typeof value !== "string") return "XX";
  const v = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(v) || v === "T1") return "XX";
  return v;
}
