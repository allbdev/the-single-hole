import { ARRIVAL_SCOOPS, LAYERS } from "../shared/data/layers";
import { findsForLayer } from "../shared/data/finds";
import type { SpoonId } from "../shared/data/spoons";
import { layerIndexAtScoops, scoopsToMeters } from "../shared/depth";
import {
  LIMITS,
  MIN_REGION_PLAYERS,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ActivityFrame,
  type CountryCode,
  type RegionCode,
  type CountryStat,
  type FameEntry,
  type FeedItem,
  type RimSpoon,
  type SeasonInfo,
  type ServerMessage,
  type WeekRate,
} from "../shared/protocol";
import { MAX_FAME_ENTRIES, emptySnapshot, type Snapshot } from "./snapshot";
import { TokenBucket } from "../shared/token-bucket";

/** The broadcast target for every player in the room. People waiting in the line don't get it. */
export const ALL = "*";

/** What the room asks its adapter to do. */
export interface Output {
  send: [target: string, msg: ServerMessage][];
  close: string[];
  /** Connections that left the line for the room; adapters that persist connection info re-save it. */
  admitted: string[];
}

export interface RoomOptions {
  /** Players in the room at once. Past this, newcomers wait in the line until someone leaves. */
  maxPlayers: number;
  /** Safety cap on the line, so a flood of sockets can't exhaust memory. Past it: "full". */
  maxWaiting: number;
  /** Minimum gap between line position updates (ms). */
  lineMs: number;
  /** Minimum gap between `state` broadcasts (ms). 150 ms ≈ 6.7 a second. */
  stateMs: number;
  rimMs: number;
  worldMs: number;
  rimSize: number;
  /** Chance per accepted scoop of a find. */
  findChance: number;
  random: () => number;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  maxPlayers: 10_000,
  maxWaiting: 50_000,
  lineMs: 2_000,
  stateMs: 150,
  rimMs: 1_000,
  worldMs: 5_000,
  rimSize: 24,
  findChance: 1 / 4_000,
  random: Math.random,
};

export const FEED_SIZE = 8;
export const ACTIVITY_SECONDS = 60;
export const STREAK_COUNT = 300;
export const STREAK_GAP_MS = 2_000;
/** A socket must say hello this soon, or it is closed (so silent sockets can't hold room slots). */
export const HELLO_TIMEOUT_MS = 10_000;
const DAY_MS = 86_400_000;
const SURGE_WINDOW_MS = 4 * 60_000;
const SURGE_EVERY_MS = 5 * 60_000;
const JOIN_FEED_GAP_MS = 5_000;
const JOIN_COUNTRY_GAP_MS = 60_000;
/** Region dots per country in a world message (keeps it small in big countries). */
const MAX_REGIONS_PER_COUNTRY = 30;
const FIND_GAP_MS = 30_000;
const STREAK_FEED_GAP_MS = 20_000;

interface Conn {
  id: string;
  connectedAt: number;
  ip: string;
  country: CountryCode;
  region: RegionCode;
  spoon: SpoonId;
  claimed: number;
  session: number;
  hello: boolean;
  bucket: TokenBucket;
  messages: TokenBucket;
  strikes: number;
  lastDigAt: number;
  streak: number;
  streakAnnounced: boolean;
  joinedAnnounced: boolean;
  /** Place in the line (lower goes first); null once in the room. */
  ticket: number | null;
}

interface IpState {
  connections: number;
  bucket: TokenBucket;
}

/** A connection as an adapter stores it across hibernation. */
export interface ConnectionInfo {
  ip: string;
  country: CountryCode;
  /** Missing on connections saved before regions existed. */
  region?: RegionCode;
  spoon: SpoonId;
  claimed: number;
  hello: boolean;
  /** Set while waiting in the line (lower goes first); missing once in the room. */
  ticket?: number;
}

