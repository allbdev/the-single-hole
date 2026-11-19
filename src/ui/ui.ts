import { Vector3, type Camera } from "three";
import { ARRIVAL_METERS, LAYERS } from "../../shared/data/layers";
import { spoonById } from "../../shared/data/spoons";
import { findById } from "../../shared/data/finds";
import type { FeedItem } from "../../shared/protocol";
import { CONFIG } from "../config";
import {
  countryName,
  formatAgo,
  formatCount,
  formatDepth,
  formatDistance,
  formatPercent,
  formatRoundMeters,
  splitDepth,
} from "../core/format";
import type { CountryStat } from "../../shared/protocol";
import { topCountries } from "../core/game-state";
import { pick, translate, type Locale, type MessageKey, type Params } from "../i18n";
import { ICONS, h, icon, place, setText } from "./dom";

export type ViewName = "landing" | "hole" | "section" | "world";

export interface UiCallbacks {
  grab(): void;
  section(): void;
  tab(view: Exclude<ViewName, "landing">): void;
  lang(locale: Locale): void;
  sound(): void;
  share(): void;
  spoons(): void;
  replay(): void;
  stopReplay(): void;
  dismissAway(): void;
  dig(): void;
}

/** Render a feed item in the current language. Countries only, never cities. */
export function feedText(item: FeedItem, locale: Locale): string {
  const t = (k: MessageKey, p?: Params) => translate(locale, k, p);
  switch (item.kind) {
    case "joined":
      return t("feed.joined", {
        country: countryName(item.country, locale),
        spoon: pick(locale, spoonById(item.spoon).inSentence),
      });
    case "surge":
      return t("feed.surge", { meters: formatRoundMeters(item.meters, locale), minutes: item.minutes });
    case "streak":
      return t("feed.streak", { country: countryName(item.country, locale), count: item.count });
    case "find": {
      const f = findById(item.find);
      return t("feed.find", { find: f ? pick(locale, f.text) : "?" });
    }
    case "layer":
      return t("feed.layer", { layer: pick(locale, LAYERS[item.layer]?.name ?? LAYERS[0]!.name) });
  }
}

/** All persistent DOM: HUD, landing, tabs, dig bar, feed, tags, section and world panels. */
export class Ui {
  readonly root: HTMLElement;
  private readonly t: (k: MessageKey, p?: Params) => string;
  // HUD
  private readonly depthPillValue: HTMLElement;
  private readonly depthValue: HTMLElement;
  private readonly depthUnit: HTMLElement;
  private readonly layerSwatch: HTMLElement;
  private readonly layerName: HTMLElement;
  private readonly layerNext: HTMLElement;
  private readonly liveCount: HTMLElement[] = [];
  private readonly liveDots: HTMLElement[] = [];
  private readonly clock: HTMLElement;
  private readonly conn: HTMLElement;
  private readonly soundBtn: HTMLButtonElement;
  // Landing
  private readonly tagline: HTMLElement;
  // Dig
  readonly digArea: HTMLButtonElement;
  private readonly mine: HTMLElement;
  private readonly feedList: HTMLOListElement;
  private readonly feedEmpty: HTMLElement;
  readonly tags: HTMLElement;
  private readonly tagEls = new Map<string, HTMLElement>();
  readonly tapeLabel: HTMLElement;
  private readonly tapeValue: HTMLElement;
  private readonly away: HTMLElement;
  private readonly awayHeadline: HTMLElement;
  private readonly awayKicker: HTMLElement;
  private readonly awayNote: HTMLElement;
  private readonly replayBtn: HTMLButtonElement;
  private readonly tabs = new Map<string, HTMLButtonElement>();
  // Section
  private readonly sectionBottom: HTMLElement;
  private readonly sectionProgress: HTMLElement;
  private readonly sectionSince: HTMLElement;
  readonly layerLabels: HTMLElement[] = [];
  readonly marker: HTMLElement;
  private readonly markerTag: HTMLElement;
  // World
  private readonly countryList: HTMLOListElement;
  private readonly routeFill: HTMLElement;
  private readonly routeFrom: HTMLElement;
  private readonly summary: HTMLElement;
  readonly worldTags: HTMLElement;
  readonly holeTag: HTMLElement;
  private readonly worldLoading: HTMLElement;
  private feedRendered = "";

