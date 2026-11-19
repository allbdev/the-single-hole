type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Partial<Record<keyof HTMLElementEventMap, (ev: Event) => void>>;
  style?: Partial<CSSStyleDeclaration>;
}

/** Create an element. Text goes in as text nodes, never as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  if (props.style) Object.assign(el.style, props.style);
  if (props.on) for (const [k, fn] of Object.entries(props.on)) el.addEventListener(k, fn as EventListener);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

/** Set text only when it changed (cheap to call every frame). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Move an element to a pixel position via transform, skipping no-op writes. */
export function place(el: HTMLElement, x: number, y: number, extra = ""): void {
  const t = `translate(${Math.round(x)}px, ${Math.round(y)}px)${extra}`;
  if (el.style.transform !== t) el.style.transform = t;
}

/** An SVG icon from a path list (stroke icons, decorative). */
export function icon(paths: string[], size = 16): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

export const ICONS = {
  close: ["M3 3l10 10M13 3L3 13"],
  soundOn: ["M2 6h3l4-3v10l-4-3H2z", "M11.5 5.5a3.5 3.5 0 010 5", "M13 3.5a6 6 0 010 9"],
  soundOff: ["M2 6h3l4-3v10l-4-3H2z", "M11 6l4 4M15 6l-4 4"],
};