/** Counters for monitoring. No personal data. */
export interface RoomCounters {
  accepted: number;
  dropped: number;
  badMessages: number;
  rejectedConnections: number;
  closedForStrikes: number;
}

const empty = (): Output => ({ send: [], close: [], admitted: [] });

/**
 * The one authoritative room. Pure: no timers, sockets or storage. Adapters feed it connections,
 * raw messages and the clock, and deliver what it returns.
 */
export class Room {
  private readonly opts: RoomOptions;
  private season: SeasonInfo;
  private total: number;
  private countryScoops: Map<CountryCode, number>;
  private days: Map<number, number>;
  private fame: FameEntry[];
  /** Players in the room. */
  private readonly conns = new Map<string, Conn>();
  /** The line: connections waiting for a slot, in ticket order (see `lineOrder`). */
  private line = new Map<string, Conn>();
  private nextTicket = 1;
  /** Set when connections came back from hibernation out of order. */
  private lineUnsorted = false;
  /** Positions changed since the last line update (everyone in line gets theirs). */
  private lineDirty = false;
  /** Said hello in line but not yet told their place (sent on the next line update). */
  private readonly linePending = new Set<string>();
  private lastLineAt = -Infinity;
  private readonly ips = new Map<string, IpState>();
  private feed: FeedItem[] = [];
  private pendingFeed: FeedItem[] = [];
  private feedId = 0;
  private activity: ActivityFrame[] = [];
  private history: [number, number][] = [];
  private stateDirty = false;
  private rimDirty = false;
  private worldDirty = false;
  private lastStateAt = -Infinity;
  private lastRimAt = -Infinity;
  private lastWorldAt = -Infinity;
  private lastSurgeAt = -Infinity;
  private lastSurgeCheckAt = -Infinity;
  private lastJoinFeedAt = -Infinity;
  private lastFindAt = -Infinity;
  private lastStreakFeedAt = -Infinity;
  private readonly lastJoinByCountry = new Map<CountryCode, number>();
  private changedSinceSnapshot = false;
  readonly counters: RoomCounters = {
    accepted: 0,
    dropped: 0,
    badMessages: 0,
    rejectedConnections: 0,
    closedForStrikes: 0,
  };

  constructor(snapshot: Snapshot | null, now: number, opts: Partial<RoomOptions> = {}) {
    this.opts = { ...DEFAULT_ROOM_OPTIONS, ...opts };
    const s = snapshot ?? emptySnapshot(now);
    this.season = { ...s.season, layerEnteredAt: [...s.season.layerEnteredAt] };
    this.total = s.total;
    this.countryScoops = new Map(Object.entries(s.countries));
    this.days = new Map(s.days);
    this.fame = [...s.fame];
    this.history.push([now, this.total]);
  }

  // ---------- reads ----------

  get totalScoops(): number {
    return this.total;
  }

  get players(): number {
    let n = 0;
    for (const c of this.conns.values()) if (c.hello) n++;
    return n;
  }

  get connections(): number {
    return this.conns.size;
  }

  /** People waiting in the line. */
  get waiting(): number {
    return this.line.size;
  }

  /** True for players in the room; false for the line and unknown ids (they get no broadcasts). */
  inRoom(id: string): boolean {
    return this.conns.has(id);
  }

  get seasonInfo(): SeasonInfo {
    return { ...this.season, layerEnteredAt: [...this.season.layerEnteredAt] };
  }

  /** True when something changed since the last `markSnapshotted`. */
  get needsSnapshot(): boolean {
    return this.changedSinceSnapshot;
  }

  snapshot(now: number): Snapshot {
    return {
      v: 1,
      savedAt: now,
      season: this.seasonInfo,
      total: this.total,
      countries: Object.fromEntries([...this.countryScoops].filter(([code]) => code !== "XX")),
      days: [...this.days].sort((a, b) => a[0] - b[0]).slice(-8),
      fame: this.fame.slice(-MAX_FAME_ENTRIES),
    };
  }

  markSnapshotted(): void {
    this.changedSinceSnapshot = false;
  }