  constructor(
    container: HTMLElement,
    readonly locale: Locale,
    private readonly cb: UiCallbacks,
    soundOn: boolean,
  ) {
    const t = (this.t = (k: MessageKey, p?: Params) => translate(locale, k, p));
    this.root = h("div", { class: "ui", attrs: { lang: locale } });

    // ----- dig area (behind everything) -----
    this.digArea = h("button", {
      class: "dig-area",
      attrs: { type: "button", "aria-label": t("dig.area") },
      on: {
        pointerdown: (e) => {
          e.preventDefault();
          cb.dig();
        },
      },
    });
    this.digArea.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) cb.dig();
      }
    });

    // ----- top left -----
    this.depthPillValue = h("span", { class: "value" });
    const depthPill = h(
      "div",
      { class: "panel depth-pill only-landing" },
      h("span", { class: "label", text: t("depth") }),
      this.depthPillValue,
    );
    this.depthValue = h("span", { class: "big-number value" });
    this.depthUnit = h("span", { class: "big-number unit" });
    this.layerSwatch = h("span", { class: "swatch" });
    this.layerName = h("span", { class: "layer-name" });
    this.layerNext = h("span", { class: "next" });
    const mobileCount = h("span", { class: "count" });
    const mobileDot = h("span", { class: "live-dot" });
    this.liveCount.push(mobileCount);
    this.liveDots.push(mobileDot);
    const depthPanel = h(
      "div",
      { class: "panel depth-panel only-hole", attrs: { "aria-live": "off" } },
      h("span", { class: "label", text: t("depth.world") }),
      h("div", { class: "row" }, this.depthValue, this.depthUnit),
      h("div", { class: "layer" }, this.layerSwatch, this.layerName, this.layerNext),
      h(
        "div",
        { class: "mobile-live" },
        h("span", { class: "count" }, mobileDot, mobileCount),
        h("span", { class: "label", text: t("live.digging") }),
      ),
    );

    // ----- top right -----
    const count = h("span", { class: "count" });
    const dot = h("span", { class: "live-dot" });
    this.liveCount.push(count);
    this.liveDots.push(dot);
    const live = h(
      "div",
      { class: "panel live", attrs: { role: "status" } },
      dot,
      h("span", { class: "label ink", text: t("live") }),
      count,
      h("span", { class: "label", text: t("live.diggingNow") }),
    );
    const langBtn = (l: Locale, key: MessageKey) =>
      h("button", {
        text: t(key),
        attrs: { type: "button", "aria-pressed": String(locale === l), lang: l === "en" ? "en" : "pt-BR" },
        on: { click: () => cb.lang(l) },
      });
    const lang = h(
      "div",
      { class: "panel seg", attrs: { role: "group", "aria-label": t("lang.label") } },
      langBtn("pt-BR", "lang.pt"),
      langBtn("en", "lang.en"),
    );
    this.soundBtn = h("button", {
      class: "panel icon-btn",
      attrs: {
        type: "button",
        "aria-pressed": String(soundOn),
        "aria-label": t(soundOn ? "sound.on" : "sound.off"),
      },
      on: { click: () => cb.sound() },
    });
    this.soundBtn.append(icon(soundOn ? ICONS.soundOn : ICONS.soundOff));
    this.clock = h("div", { class: "panel clock", attrs: { hidden: true } });
    this.feedList = h("ol", {});
    this.feedEmpty = h("div", { class: "empty", text: t("feed.empty") });
    const feed = h(
      "section",
      { class: "panel feed only-hole", attrs: { "aria-label": t("feed.title") } },
      h("span", { class: "label", text: t("feed.title") }),
      this.feedEmpty,
      this.feedList,
    );
    const topRight = h(
      "div",
      { class: "top-right" },
      live,
      h("div", { class: "toggles" }, this.soundBtn, lang),
      this.clock,
      feed,
    );
    this.conn = h("div", { class: "panel conn", attrs: { hidden: true, role: "status" } });

    // ----- landing -----
    this.tagline = h("p", {});
    const fine = h("span", { class: "fine" });
    const fineParts = t("landing.fine").split(" · ");
    fineParts.forEach((part, i) => {
      if (i > 0) fine.append(" · ");
      if (i === fineParts.length - 1) {
        fine.append(
          h("a", { text: part, attrs: { href: CONFIG.sourceUrl, target: "_blank", rel: "noopener" } }),
        );
      } else fine.append(part);
    });
    const landing = h(
      "div",
      { class: "landing only-landing" },
      h("h1", { class: "wide", text: t("app.name") }),
      this.tagline,
      h(
        "div",
        { class: "actions" },
        h("button", {
          class: "btn btn-primary",
          text: t("landing.grab"),
          attrs: { type: "button" },
          on: { click: () => cb.grab() },
        }),
        h("button", {
          class: "btn btn-ghost",
          text: t("landing.section"),
          attrs: { type: "button" },
          on: { click: () => cb.section() },
        }),
        fine,
      ),
      CONFIG.steamUrl
        ? h("a", {
            class: "footer-links",
            text: t("steam.link"),
            attrs: { href: CONFIG.steamUrl, target: "_blank", rel: "noopener" },
          })
        : null,
    );

    // ----- tags (rim spoons, tape) -----
    this.tags = h("div", { class: "tags only-hole" });
    this.tapeValue = h("span", { class: "value" });
    this.tapeLabel = h(
      "div",
      { class: "panel tape-label" },
      h("span", { class: "label", text: t("dig.tape") }),
      this.tapeValue,
    );
    this.tags.append(this.tapeLabel);

    // ----- bottom left: away card + tabs -----
    this.awayKicker = h("span", { class: "label kicker", text: t("quiet.awayKicker") });
    this.awayHeadline = h("div", { class: "headline" });
    this.awayNote = h("div", { class: "note", text: t("quiet.replayNote") });
    this.replayBtn = h("button", {
      class: "btn btn-ghost",
      text: t("quiet.replay"),
      attrs: { type: "button" },
      on: { click: () => cb.replay() },
    });
    this.away = h(
      "div",
      { class: "panel away only-hole", attrs: { hidden: true } },
      this.awayKicker,
      this.awayHeadline,
      this.awayNote,
      h(
        "div",
        { class: "actions" },
        this.replayBtn,
        h("button", {
          class: "btn btn-ghost",
          text: t("quiet.dismiss"),
          attrs: { type: "button" },
          on: { click: () => cb.dismissAway() },
        }),
      ),
    );
    const tabs = h("div", {
      class: "panel tabs not-landing",
      attrs: { role: "tablist", "aria-label": t("tabs.label") },
    });
    for (const [view, key] of [
      ["hole", "tab.hole"],
      ["section", "tab.section"],
      ["world", "tab.world"],
    ] as const) {
      const b = h("button", {
        text: t(key),
        attrs: { type: "button", role: "tab", "aria-selected": "false" },
        on: { click: () => cb.tab(view) },
      });
      this.tabs.set(view, b);
      tabs.append(b);
    }
    const bottomLeft = h("div", { class: "bottom-left" }, this.away, tabs);

    // ----- dig bar + share -----
    this.mine = h("span", { class: "big-number value" });
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const digBar = h(
      "div",
      { class: "panel dig-bar only-hole" },
      h("div", { class: "mine" }, h("span", { class: "label", text: t("dig.yourScoops") }), this.mine),
      h("div", { class: "divider" }),
      h("span", { class: "hint", text: t(coarse ? "dig.hintTouch" : "dig.hint") }),
    );
    const bottomRight = h(
      "div",
      { class: "bottom-right only-hole" },
      h("button", {
        class: "btn btn-ghost",
        text: t("dig.share"),
        attrs: { type: "button" },
        on: { click: () => cb.share() },
      }),
    );

    // ----- section -----
    this.sectionBottom = h("span", { class: "big-number value" });
    this.sectionProgress = h("span", { class: "big-number value" });
    this.sectionSince = h("span", { class: "text" });
    const sectionPanel = h(
      "section",
      { class: "panel section-panel only-section" },
      h("span", { class: "label", text: t("section.kicker") }),
      h("h2", { class: "wide", text: t("section.title") }),
      h("div", { class: "note", text: t("section.note") }),
      h(
        "div",
        { class: "stats-row" },
        h(
          "div",
          { class: "stat" },
          h("span", { class: "label", text: t("section.bottom") }),
          this.sectionBottom,
        ),
        h(
          "div",
          { class: "stat" },
          h("span", { class: "label", text: t("section.progress") }),
          this.sectionProgress,
        ),
        h(
          "div",
          { class: "stat" },
          h("span", { class: "label", text: `${t("section.current")}` }),
          this.sectionSince,
        ),
      ),
    );
    const labels = h("div", { class: "layer-labels only-section", attrs: { "aria-hidden": "true" } });
    LAYERS.forEach((l) => {
      const el = h(
        "div",
        { class: "layer-label" },
        h("span", { class: "name", text: pick(locale, l.name) }),
        h("span", { class: "at", text: formatDistance(l.startMeters, locale).replace(/^(\d+) m$/, "$1 m") }),
      );
      // The board writes "1 km", "7 km", "2.900 km".
      if (l.startMeters >= 1000)
        setText(el.lastChild as Element, `${formatCount(l.startMeters / 1000, locale)} km`);
      else setText(el.lastChild as Element, `${formatCount(l.startMeters, locale)} m`);
      this.layerLabels.push(el);
      labels.append(el);
    });
    this.markerTag = h("span", { class: "tag" });
    this.marker = h("div", { class: "marker only-section" }, h("span", { class: "line" }), this.markerTag);
    labels.append(this.marker);

    // ----- world -----
    this.countryList = h("ol", { class: "countries" });
    this.routeFill = h("div", { class: "fill" });
    this.routeFrom = h("span", {});
    this.summary = h("div", { class: "summary" });
    const worldPanel = h(
      "section",
      { class: "panel world-panel only-world" },
      h("span", { class: "label", text: t("world.kicker") }),
      h("h2", { class: "wide", text: t("world.who") }),
      this.countryList,
      h("div", { class: "rule" }),
      h(
        "div",
        { class: "route" },
        h("span", { class: "label", text: t("world.route") }),
        h("div", { class: "track" }, this.routeFill),
        h(
          "div",
          { class: "ends" },
          this.routeFrom,
          h("span", { text: formatDistance(ARRIVAL_METERS, locale) }),
        ),
      ),
      this.summary,
    );
    this.worldTags = h("div", { class: "tags only-world", attrs: { "aria-hidden": "true" } });
    this.holeTag = h("div", { class: "tag light", text: t("world.hole") });
    this.worldTags.append(this.holeTag);
    this.worldLoading = h("div", {
      class: "loading only-world",
      text: t("world.loading"),
      attrs: { hidden: true },
    });

    this.root.append(
      this.digArea,
      h("div", { class: "landing-shade only-landing" }),
      this.tags,
      labels,
      this.worldTags,
      depthPill,
      depthPanel,
      sectionPanel,
      worldPanel,
      topRight,
      this.conn,
      landing,
      digBar,
      bottomRight,
      bottomLeft,
      this.worldLoading,
    );
    container.append(this.root);
  }

  // ---------- views ----------

  show(view: ViewName): void {
    this.root.dataset.view = view;
    for (const el of this.root.querySelectorAll<HTMLElement>("[class*='only-'], .not-landing")) {
      const cls = el.className;
      let visible = true;
      if (cls.includes("only-landing")) visible = view === "landing";
      else if (cls.includes("only-hole")) visible = view === "hole";
      else if (cls.includes("only-section")) visible = view === "section";
      else if (cls.includes("only-world")) visible = view === "world";
      else if (cls.includes("not-landing")) visible = view !== "landing";
      if (el === this.away && visible) visible = !this.awayHidden;
      if (el === this.worldLoading && visible) visible = this.globeLoading;
      el.hidden = !visible;
    }
    this.digArea.hidden = view !== "hole" && view !== "landing";
    this.digArea.tabIndex = view === "hole" ? 0 : -1;
    for (const [v, b] of this.tabs) b.setAttribute("aria-selected", String(v === view));
  }

  private awayHidden = true;
  private globeLoading = false;

  setArriving(on: boolean): void {
    this.root.classList.toggle("arriving", on);
  }

  setGlobeLoading(loading: boolean): void {
    this.globeLoading = loading;
    this.worldLoading.hidden = !loading || this.root.dataset.view !== "world";
  }

  // ---------- HUD ----------

  setDepth(meters: number, layerIndex: number, nextMeters: number | null): void {
    const l = this.locale;
    setText(this.depthPillValue, formatDepth(meters, l));
    const { value, unit } = splitDepth(meters, l);
    setText(this.depthValue, value);
    setText(this.depthUnit, unit);
    const layer = LAYERS[layerIndex]!;
    this.layerSwatch.style.background = layer.palette[0];
    setText(this.layerName, pick(l, layer.name));
    const next = LAYERS[layerIndex + 1];
    setText(
      this.layerNext,
      next && nextMeters !== null
        ? `· ${this.t("dig.nextLayer", { layer: pick(l, next.name), distance: formatDistance(nextMeters, l) })}`
        : `· ${this.t("dig.lastLayer", { distance: formatDistance(ARRIVAL_METERS - meters, l) })}`,
    );
    setText(
      this.tagline,
      this.t("landing.tagline", { remaining: formatDistance(ARRIVAL_METERS - meters, l) }),
    );
    setText(this.tapeValue, formatDepth(meters, l));
    setText(this.markerTag, `${this.t("section.here")} · ${formatDepth(meters, l)}`);
    setText(this.sectionBottom, formatDepth(meters, l));
    setText(this.sectionProgress, formatPercent(meters / ARRIVAL_METERS, l));
    this.layerLabels.forEach((el, i) => el.classList.toggle("current", i === layerIndex));
    setText(this.routeFrom, formatDistance(meters, l));
    this.routeFill.style.width = `${Math.max(0, Math.min(100, (meters / ARRIVAL_METERS) * 100))}%`;
  }

  setPlayers(n: number, connected: boolean): void {
    for (const el of this.liveCount) setText(el, formatCount(n, this.locale));
    for (const d of this.liveDots) d.classList.toggle("off", !connected);
  }

  setConnection(status: "connecting" | "open" | "waiting" | "error", errorKey?: MessageKey): void {
    if (status === "open") {
      this.conn.hidden = true;
      return;
    }
    this.conn.hidden = false;
    setText(
      this.conn,
      errorKey ? this.t(errorKey) : this.t(status === "connecting" ? "conn.connecting" : "conn.waiting"),
    );
  }

  setClock(text: string | null): void {
    this.clock.hidden = text === null;
    if (text) setText(this.clock, this.t("quiet.clock", { time: text }));
  }

  setMine(n: number, bump: boolean): void {
    setText(this.mine, formatCount(n, this.locale));
    if (bump) {
      this.mine.classList.remove("bump");
      void this.mine.offsetWidth;
      this.mine.classList.add("bump");
    }
  }

  setSince(text: string): void {
    setText(this.sectionSince, text);
  }

  // ---------- feed ----------

  setFeed(items: FeedItem[], now: number): void {
    const l = this.locale;
    const newest = [...items].reverse().slice(0, 4);
    const key = newest.map((i) => `${i.id}:${i.at}:${formatAgo(now - i.at, l)}`).join("|");
    if (key === this.feedRendered) return;
    const prevIds = new Set([...this.feedList.children].map((c) => (c as HTMLElement).dataset.id));
    this.feedRendered = key;
    this.feedList.replaceChildren(
      ...newest.map((item) => {
        const li = h(
          "li",
          { class: prevIds.size > 0 && !prevIds.has(`${item.id}:${item.at}`) ? "new" : "" },
          h("span", { text: feedText(item, l) }),
          h("span", { class: "age", text: formatAgo(now - item.at, l) }),
        );
        li.dataset.id = `${item.id}:${item.at}`;
        return li;
      }),
    );
    this.feedEmpty.hidden = newest.length > 0;
  }

  // ---------- rim tags ----------

  /** Ensure a tag per rim spoon; returns the elements by id. */
  syncTags(
    entries: { id: string; country: string; scoops: number; you: boolean }[],
  ): Map<string, HTMLElement> {
    const keep = new Set(entries.map((e) => e.id));
    for (const [id, el] of this.tagEls) {
      if (!keep.has(id)) {
        el.remove();
        this.tagEls.delete(id);
      }
    }
    for (const e of entries) {
      let el = this.tagEls.get(e.id);
      if (!el) {
        el = e.you
          ? h("button", {
              class: "tag you",
              attrs: { type: "button", "aria-label": this.t("dig.spoons") },
              on: { click: () => this.cb.spoons() },
            })
          : h("div", { class: "tag" });
        this.tagEls.set(e.id, el);
        this.tags.append(el);
      }
      const label = e.you ? this.t("dig.you").toUpperCase() : e.country === "XX" ? "··" : e.country;
      setText(el, `${label} · ${formatCount(e.scoops, this.locale)}`);
    }
    return this.tagEls;
  }

  syncTagsCache(): Map<string, HTMLElement> {
    return this.tagEls;
  }

  private readonly countryTags = new Map<string, HTMLElement>();

  /** Labels on the globe for the countries with most players ("Brasil · 812"). */
  placeCountryTags(
    globe: { countryPoint(code: string, out: Vector3): Vector3 | null; camera: Camera },
    stage: { project(p: Vector3, c: Camera): { x: number; y: number; visible: boolean } },
    countries: CountryStat[],
    locale: Locale,
  ): void {
    const top = topCountries(countries, 4).top;
    const keep = new Set(top.map((c) => c.code));
    for (const [code, el] of this.countryTags) {
      if (!keep.has(code)) {
        el.remove();
        this.countryTags.delete(code);
      }
    }
    const v = new Vector3();
    for (const c of top) {
      let el = this.countryTags.get(c.code);
      if (!el) {
        el = h("div", { class: "tag" });
        this.countryTags.set(c.code, el);
        this.worldTags.append(el);
      }
      setText(el, `${countryName(c.code, locale)} · ${formatCount(c.players, locale)}`);
      const p = globe.countryPoint(c.code, v);
      if (!p) {
        this.placeTag(el, 0, 0, false);
        continue;
      }
      const s = stage.project(p, globe.camera);
      this.placeTag(el, s.x, s.y - 6, s.visible);
    }
  }

  placeTag(el: HTMLElement, x: number, y: number, visible: boolean): void {
    el.classList.toggle("hidden", !visible);
    if (visible) place(el, x, y, " translate(-50%, -100%)");
  }

  // ---------- away / replay ----------

  showAway(meters: number | null, offerReplay: boolean): void {
    if (meters === null && !offerReplay) {
      this.awayHidden = true;
      this.away.hidden = true;
      return;
    }
    this.awayHidden = false;
    this.awayKicker.hidden = meters === null;
    this.awayHeadline.hidden = meters === null;
    if (meters !== null)
      setText(this.awayHeadline, this.t("quiet.away", { distance: formatDistance(meters, this.locale) }));
    this.awayNote.hidden = !offerReplay;
    this.replayBtn.hidden = !offerReplay;
    this.away.hidden = this.root.dataset.view !== "hole";
  }

  setReplaying(on: boolean): void {
    setText(this.replayBtn, this.t(on ? "quiet.stop" : "quiet.replay"));
    this.replayBtn.dataset.playing = String(on);
  }

  // ---------- world ----------

  setCountries(countries: CountryStat[], totalScoops: number, etaYear: number | null): void {
    const l = this.locale;
    const { top, others } = topCountries(countries, 5);
    const max = Math.max(1, top[0]?.players ?? 1, others.players);
    const rows = top.map((c) =>
      h(
        "li",
        {},
        h("span", { class: "name", text: countryName(c.code, l) }),
        h(
          "span",
          { class: "bar-wrap" },
          h("span", { class: "bar", style: { width: `${(c.players / max) * 100}%` } }),
        ),
        h("span", { class: "n", text: formatCount(c.players, l) }),
      ),
    );
    if (others.count > 0) {
      rows.push(
        h(
          "li",
          {},
          h("span", { class: "name", text: this.t("world.others", { count: others.count }) }),
          h(
            "span",
            { class: "bar-wrap" },
            h("span", { class: "bar", style: { width: `${(others.players / max) * 100}%` } }),
          ),
          h("span", { class: "n", text: formatCount(others.players, l) }),
        ),
      );
    }
    if (rows.length === 0) rows.push(h("li", {}, h("span", { class: "name", text: this.t("world.nobody") })));
    this.countryList.replaceChildren(...rows);
    setText(
      this.summary,
      etaYear === null
        ? this.t("world.summaryNoPace", { scoops: formatCount(totalScoops, l) })
        : this.t("world.summary", { scoops: formatCount(totalScoops, l), year: etaYear }),
    );
  }

  setSoundIcon(on: boolean): void {
    this.soundBtn.replaceChildren(icon(on ? ICONS.soundOn : ICONS.soundOff));
    this.soundBtn.setAttribute("aria-pressed", String(on));
    this.soundBtn.setAttribute("aria-label", this.t(on ? "sound.on" : "sound.off"));
  }

  destroy(): void {
    this.root.remove();
  }
}
