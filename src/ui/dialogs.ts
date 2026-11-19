import { ARRIVAL_METERS, LAYERS } from "../../shared/data/layers";
import { SPOONS, unlockedSpoons, type SpoonId } from "../../shared/data/spoons";
import type { FameEntry } from "../../shared/protocol";
import { countryName, formatCount, formatDistance, formatDuration } from "../core/format";
import type { ShareCardText } from "../core/share-text";
import { pick, translate, type Locale, type MessageKey, type Params } from "../i18n";
import { coreSampleCanvas } from "../view/core-sample";
import { ICONS, h, icon } from "./dom";
import { canvasToBlob, drawShareCard } from "./share-card";

/** One open dialog at a time; Escape closes; focus returns to where it was. */
export class Dialogs {
  private current: { el: HTMLElement; close: () => void } | null = null;
  private returnFocus: Element | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly locale: Locale,
  ) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.current) {
        e.preventDefault();
        this.close();
      }
    });
  }

  private t = (k: MessageKey, p?: Params) => translate(this.locale, k, p);

  get isOpen(): boolean {
    return this.current !== null;
  }

  close(): void {
    if (!this.current) return;
    const c = this.current;
    this.current = null;
    c.el.remove();
    c.close();
    if (this.returnFocus instanceof HTMLElement) this.returnFocus.focus();
  }

  private open(el: HTMLElement, label: string, onClose: () => void = () => {}, modal = true): void {
    this.close();
    this.returnFocus = document.activeElement;
    let root = el;
    if (modal) {
      root = h("div", { class: "backdrop" }, el);
      root.addEventListener("pointerdown", (e) => {
        if (e.target === root) this.close();
      });
    }
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", label);
    this.host.append(root);
    this.current = { el: root, close: onClose };
    const first = el.querySelector<HTMLElement>("button.btn-primary, button");
    first?.focus();
  }

  private closeButton(): HTMLButtonElement {
    const b = h("button", {
      class: "close-btn",
      attrs: { type: "button", "aria-label": this.t("share.close") },
      on: { click: () => this.close() },
    });
    b.append(icon(ICONS.close));
    return b;
  }

  // ---------- milestone (board 5) ----------

  milestone(opts: { layer: number; tookMs: number | null; youDug: number; onShare: () => void }): void {
    const l = this.locale;
    const layer = LAYERS[opts.layer]!;
    const core = coreSampleCanvas(opts.layer, 64, 200);
    core.className = "core";
    core.setAttribute("aria-hidden", "true");
    const stat = (label: string, value: string) =>
      h(
        "div",
        { class: "stat" },
        h("span", { class: "label", text: label }),
        h("span", { class: "big-number value", text: value }),
      );
    const card = h(
      "div",
      { class: "dialog milestone" },
      h("span", { class: "label kicker", text: this.t("milestone.kicker") }),
      h("h2", { class: "wide", text: pick(l, layer.name) }),
      h(
        "div",
        { class: "body" },
        core,
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "14px" } },
          h(
            "div",
            { class: "stats" },
            stat(this.t("milestone.depth"), formatDistance(layer.startMeters, l)),
            opts.tookMs !== null ? stat(this.t("milestone.took"), formatDuration(opts.tookMs, l)) : null,
            stat(this.t("milestone.youDug"), formatCount(opts.youDug, l)),
          ),
          h("div", { class: "joke", text: pick(l, layer.joke) }),
        ),
      ),
      h(
        "div",
        { class: "actions" },
        h("button", {
          class: "btn btn-primary",
          text: this.t("milestone.continue"),
          attrs: { type: "button" },
          on: { click: () => this.close() },
        }),
        h("button", {
          class: "btn btn-ghost",
          text: this.t("milestone.share"),
          attrs: { type: "button" },
          on: { click: () => opts.onShare() },
        }),
      ),
    );
    this.open(card, pick(l, layer.name));
  }

  // ---------- share (board 6) ----------

  share(opts: { photo: HTMLCanvasElement; text: ShareCardText; url: string }): void {
    const card = drawShareCard(opts.photo, opts.text);
    const status = h("span", { class: "status", attrs: { role: "status" } });
    const say = (key: MessageKey) => {
      status.textContent = this.t(key);
    };
    const copyImage = async () => {
      try {
        const blob = await canvasToBlob(card);
        if (!blob) throw new Error("no blob");
        if (navigator.clipboard && "write" in navigator.clipboard && typeof ClipboardItem !== "undefined") {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          say("share.copied");
          return;
        }
        const file = new File([blob], "um-buraco-so.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: opts.text.plain });
          return;
        }
        throw new Error("unsupported");
      } catch {
        try {
          await navigator.clipboard.writeText(opts.text.plain);
          say("share.copied");
        } catch {
          say("share.failed");
        }
      }
    };
    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(opts.url);
        say("share.copied");
      } catch {
        say("share.failed");
      }
    };
    const download = () => {
      const a = h("a", { attrs: { href: card.toDataURL("image/png"), download: "um-buraco-so.png" } });
      a.click();
    };
    const preview = h("div", { class: "preview" }, card);
    card.setAttribute("role", "img");
    card.setAttribute("aria-label", opts.text.plain);
    const dialog = h(
      "div",
      { class: "dialog share" },
      h(
        "div",
        { class: "dialog-head" },
        h("span", { class: "label ink", text: this.t("share.title") }),
        this.closeButton(),
      ),
      preview,
      h(
        "div",
        { class: "actions" },
        h("button", {
          class: "btn btn-primary",
          text: this.t("share.copyImage"),
          attrs: { type: "button" },
          on: { click: () => void copyImage() },
        }),
        h("button", {
          class: "btn btn-ghost",
          text: this.t("share.copyLink"),
          attrs: { type: "button" },
          on: { click: () => void copyLink() },
        }),
        h("button", {
          class: "btn btn-ghost download",
          text: this.t("share.download"),
          attrs: { type: "button" },
          on: { click: download },
        }),
        status,
      ),
      h("span", { class: "privacy", text: this.t("share.privacy") }),
    );
    this.open(dialog, this.t("share.title"));
  }

  // ---------- season end (board 8) ----------

  arrival(opts: {
    entry: FameEntry;
    yours: number;
    golden: boolean;
    onMural: () => void;
    onNext: () => void;
  }): void {
    const l = this.locale;
    const stat = (label: string, value: string, yours = false) =>
      h(
        "div",
        { class: "stat" },
        h("span", { class: "label", text: label }),
        h("span", { class: `big-number value${yours ? " yours" : ""}`, text: value }),
      );
    const el = h(
      "div",
      { class: "arrival" },
      h("div", { class: "shade" }),
      h(
        "div",
        { class: "content" },
        h("span", { class: "label kicker", text: this.t("arrival.kicker", { season: opts.entry.season }) }),
        h("h2", { class: "wide", text: this.t("arrival.title") }),
        h("p", { text: this.t("arrival.text") }),
        h(
          "div",
          { class: "grid" },
          stat(this.t("arrival.distance"), formatDistance(ARRIVAL_METERS, l)),
          stat(this.t("arrival.time"), formatDuration(opts.entry.endedAt - opts.entry.startedAt, l)),
          stat(this.t("arrival.scoops"), formatCount(opts.entry.scoops, l)),
          stat(this.t("arrival.yours"), formatCount(opts.yours, l), true),
        ),
        opts.golden ? h("div", { class: "golden", text: this.t("arrival.golden") }) : null,
        h(
          "div",
          { class: "actions" },
          h("button", {
            class: "btn btn-primary",
            text: this.t("arrival.mural"),
            attrs: { type: "button" },
            on: { click: () => opts.onMural() },
          }),
          h("button", {
            class: "btn btn-ghost",
            text: this.t("arrival.next"),
            attrs: { type: "button" },
            on: {
              click: () => {
                this.close();
                opts.onNext();
              },
            },
          }),
        ),
      ),
    );
    this.open(el, this.t("arrival.title"), opts.onNext, false);
  }

  // ---------- hall of fame ("mural") ----------

  fame(entries: FameEntry[], onClose: () => void = () => {}): void {
    const l = this.locale;
    const list = h("ol", {});
    for (const e of entries) {
      const countries = e.topCountries.map((c) => countryName(c.code, l)).join(", ");
      list.append(
        h(
          "li",
          {},
          h("span", { class: "season", text: this.t("fame.season", { season: e.season }) }),
          h("span", {
            class: "row",
            text: this.t("fame.row", {
              distance: formatDistance(ARRIVAL_METERS, l),
              duration: formatDuration(e.endedAt - e.startedAt, l),
              scoops: formatCount(e.scoops, l),
              players: formatCount(e.onlineAtArrival, l),
            }),
          }),
          countries ? h("span", { class: "row", text: countries }) : null,
        ),
      );
    }
    const dialog = h(
      "div",
      { class: "dialog fame" },
      h(
        "div",
        { class: "dialog-head" },
        h("h2", { class: "wide", text: this.t("fame.title") }),
        this.closeButton(),
      ),
      entries.length ? list : h("p", { class: "row", text: this.t("fame.empty") }),
    );
    this.open(dialog, this.t("fame.title"), onClose);
  }

  // ---------- spoons ----------

  spoons(opts: { lifetime: number; golden: boolean; current: SpoonId; choose: (id: SpoonId) => void }): void {
    const l = this.locale;
    const unlocked = new Set(unlockedSpoons(opts.lifetime, opts.golden));
    const grid = h("div", { class: "spoon-grid" });
    for (const s of SPOONS) {
      const open = unlocked.has(s.id);
      const unlock =
        s.unlockAt === null
          ? this.t("spoons.seasonEnd")
          : s.unlockAt === 0
            ? this.t("spoons.free")
            : this.t("spoons.needs", { count: formatCount(s.unlockAt, l) });
      const card = h(
        "button",
        {
          class: "spoon-card",
          attrs: {
            type: "button",
            "aria-pressed": String(s.id === opts.current),
            disabled: !open,
            "aria-label": `${pick(l, s.name)}. ${open ? (s.id === opts.current ? this.t("spoons.inUse") : this.t("spoons.use")) : `${this.t("spoons.locked")}: ${unlock}`}`,
          },
          on: {
            click: () => {
              opts.choose(s.id);
              this.close();
            },
          },
        },
        h("span", { class: "swatch", style: { background: s.color } }),
        h("span", { class: "name", text: pick(l, s.name) }),
        h("span", { class: "line", text: pick(l, s.line) }),
        h("span", { class: "unlock", text: unlock }),
      );
      grid.append(card);
    }
    const dialog = h(
      "div",
      { class: "dialog spoons" },
      h(
        "div",
        { class: "dialog-head" },
        h("h2", { class: "wide", text: this.t("spoons.title") }),
        this.closeButton(),
      ),
      h("p", { class: "note", text: this.t("spoons.note") }),
      grid,
    );
    this.open(dialog, this.t("spoons.title"));
  }
}

/** A short message near the bottom, gone after a few seconds. */
export function toast(host: HTMLElement, text: string, ms = 3500): void {
  const el = h("div", { class: "panel toast", attrs: { role: "status" }, text });
  host.append(el);
  setTimeout(() => el.remove(), ms);
}