  /** True when the room has nothing left to broadcast (an adapter may stop ticking / hibernate). */
  get idle(): boolean {
    if (!this.idleExceptHandshakes || this.lineDirty || this.linePending.size > 0) return false;
    for (const c of this.conns.values()) if (!c.hello) return false;
    for (const c of this.line.values()) if (!c.hello) return false;
    return true;
  }

  /** Only waiting for hellos or a line update: an adapter can tick slowly. */
  get idleExceptHandshakes(): boolean {
    return (
      !this.stateDirty &&
      !this.rimDirty &&
      !this.worldDirty &&
      this.pendingFeed.length === 0 &&
      !this.canAdmit
    );
  }

  /** A slot is free and someone is waiting for it. */
  private get canAdmit(): boolean {
    return this.line.size > 0 && this.conns.size < this.opts.maxPlayers;
  }

  // ---------- connections ----------

  connect(id: string, info: { ip: string; country: CountryCode; region?: RegionCode }, now: number): Output {
    const out = empty();
    // Newcomers never skip the line, even when a slot just opened and no tick has admitted anyone.
    const waits = this.conns.size >= this.opts.maxPlayers || this.line.size > 0;
    if (waits && this.line.size >= this.opts.maxWaiting) {
      this.counters.rejectedConnections++;
      out.send.push([id, { t: "error", code: "full" }]);
      out.close.push(id);
      return out;
    }
    const ip = this.ips.get(info.ip);
    if (ip && ip.connections >= LIMITS.connectionsPerIp) {
      this.counters.rejectedConnections++;
      out.send.push([id, { t: "error", code: "tooManyFromIp" }]);
      out.close.push(id);
      return out;
    }
    const c = this.newConn(id, info, now);
    if (waits) {
      c.ticket = this.nextTicket++;
      this.line.set(id, c);
    } else {
      this.conns.set(id, c);
    }
    return out;
  }

  private newConn(
    id: string,
    info: { ip: string; country: CountryCode; region?: RegionCode },
    now: number,
  ): Conn {
    let ip = this.ips.get(info.ip);
    if (!ip) {
      ip = { connections: 0, bucket: new TokenBucket(LIMITS.ipScoopsPerSecond, LIMITS.ipScoopBurst, now) };
      this.ips.set(info.ip, ip);
    }
    ip.connections++;
    return {
      id,
      connectedAt: now,
      ip: info.ip,
      country: info.country,
      region: info.region ?? "",
      spoon: "teaspoon",
      claimed: 0,
      session: 0,
      hello: false,
      bucket: new TokenBucket(LIMITS.scoopsPerSecond, LIMITS.scoopBurst, now),
      messages: new TokenBucket(LIMITS.messagesPerSecond, LIMITS.messagesPerSecond, now),
      strikes: 0,
      lastDigAt: -Infinity,
      streak: 0,
      streakAnnounced: false,
      joinedAnnounced: false,
      ticket: null,
    };
  }

  /** What an adapter must keep to rebuild a connection after the process sleeps (hibernation). */
  connectionInfo(id: string): ConnectionInfo | null {
    const c = this.find(id);
    if (!c) return null;
    return {
      ip: c.ip,
      country: c.country,
      region: c.region,
      spoon: c.spoon,
      claimed: c.claimed,
      hello: c.hello,
      ...(c.ticket !== null ? { ticket: c.ticket } : {}),
    };
  }

  private find(id: string): Conn | undefined {
    return this.conns.get(id) ?? this.line.get(id);
  }

  /**
   * Re-register a connection that survived while the room was asleep (Durable Object hibernation).
   * It goes back where it was (room or line, same place in the line). Rate buckets start fresh.
   */
  resume(id: string, info: ConnectionInfo, now: number): void {
    if (this.find(id)) return;
    const c = this.newConn(id, info, now);
    c.spoon = info.spoon;
    c.claimed = info.claimed;
    c.hello = info.hello;
    if (info.ticket === undefined) {
      this.conns.set(id, c);
      return;
    }
    c.ticket = info.ticket;
    this.line.set(id, c);
    this.nextTicket = Math.max(this.nextTicket, info.ticket + 1);
    this.lineUnsorted = true;
    this.lineDirty = true;
  }

