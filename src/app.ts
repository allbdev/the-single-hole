import { Vector3 } from "three";
import { ARRIVAL_SCOOPS } from "../shared/data/layers";
import { unlockedSpoons, spoonById, type SpoonId } from "../shared/data/spoons";
import { layerIndexAtScoops, metersToNextLayer, scoopsToMeters } from "../shared/depth";
import { BATCH_INTERVAL_MS, PROTOCOL_VERSION, type ServerMessage } from "../shared/protocol";
import { Sound } from "./audio";
import { roomUrl } from "./config";
import { awayMeters } from "./core/away";
import { Batcher } from "./core/batcher";
import { Connection, type ConnectionStatus, type SocketLike } from "./core/connection";
import { etaYear, formatClock, formatSince, holeHour } from "./core/format";
import {
  applyServerMessage,
  initialWorld,
  layerDuration,
  type WorldEvent,
  type WorldState,
} from "./core/game-state";
import { hash01, rimSlots } from "./core/layout";
import { pickQuality, type Quality } from "./core/quality";
import { Reconciler } from "./core/reconcile";
import {
  ghostsBetween,
  replayDuration,
  replaySchedule,
  shouldOfferReplay,
  type GhostDig,
} from "./core/replay";
import { shareCardText } from "./core/share-text";
import { LocalStore } from "./core/storage";
import { lightingAt } from "./core/sun";
import { initialLocale, pick, translate, type Locale, type MessageKey } from "./i18n";
import { Dialogs, toast } from "./ui/dialogs";
import { Ui, type ViewName } from "./ui/ui";
import { HoleScene } from "./view/hole-scene";
import { SectionScene } from "./view/section-scene";
import { Stage, type View } from "./view/stage";
import type { GlobeScene } from "./view/globe-scene";

const ERROR_KEYS: Record<string, MessageKey> = {
  full: "conn.full",
  tooManyFromIp: "conn.tooMany",
  version: "conn.version",
  strikes: "conn.version",
};

/** The game: one controller wiring the room connection, the scenes and the DOM. */
export class App {
  private readonly store = new LocalStore(safeStorage());
  private locale: Locale;
  private readonly quality: Quality;
  private readonly stage: Stage;
  private readonly hole: HoleScene;
  private garden: HoleScene | null = null;
  private section: SectionScene | null = null;
  private globe: GlobeScene | null = null;
  private globeLoading: Promise<void> | null = null;
  private ui!: Ui;
  private dialogs!: Dialogs;
  private view: ViewName = "landing";
  private world: WorldState;
  private readonly reconciler = new Reconciler();
  private readonly batcher: Batcher;
  private readonly connection: Connection;
  private readonly sound = new Sound();
  private readonly reducedMotion: boolean;
  private lastFrame = performance.now();
  private readonly start = performance.now();
  private lastMetersText = -1;
  private lastRimKey = "";
  private readonly rimScoops = new Map<string, number>();
  private replay: { schedule: GhostDig[]; started: number; duration: number; cursor: number } | null = null;
  private awayDismissed = false;
  private awayMetersValue: number | null = null;
  private pendingMilestones: number[] = [];
  private arrivalShowing = false;
  private readonly tmp = new Vector3();
  private lastLightingAt = 0;
  private pointer = { x: 0, y: 0 };