  /** The line in ticket order. Sorting happens at most once after a wake-up. */
  private lineOrder(): IterableIterator<Conn> {
    if (this.lineUnsorted) {
      this.line = new Map([...this.line].sort((a, b) => a[1].ticket! - b[1].ticket!));
      this.lineUnsorted = false;
    }
    return this.line.values();
  }

  /** 1-based place in the line, or 0 when not in it. */
  linePosition(id: string): number {
    let n = 0;
    for (const c of this.lineOrder()) {
      n++;
      if (c.id === id) return n;
    }
    return 0;
  }

  disconnect(id: string): void {
    const c = this.find(id);
    if (!c) return;
    if (c.ticket !== null) {
      this.line.delete(id);
      this.linePending.delete(id);
      this.lineDirty = true;
    } else {
      this.conns.delete(id);
    }
    const ip = this.ips.get(c.ip);
    if (ip) {
      ip.connections--;
      if (ip.connections <= 0) this.ips.delete(c.ip);
    }
    if (c.hello) {
      this.stateDirty = true;
      this.rimDirty = true;
      this.worldDirty = true;
    }
  }

  // ---------- messages ----------

  message(id: string, raw: unknown, now: number): Output {
    const out = empty();
    const c = this.find(id);
    if (!c) return out;
    if (c.messages.take(1, now) === 0) {
      this.strike(c, out);
      return out;
    }
    const msg = parseClientMessage(raw);
    if (!msg) {
      this.strike(c, out);
      return out;
    }
    if (msg.t !== "hello" && !c.hello) {
      this.strike(c, out);
      return out;
    }
    if (msg.t === "hello") {
      if (msg.v !== PROTOCOL_VERSION) {
        out.send.push([id, { t: "error", code: "version" }]);
        out.close.push(id);
        return out;
      }
      if (c.hello) {
        this.strike(c, out);
        return out;
      }
      c.hello = true;
      c.spoon = msg.spoon;
      c.claimed = msg.scoops;
    }
    if (c.ticket !== null) {
      // In the line: no room data, no digging. Only the place in the line, and a spoon to hold.
      if (msg.t === "hello") {
        // The newest ticket is always last: answer in O(1). Anyone else gets their place on the
        // next line update, so a flood of hellos can't make the room scan the line each time.
        if (c.ticket === this.nextTicket - 1) out.send.push([id, { t: "line", position: this.line.size }]);
        else this.linePending.add(id);
      } else if (msg.t === "spoon") c.spoon = msg.spoon;
      return out;
    }
    switch (msg.t) {
      case "hello": {
        this.stateDirty = true;
        this.rimDirty = true;
        this.worldDirty = true;
        out.send.push([id, this.welcome(c, now)]);
        return out;
      }
      case "spoon":
        c.spoon = msg.spoon;
        this.rimDirty = true;
        return out;
      case "activity":
        out.send.push([id, { t: "activity", frames: this.activityFrames(now) }]);
        return out;
      case "fame":
        out.send.push([id, { t: "fame", fame: [...this.fame].reverse() }]);
        return out;
      case "dig":
        return this.dig(c, msg.seq, msg.n, now, out);
    }
  }

  private strike(c: Conn, out: Output): void {
    this.counters.badMessages++;
    c.strikes++;
    if (c.strikes >= LIMITS.maxStrikes) {
      this.counters.closedForStrikes++;
      out.send.push([c.id, { t: "error", code: "strikes" }]);
      out.close.push(c.id);
    }
  }