  constructor(private readonly root: HTMLElement) {
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.locale = initialLocale(this.store.value.lang, location.search);
    this.quality = pickQuality(
      {
        coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
        screenWidth: Math.min(window.screen?.width ?? 1280, window.innerWidth),
        cores: navigator.hardwareConcurrency ?? 4,
        memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      },
      location.search,
    );
    this.sound.enabled = this.store.value.sound;
    this.world = initialWorld(Date.now());

    const stageEl = root.querySelector<HTMLElement>(".stage")!;
    this.stage = new Stage(stageEl, this.quality);
    this.hole = new HoleScene(this.quality, "lawn", this.stage.environment(), this.reducedMotion);
    this.hole.setLighting(lightingAt(holeHour(Date.now())));
    this.hole.setCameraMode("landing", true);

    this.batcher = new Batcher((seq, n) => this.connection.send({ t: "dig", seq, n }), performance.now());
    this.connection = new Connection(
      roomUrl(location),
      {
        onOpen: () =>
          this.connection.send({
            t: "hello",
            v: PROTOCOL_VERSION,
            spoon: this.store.value.spoon,
            scoops: this.store.value.lifetimeScoops,
          }),
        onMessage: (m) => this.onMessage(m),
        onStatus: (s) => this.onStatus(s),
      },
      (url) => new WebSocket(url) as unknown as SocketLike,
    );

    this.buildUi();
    const initial = new URLSearchParams(location.search).get("view");
    if (initial === "hole" || initial === "section" || initial === "world") this.go(initial);
    else this.go("landing");
    this.prewarmSection();

    window.addEventListener("resize", () => this.stage.resize());
    document.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("pointermove", (e) => {
      this.pointer = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      };
      this.globe?.pointerMove(e.clientX, e.clientY);
    });
    window.addEventListener("pointerup", () => this.globe?.pointerUp());
    stageEl.addEventListener("pointerdown", (e) => {
      if (this.view === "world") this.globe?.pointerDown(e.clientX, e.clientY);
    });
    window.addEventListener("pagehide", () => this.rememberSeen());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.rememberSeen();
    });
    setInterval(() => this.batcher.flush(performance.now()), BATCH_INTERVAL_MS);
    setInterval(() => this.rememberSeen(), 30_000);
    setInterval(() => this.ui.setFeed(this.world.feed, this.serverNow()), 1_000);

    this.connection.start();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- UI ----------

  private buildUi(): void {
    this.ui?.destroy();
    document.documentElement.lang = this.locale;
    document.title = `${translate(this.locale, "app.name")} — ${translate(this.locale, "app.description")}`;
    this.ui = new Ui(
      this.root,
      this.locale,
      {
        grab: () => this.go("hole"),
        section: () => this.go("section"),
        tab: (v) => this.go(v),
        lang: (l) => this.setLocale(l),
        sound: () => this.toggleSound(),
        share: () => this.openShare(),
        spoons: () => this.openSpoons(),
        replay: () => (this.replay ? this.stopReplay() : this.requestReplay()),
        stopReplay: () => this.stopReplay(),
        dismissAway: () => {
          this.awayDismissed = true;
          this.ui.showAway(null, false);
        },
        dig: () => this.dig(),
      },
      this.store.value.sound,
    );
    this.dialogs = new Dialogs(this.ui.root, this.locale);
    this.lastMetersText = -1;
    this.lastRimKey = "";
    this.ui.show(this.view);
    this.refreshPanels();
  }

  private setLocale(l: Locale): void {
    if (l === this.locale) return;
    this.locale = l;
    this.store.update({ lang: l });
    this.buildUi();
  }

  private toggleSound(): void {
    const on = !this.store.value.sound;
    this.store.update({ sound: on });
    this.sound.enabled = on;
    this.ui.setSoundIcon(on);
  }

  private go(view: ViewName): void {
    this.view = view;
    if (view === "landing") this.hole.setCameraMode("landing");
    if (view === "hole") this.hole.setCameraMode("dig");
    if (view === "section") this.ensureSection();
    if (view === "world") void this.loadGlobe();
    this.ui.show(view);
    this.refreshPanels();
    if (view === "hole") this.ui.digArea.focus({ preventScroll: true });
  }

  private ensureSection(): SectionScene {
    if (!this.section) {
      this.section = new SectionScene(this.quality, this.stage.environment());
      this.section.setDepth(scoopsToMeters(this.reconciler.displayed));
    }
    return this.section;
  }

  /**
   * Build the Cut and compile its shaders while the browser is idle after the first frames, so
   * the first switch to it doesn't stall on texture generation, uploads and shader compiles.
   */
  private prewarmSection(): void {
    const build = () => {
      if (this.section) return;
      const section = this.ensureSection();
      section.update(0);
      this.stage.warm(section, this.activeView());
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(build, { timeout: 2500 });
    else globalThis.setTimeout(build, 1500);
  }

  private loadGlobe(): Promise<void> {
    if (this.globe) return Promise.resolve();
    if (!this.globeLoading) {
      this.ui.setGlobeLoading(true);
      this.globeLoading = import("./view/globe-scene").then(({ GlobeScene }) => {
        this.globe = new GlobeScene(this.quality);
        this.globe.setCountries(this.world.countries, this.world.place);
        this.ui.setGlobeLoading(false);
      });
    }
    return this.globeLoading;
  }

  private activeView(): View {
    if (this.arrivalShowing && this.garden) return this.garden;
    if (this.view === "section" && this.section) return this.section;
    if (this.view === "world" && this.globe) return this.globe;
    return this.hole;
  }

  // ---------- input ----------

  private onKey(e: KeyboardEvent): void {
    if (this.dialogs.isOpen) return;
    if (e.key !== " " && e.code !== "Space") return;
    const active = document.activeElement;
    const onOtherControl =
      active instanceof HTMLElement &&
      active !== this.ui.digArea &&
      active.matches("button, a, input, select, textarea");
    if (onOtherControl) return;
    e.preventDefault();
    if (e.repeat) return;
    if (this.view === "landing") this.go("hole");
    if (this.view === "hole") this.dig();
  }

  private dig(): void {
    if (this.view === "landing") {
      this.go("hole");
      return;
    }
    if (this.view !== "hole" || this.arrivalShowing) return;
    const counted = this.batcher.dig(performance.now());
    if (this.world.you) this.hole.digYou(this.world.you);
    this.sound.scoop();
    if (counted) this.ui.setMine(this.store.value.lifetimeScoops + this.batcher.pending, true);
  }

  // ---------- network ----------

  private onStatus(s: ConnectionStatus): void {
    if (s === "waiting") {
      this.batcher.disconnected();
      this.world = { ...this.world, connected: false };
    }
    this.ui.setConnection(s);
    this.ui.setPlayers(this.world.players, s === "open");
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.t === "activity") {
      this.startReplay(msg);
      return;
    }
    const prevSeason = this.world.season.number;
    const { state, events } = applyServerMessage(this.world, msg, Date.now());
    this.world = state;
    if (msg.t === "welcome" || msg.t === "state" || msg.t === "seasonEnd") {
      if (msg.t === "welcome" && prevSeason === 0) this.reconciler.reset(state.total, state.season.number);
      else this.reconciler.setServer(state.total, state.season.number);
    }
    for (const ev of events) this.onEvent(ev);
    if (msg.t === "rim" || msg.t === "welcome") this.syncRim();
    if (msg.t === "world" || msg.t === "welcome" || msg.t === "seasonEnd") {
      this.globe?.setCountries(state.countries, state.place);
      this.refreshPanels();
    }
    if (msg.t === "layer" || msg.t === "welcome") this.refreshPanels();
    this.ui.setPlayers(state.players, state.connected);
    if (msg.t === "feed" || msg.t === "welcome" || msg.t === "seasonEnd")
      this.ui.setFeed(state.feed, this.serverNow());
  }

  private onEvent(ev: WorldEvent): void {
    switch (ev.kind) {
      case "welcome":
        if (ev.firstTime) this.onFirstWelcome();
        this.ui.setConnection("open");
        break;
      case "ack": {
        const accepted = this.batcher.ack(ev.seq, ev.accepted);
        if (accepted > 0) {
          const before = unlockedSpoons(this.store.value.lifetimeScoops, this.store.value.golden);
          this.store.addScoops(accepted, this.world.season.number);
          const after = unlockedSpoons(this.store.value.lifetimeScoops, this.store.value.golden);
          for (const id of after.filter((s) => !before.includes(s))) this.announceSpoon(id);
        }
        this.ui.setMine(this.store.value.lifetimeScoops + this.batcher.pending, false);
        break;
      }
      case "layer":
        this.sound.chime();
        this.pendingMilestones.push(ev.layer);
        this.showNextMilestone();
        break;
      case "seasonEnd":
        this.onSeasonEnd(ev.entry, true);
        break;
      case "feed":
        break;
      case "error":
        this.ui.setConnection("error", ERROR_KEYS[ev.code] ?? "conn.waiting");
        break;
    }
  }

  private onFirstWelcome(): void {
    const s = this.store.value;
    const now = Date.now();
    // A season ended while you were away: show the arrival once.
    const latest = this.world.fame[0];
    if (latest && latest.season > s.seenArrival && s.lastSeen && latest.endedAt > s.lastSeen.at) {
      this.onSeasonEnd(latest, false);
    } else if (latest) {
      this.store.update({ seenArrival: Math.max(s.seenArrival, latest.season) });
    }
    this.awayMetersValue = awayMeters(s.lastSeen, this.world.total, this.world.season.number, now);
    this.updateAway();
    this.rememberSeen();
  }

  private updateAway(): void {
    if (this.awayDismissed) return;
    const offer = shouldOfferReplay(this.world.players, 1);
    this.ui.showAway(this.awayMetersValue, offer);
  }

  private rememberSeen(): void {
    if (this.world.season.number === 0) return;
    this.store.update({
      lastSeen: { total: this.world.total, season: this.world.season.number, at: Date.now() },
    });
  }

  private serverNow(): number {
    return Date.now() + this.world.clockOffset;
  }

  // ---------- milestones, seasons, spoons ----------

  private showNextMilestone(): void {
    if (this.dialogs.isOpen || this.arrivalShowing) return;
    const layer = this.pendingMilestones.pop();
    this.pendingMilestones = [];
    if (layer === undefined) return;
    this.dialogs.milestone({
      layer,
      tookMs: layerDuration(this.world.season, layer),
      youDug: this.store.seasonScoopsFor(this.world.season.number),
      onShare: () => this.openShare(),
    });
  }

  private onSeasonEnd(entry: import("../shared/protocol").FameEntry, online: boolean): void {
    if (online) this.store.update({ golden: true });
    this.store.update({ seenArrival: Math.max(this.store.value.seenArrival, entry.season) });
    if (!this.garden) {
      this.garden = new HoleScene(this.quality, "garden", this.stage.environment(), this.reducedMotion);
      this.garden.setCameraMode("arrival", true);
    }
    this.garden.setLighting(lightingAt(12));
    this.garden.setRim(
      rimSlots(this.world.rim, this.world.you, 10),
      new Map(this.world.rim.map((r) => [r.id, r.spoon] as [string, SpoonId])),
    );
    this.arrivalShowing = true;
    this.ui.setArriving(true);
    this.dialogs.close();
    this.dialogs.arrival({
      entry,
      yours: this.store.seasonScoopsFor(entry.season),
      golden: online,
      onMural: () => {
        this.arrivalShowing = false;
        this.ui.setArriving(false);
        this.dialogs.close();
        this.connection.send({ t: "fame" });
        this.dialogs.fame(this.world.fame);
      },
      onNext: () => {
        this.arrivalShowing = false;
        this.ui.setArriving(false);
        this.go("hole");
      },
    });
    if (online) this.announceSpoon("golden");
  }

  private announceSpoon(id: SpoonId): void {
    toast(
      this.ui.root,
      translate(this.locale, "spoons.unlocked", { spoon: pick(this.locale, spoonById(id).name) }),
    );
  }

  private openSpoons(): void {
    const s = this.store.value;
    this.dialogs.spoons({
      lifetime: s.lifetimeScoops,
      golden: s.golden,
      current: s.spoon,
      choose: (id) => {
        this.store.update({ spoon: id });
        this.connection.send({ t: "spoon", spoon: id });
        this.lastRimKey = "";
        // Show it right away, before the server's next rim message.
        this.world = {
          ...this.world,
          rim: this.world.rim.map((r) => (r.id === this.world.you ? { ...r, spoon: id } : r)),
        };
        this.syncRim();
      },
    });
  }

  private openShare(): void {
    // The card uses the landing's photo angle (board 6), then the view goes back.
    const mode = this.hole.cameraMode;
    this.hole.setCameraMode("landing", true);
    this.hole.update(0, 0);
    const photo = this.stage.snapshot(this.hole);
    this.hole.setCameraMode(mode, true);
    const url = `${location.origin}/`;
    this.dialogs.share({
      photo,
      url,
      text: shareCardText(
        this.locale,
        this.store.seasonScoopsFor(this.world.season.number),
        this.world.total,
        url,
      ),
    });
  }

  // ---------- replay ----------

  private requestReplay(): void {
    this.connection.send({ t: "activity" });
  }

  private startReplay(msg: Extract<ServerMessage, { t: "activity" }>): void {
    const schedule = replaySchedule(msg.frames);
    if (schedule.length === 0) return;
    this.replay = { schedule, started: performance.now(), duration: replayDuration(msg.frames), cursor: 0 };
    this.ui.setReplaying(true);
    if (this.view !== "hole") this.go("hole");
  }

  private stopReplay(): void {
    this.replay = null;
    this.ui.setReplaying(false);
  }

  private stepReplay(now: number): void {
    if (!this.replay) return;
    const t = now - this.replay.started;
    for (const g of ghostsBetween(this.replay.schedule, this.replay.cursor, t)) {
      this.hole.ghostDig(hash01(g.country) * Math.PI * 2);
    }
    this.replay.cursor = t;
    if (t > this.replay.duration) this.stopReplay();
  }

  // ---------- rim ----------

  private syncRim(): void {
    const you = this.world.you;
    const rim = [...this.world.rim];
    if (you && !rim.some((r) => r.id === you)) {
      rim.unshift({ id: you, country: "XX", spoon: this.store.value.spoon, scoops: 0 });
    }
    const slots = rimSlots(rim, you, this.quality.name === "low" ? 10 : 16);
    const key = slots.map((s) => `${s.id}:${rim.find((r) => r.id === s.id)?.spoon}`).join(",");
    if (key !== this.lastRimKey) {
      this.lastRimKey = key;
      this.hole.setRim(
        slots,
        new Map(rim.map((r) => [r.id, r.id === you ? this.store.value.spoon : r.spoon])),
      );
    }
    // Others' spoons dig when their count goes up.
    for (const r of rim) {
      const prev = this.rimScoops.get(r.id);
      if (prev !== undefined && r.scoops > prev && r.id !== you) this.hole.dig(r.id);
      this.rimScoops.set(r.id, r.scoops);
    }
    this.ui.syncTags(
      slots.map((s) => {
        const r = rim.find((x) => x.id === s.id)!;
        return {
          id: s.id,
          country: r.country,
          scoops: s.you ? this.store.value.lifetimeScoops + this.batcher.pending : r.scoops,
          you: s.you,
        };
      }),
    );
    if (this.world.players < 5 !== this.lastOfferReplay) {
      this.lastOfferReplay = this.world.players < 5;
      this.updateAway();
    }
  }
  private lastOfferReplay = false;

  // ---------- panels ----------

  private refreshPanels(): void {
    if (this.world.season.number === 0) {
      this.ui.setUnknown();
      return;
    }
    const total = this.reconciler.displayed || this.world.total;
    const meters = scoopsToMeters(total);
    this.ui.setDepth(meters, layerIndexAtScoops(total), metersToNextLayer(total));
    this.ui.setMine(this.store.value.lifetimeScoops + this.batcher.pending, false);
    const idx = layerIndexAtScoops(total);
    const since = this.world.season.layerEnteredAt[idx];
    this.ui.setSince(since ? formatSince(since, this.serverNow(), this.locale) : "—");
    this.ui.setCountries(
      this.world.countries,
      this.world.total,
      etaYear(ARRIVAL_SCOOPS - this.world.total, this.world.week, this.serverNow()),
    );
    this.ui.setPlayers(this.world.players, this.world.connected);
    this.ui.setFeed(this.world.feed, this.serverNow());
  }

  // ---------- frame ----------

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const time = (now - this.start) / 1000;

    const shown = this.reconciler.step(dt * 1000, this.batcher.pending);
    const tenths = Math.floor(shown);
    if (this.world.season.number === 0) {
      // Nothing from the room yet: keep the dashes.
    } else if (tenths !== this.lastMetersText) {
      this.lastMetersText = tenths;
      const meters = scoopsToMeters(shown);
      const idx = layerIndexAtScoops(shown);
      this.ui.setDepth(meters, idx, metersToNextLayer(shown));
      this.hole.setLayer(idx);
      this.section?.setDepth(meters);
    }
    if (now - this.lastLightingAt > 60_000 || this.lastLightingAt === 0) {
      this.lastLightingAt = now;
      const light = lightingAt(holeHour(this.serverNow()));
      this.hole.setLighting(light);
      this.stage.renderer.toneMappingExposure = light.exposure;
      this.ui.setClock(light.lantern ? formatClock(this.serverNow(), this.locale) : null);
    }
    this.stepReplay(now);

    const view = this.activeView();
    view.update(dt, time);
    if (view === this.section) this.section.setPointer(this.pointer.x, this.pointer.y);
    this.stage.render(view);
    this.placeOverlays();
    if (!this.dialogs.isOpen && this.pendingMilestones.length) this.showNextMilestone();
    requestAnimationFrame((t) => this.frame(t));
  }

  private placeOverlays(): void {
    if (this.view === "hole" && !this.arrivalShowing) {
      for (const [id, el] of this.ui.syncTagsCache()) {
        const p = this.hole.tagAnchor(id, this.tmp);
        if (!p) {
          this.ui.placeTag(el, 0, 0, false);
          continue;
        }
        const s = this.stage.project(p, this.hole.camera);
        this.ui.placeTag(el, s.x, s.y, s.visible);
      }
      const t = this.stage.project(this.hole.tapeAnchor, this.hole.camera);
      this.ui.tapeLabel.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-10%, -50%)`;
    }
    if (this.view === "section" && this.section) {
      this.ui.layerLabels.forEach((el, i) => {
        const p = this.stage.project(this.section!.slabCorner(i, this.tmp), this.section!.camera);
        el.style.transform = `translate(${Math.round(p.x - 24)}px, ${Math.round(p.y)}px) translateX(-100%)`;
      });
      const m = this.stage.project(this.section.marker(this.tmp), this.section.camera);
      this.ui.marker.style.transform = `translate(${Math.round(m.x)}px, ${Math.round(m.y)}px) translateY(-50%)`;
    }
    if (this.view === "world" && this.globe) {
      const hp = this.stage.project(this.globe.holePoint(this.tmp), this.globe.camera);
      this.ui.placeTag(this.ui.holeTag, hp.x, hp.y + 34, true);
      this.ui.placeCountryTags(this.globe, this.stage, this.world.countries, this.locale);
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