  private dig(c: Conn, seq: number, n: number, now: number, out: Output): Output {
    const ip = this.ips.get(c.ip)!;
    const allowed = Math.min(
      n,
      c.bucket.available(now),
      ip.bucket.available(now),
      ARRIVAL_SCOOPS - this.total,
    );
    const accepted = Math.max(0, allowed);
    if (accepted > 0) {
      c.bucket.take(accepted, now);
      ip.bucket.take(accepted, now);
    }
    this.counters.accepted += accepted;
    this.counters.dropped += n - accepted;
    out.send.push([c.id, { t: "ack", seq, accepted }]);
    if (accepted === 0) return out;

    const before = this.total;
    this.total += accepted;
    c.session += accepted;
    this.countryScoops.set(c.country, (this.countryScoops.get(c.country) ?? 0) + accepted);
    const day = Math.floor(now / DAY_MS);
    this.days.set(day, (this.days.get(day) ?? 0) + accepted);
    for (const d of this.days.keys()) if (d < day - 7) this.days.delete(d);
    this.recordActivity(c.country, accepted, now);
    this.stateDirty = true;
    this.rimDirty = true;
    this.worldDirty = true;
    this.changedSinceSnapshot = true;

    // Streaks and first dig.
    if (now - c.lastDigAt > STREAK_GAP_MS) {
      c.streak = 0;
      c.streakAnnounced = false;
    }
    c.streak += accepted;
    c.lastDigAt = now;
    if (!c.joinedAnnounced) {
      c.joinedAnnounced = true;
      const lastCountry = this.lastJoinByCountry.get(c.country) ?? -Infinity;
      if (now - this.lastJoinFeedAt >= JOIN_FEED_GAP_MS && now - lastCountry >= JOIN_COUNTRY_GAP_MS) {
        this.lastJoinFeedAt = now;
        this.lastJoinByCountry.set(c.country, now);
        this.pushFeed({ kind: "joined", country: c.country, spoon: c.spoon }, now);
      }
    }
    if (!c.streakAnnounced && c.streak >= STREAK_COUNT) {
      c.streakAnnounced = true;
      if (now - this.lastStreakFeedAt >= STREAK_FEED_GAP_MS) {
        this.lastStreakFeedAt = now;
        this.pushFeed({ kind: "streak", country: c.country, count: STREAK_COUNT }, now);
      }
    }

    // Finds.
    const p = 1 - Math.pow(1 - this.opts.findChance, accepted);
    if (now - this.lastFindAt >= FIND_GAP_MS && this.opts.random() < p) {
      const finds = findsForLayer(LAYERS[layerIndexAtScoops(this.total)]!.id);
      if (finds.length > 0) {
        const pick = finds[Math.floor(this.opts.random() * finds.length) % finds.length]!;
        this.lastFindAt = now;
        this.pushFeed({ kind: "find", find: pick.id }, now);
      }
    }

    // Layers.
    const fromLayer = layerIndexAtScoops(before);
    const toLayer = layerIndexAtScoops(this.total);
    if (toLayer > fromLayer) {
      for (let i = fromLayer + 1; i <= toLayer; i++) {
        if (this.season.layerEnteredAt[i] == null) this.season.layerEnteredAt[i] = now;
        this.pushFeed({ kind: "layer", layer: i }, now);
      }
      out.send.push([ALL, { t: "layer", season: this.seasonInfo }]);
    }

    if (this.total >= ARRIVAL_SCOOPS) this.endSeason(now, out);
    return out;
  }

  private endSeason(now: number, out: Output): void {
    const entry: FameEntry = {
      season: this.season.number,
      startedAt: this.season.startedAt,
      endedAt: now,
      scoops: this.total,
      topCountries: [...this.countryScoops]
        .filter(([code]) => code !== "XX")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, scoops]) => ({ code, scoops })),
      onlineAtArrival: this.players,
    };
    this.fame.push(entry);
    if (this.fame.length > MAX_FAME_ENTRIES) this.fame.shift();
    this.season = {
      number: this.season.number + 1,
      startedAt: now,
      layerEnteredAt: LAYERS.map((_, i) => (i === 0 ? now : null)),
    };
    this.total = 0;
    this.countryScoops = new Map();
    this.feed = [];
    this.pendingFeed = [];
    this.history = [[now, 0]];
    for (const c of this.conns.values()) {
      c.streak = 0;
      c.streakAnnounced = false;
    }
    this.changedSinceSnapshot = true;
    this.stateDirty = true;
    this.worldDirty = true;
    out.send.push([ALL, { t: "seasonEnd", entry, next: this.seasonInfo }]);
  }

  private pushFeed(item: DistributiveOmit<FeedItem, "id" | "at">, now: number): void {
    const full = { ...item, id: ++this.feedId, at: now } as FeedItem;
    this.feed.push(full);
    if (this.feed.length > FEED_SIZE) this.feed.shift();
    this.pendingFeed.push(full);
  }

  private recordActivity(country: CountryCode, n: number, now: number): void {
    const at = Math.floor(now / 1000) * 1000;
    let frame = this.activity[this.activity.length - 1];
    if (!frame || frame.at !== at) {
      frame = { at, scoops: 0, countries: {} };
      this.activity.push(frame);
    }
    frame.scoops += n;
    frame.countries[country] = (frame.countries[country] ?? 0) + n;
    this.trimActivity(now);
  }

  private trimActivity(now: number): void {
    const cutoff = now - ACTIVITY_SECONDS * 1000;
    while (this.activity.length > 0 && this.activity[0]!.at < cutoff) this.activity.shift();
  }

  /** The last minute of activity, aggregated per second, with no identities. */
  activityFrames(now: number): ActivityFrame[] {
    this.trimActivity(now);
    return this.activity.map((f) => ({ ...f, countries: { ...f.countries } }));
  }

  // ---------- views ----------

  private welcome(c: Conn, now: number): ServerMessage {
    return {
      t: "welcome",
      v: PROTOCOL_VERSION,
      you: c.id,
      ...(c.region ? { place: { country: c.country, region: c.region } } : {}),
      now,
      season: this.seasonInfo,
      total: this.total,
      players: this.players,
      rim: this.rim(),
      countries: this.countryStats(),
      feed: [...this.feed],
      week: this.weekRate(now),
      fame: [...this.fame].reverse().slice(0, 5),
    };
  }

  rim(): RimSpoon[] {
    return [...this.conns.values()]
      .filter((c) => c.hello)
      .sort((a, b) => b.lastDigAt - a.lastDigAt || b.session - a.session)
      .slice(0, this.opts.rimSize)
      .map((c) => ({ id: c.id, country: c.country, spoon: c.spoon, scoops: c.claimed + c.session }));
  }

  countryStats(): CountryStat[] {
    const players = new Map<CountryCode, number>();
    const regions = new Map<CountryCode, Map<RegionCode, number>>();
    for (const c of this.conns.values()) {
      if (!c.hello) continue;
      players.set(c.country, (players.get(c.country) ?? 0) + 1);
      if (!c.region) continue;
      let r = regions.get(c.country);
      if (!r) regions.set(c.country, (r = new Map()));
      r.set(c.region, (r.get(c.region) ?? 0) + 1);
    }
    const codes = new Set([...players.keys(), ...this.countryScoops.keys()]);
    return [...codes]
      .map((code) => {
        const stat: CountryStat = {
          code,
          players: players.get(code) ?? 0,
          scoops: this.countryScoops.get(code) ?? 0,
        };
        // Only regions with enough players to hide in; the rest count at the country's point.
        const shown = [...(regions.get(code) ?? [])]
          .filter(([, n]) => n >= MIN_REGION_PLAYERS)
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_REGIONS_PER_COUNTRY)
          .map(([region, n]) => ({ code: region, players: n }));
        if (shown.length > 0) stat.regions = shown;
        return stat;
      })
      .sort((a, b) => b.scoops - a.scoops || b.players - a.players)
      .slice(0, 60);
  }

  weekRate(now: number): WeekRate {
    const today = Math.floor(now / DAY_MS);
    let scoops = 0;
    let earliest = today;
    for (const [day, n] of this.days) {
      if (day >= today - 6 && day <= today) {
        scoops += n;
        earliest = Math.min(earliest, day);
      }
    }
    const from = Math.max(earliest * DAY_MS, this.season.startedAt);
    return { scoops, spanMs: Math.max(60_000, now - from) };
  }

  // ---------- clock ----------

  tick(now: number): Output {
    const out = empty();
    for (const group of [this.conns, this.line]) {
      for (const c of group.values()) {
        if (!c.hello && now - c.connectedAt > HELLO_TIMEOUT_MS) {
          this.counters.badMessages++;
          out.close.push(c.id);
          this.disconnect(c.id);
        }
      }
    }
    this.admit(now, out);
    if (now - this.lastSurgeCheckAt >= 60_000) {
      this.lastSurgeCheckAt = now;
      this.checkSurge(now);
    }
    for (const item of this.pendingFeed) out.send.push([ALL, { t: "feed", item }]);
    this.pendingFeed = [];
    if (this.stateDirty && now - this.lastStateAt >= this.opts.stateMs) {
      this.stateDirty = false;
      this.lastStateAt = now;
      out.send.push([ALL, { t: "state", total: this.total, players: this.players, now }]);
    }
    if (this.rimDirty && now - this.lastRimAt >= this.opts.rimMs) {
      this.rimDirty = false;
      this.lastRimAt = now;
      out.send.push([ALL, { t: "rim", rim: this.rim() }]);
    }
    if (this.worldDirty && now - this.lastWorldAt >= this.opts.worldMs) {
      this.worldDirty = false;
      this.lastWorldAt = now;
      out.send.push([ALL, { t: "world", countries: this.countryStats(), week: this.weekRate(now) }]);
    }
    const lineDue = this.lineDirty || this.linePending.size > 0;
    if (lineDue && now - this.lastLineAt >= this.opts.lineMs) {
      // One pass over the line, at most every lineMs, however many joined or left.
      const everyone = this.lineDirty;
      this.lineDirty = false;
      this.lastLineAt = now;
      let position = 0;
      for (const c of this.lineOrder()) {
        position++;
        if (c.hello && (everyone || this.linePending.has(c.id)))
          out.send.push([c.id, { t: "line", position }]);
      }
      this.linePending.clear();
    }
    return out;
  }

  /** Move people from the front of the line into free slots. */
  private admit(now: number, out: Output): void {
    while (this.canAdmit) {
      const c = this.lineOrder().next().value!;
      this.line.delete(c.id);
      this.linePending.delete(c.id);
      c.ticket = null;
      this.conns.set(c.id, c);
      this.lineDirty = true;
      out.admitted.push(c.id);
      if (c.hello) {
        this.stateDirty = true;
        this.rimDirty = true;
        this.worldDirty = true;
        out.send.push([c.id, this.welcome(c, now)]);
      }
    }
  }

  private checkSurge(now: number): void {
    this.history.push([now, this.total]);
    while (this.history.length > 0 && this.history[0]![0] < now - SURGE_WINDOW_MS - 60_000)
      this.history.shift();
    const base = this.history.find(([t]) => t >= now - SURGE_WINDOW_MS - 1_000);
    if (!base || now - this.lastSurgeAt < SURGE_EVERY_MS) return;
    const gained = scoopsToMeters(this.total) - scoopsToMeters(base[1]);
    if (gained < 1) return;
    const nice = Math.pow(10, Math.floor(Math.log10(gained)));
    const minutes = Math.max(1, Math.round((now - base[0]) / 60_000));
    this.lastSurgeAt = now;
    this.pushFeed({ kind: "surge", meters: nice, minutes }, now);
  }
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
