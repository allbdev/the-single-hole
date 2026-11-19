import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { LAYERS } from "../../shared/data/layers";
import { ValueNoise, hexToRgb, lerpRgb, mulberry32, ramp } from "./noise";

/** A 2D canvas in the browser (OffscreenCanvas when available). */
export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function pixels(size: number, fn: (x: number, y: number) => [number, number, number]): HTMLCanvasElement {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function toTexture(canvas: HTMLCanvasElement, repeat = 1, color = true): Texture {
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (color) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = make();
    cache.set(key, c);
  }
  return c;
}

/**
 * The ground around the hole, seen from above: grass far out, loose dirt and clods near the hole.
 * The plane's UV 0..1 covers `extent` meters; the dirt ring sits in the middle.
 */
export function groundCanvas(size: number, theme: "lawn" | "garden", extent = 16): HTMLCanvasElement {
  return cached(`ground-${theme}-${size}`, () => {
    const n = new ValueNoise(7);
    const n2 = new ValueNoise(11);
    const grassA = hexToRgb("#1f3314");
    const grassB = hexToRgb("#3a5520");
    const dirtA = hexToRgb("#3b2a1c");
    const dirtB = hexToRgb("#1d140d");
    const gravelA = hexToRgb("#b8b3a7");
    const gravelB = hexToRgb("#8e897e");
    const rand = mulberry32(3);
    const canvas = pixels(size, (x, y) => {
      const u = x / size - 0.5;
      const v = y / size - 0.5;
      const r = Math.hypot(u, v) * extent; // meters from center
      const edge = 3.1 + (n.fbm((x / size) * 10, (y / size) * 10, 3) - 0.5) * 1.4;
      const d = n2.fbm((x / size) * 110, (y / size) * 110, 4);
      if (theme === "garden") {
        // Raked gravel in rings around the hole.
        const rake = 0.5 + 0.5 * Math.sin(r * 9 + n.fbm(x / 60, y / 60) * 2);
        const g = lerpRgb(gravelA, gravelB, rake * 0.55 + d * 0.45);
        if (r < edge) return lerpRgb(dirtA, dirtB, d);
        return g;
      }
      if (r < edge) {
        const clod = d > 0.62 ? 0.75 : 0;
        return lerpRgb(dirtA, dirtB, Math.min(1, d * 1.2 + clod + (rand() - 0.5) * 0.15));
      }
      const g = n.fbm((x / size) * 160, (y / size) * 160, 4);
      const blend = Math.min(1, (r - edge) / 1.2);
      return lerpRgb(lerpRgb(dirtA, dirtB, d), lerpRgb(grassA, grassB, g + (rand() - 0.5) * 0.2), blend);
    });
    return canvas;
  });
}

/** Tiling dirt for the shaft walls and the inside of the hole. */
export function dirtCanvas(size: number): HTMLCanvasElement {
  return cached(`dirt-${size}`, () => {
    const n = new ValueNoise(21);
    const rand = mulberry32(5);
    const a = hexToRgb("#3a291b");
    const b = hexToRgb("#120c08");
    const period = 8;
    return pixels(size, (x, y) => {
      const d = n.fbm((x / size) * period, (y / size) * period, 5, period);
      return lerpRgb(a, b, Math.min(1, d * 1.15 + (rand() - 0.5) * 0.18));
    });
  });
}

/**
 * One layer's material, drawn like the Section board: roots in the backyard, pebbles in the worms,
 * cracks in the clay, shells in the limestone, salt over black rock, blue wet sandstone, lava veins
 * in the mantle, glowing iron in the core.
 */
export function layerCanvas(index: number, size: number): HTMLCanvasElement {
  return cached(`layer-${index}-${size}`, () => {
    const layer = LAYERS[index]!;
    const n = new ValueNoise(100 + index);
    const n2 = new ValueNoise(200 + index);
    const rand = mulberry32(300 + index);
    const period = 4;
    const canvas = pixels(size, (x, y) => {
      const u = (x / size) * period;
      const v = (y / size) * period;
      const base = n.fbm(u * 2, v * 2, 5, period * 2);
      switch (layer.id) {
        case "fossils":
        case "groundwater": {
          const wave = 0.5 + 0.5 * Math.sin(v * 22 + n2.fbm(u * 3, v * 3, 3, period * 3) * 6);
          return ramp(layer.palette, base * 0.6 + wave * 0.35);
        }
        case "preSalt": {
          // Salt on top, black rock below, with a ragged boundary.
          const boundary = 0.62 + (n2.fbm(u * 6, 0.5, 3, period * 6) - 0.5) * 0.12;
          return y / size < boundary
            ? ramp(["#f4f2ec", "#e3dfd5", "#c9c4b8"], base)
            : ramp(["#2b2c2e", "#18191a", "#0b0b0c"], base);
        }
        case "mantle": {
          const vein = Math.abs(n2.fbm(u * 3, v * 3, 4, period * 3) - 0.5);
          const glow = Math.max(0, 1 - vein * 30);
          const rock = ramp([layer.palette[1], layer.palette[2], "#0d0605"], base);
          return lerpRgb(rock, hexToRgb(layer.palette[0]), glow);
        }
        case "core":
          return ramp(layer.palette, 1 - base * 1.1);
        default:
          return ramp(layer.palette, base + (rand() - 0.5) * 0.12);
      }
    });
    const ctx = canvas.getContext("2d")!;
    // Details on top.
    const detail = mulberry32(400 + index);
    if (layer.id === "backyard") {
      ctx.strokeStyle = "rgba(160,120,70,0.45)";
      for (let i = 0; i < 40; i++) {
        ctx.lineWidth = 0.5 + detail() * 1.5;
        ctx.beginPath();
        let px = detail() * size;
        let py = detail() * size * 0.3;
        ctx.moveTo(px, py);
        for (let k = 0; k < 8; k++) {
          px += (detail() - 0.5) * size * 0.05;
          py += detail() * size * 0.06;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    if (layer.id === "worms" || layer.id === "fossils") {
      for (let i = 0; i < size / 6; i++) {
        ctx.fillStyle = layer.id === "worms" ? "rgba(170,165,155,0.8)" : "rgba(245,240,228,0.85)";
        ctx.beginPath();
        ctx.ellipse(
          detail() * size,
          detail() * size,
          1 + detail() * 3,
          1 + detail() * 2,
          detail() * 3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    if (layer.id === "clay") {
      ctx.strokeStyle = "rgba(60,20,10,0.55)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        let px = detail() * size;
        let py = detail() * size;
        ctx.moveTo(px, py);
        for (let k = 0; k < 6; k++) {
          px += (detail() - 0.5) * size * 0.08;
          py += (detail() - 0.5) * size * 0.08;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    return canvas;
  });
}

/** Emissive map for glowing layers (mantle veins, core), black elsewhere. */
export function layerEmissiveCanvas(index: number, size: number): HTMLCanvasElement | null {
  const layer = LAYERS[index]!;
  if (layer.id !== "mantle" && layer.id !== "core") return null;
  return cached(`emissive-${index}-${size}`, () => {
    const n = new ValueNoise(100 + index);
    const n2 = new ValueNoise(200 + index);
    const period = 4;
    return pixels(size, (x, y) => {
      const u = (x / size) * period;
      const v = (y / size) * period;
      if (layer.id === "core") {
        const b = 1 - n.fbm(u * 2, v * 2, 5, period * 2);
        return lerpRgb(hexToRgb("#a03810"), hexToRgb("#ffd27a"), b);
      }
      const vein = Math.abs(n2.fbm(u * 3, v * 3, 4, period * 3) - 0.5);
      const glow = Math.max(0, 1 - vein * 30);
      return lerpRgb([0, 0, 0], hexToRgb("#ff8a2a"), glow);
    });
  });
}

/** Wood grain for the wooden spoon. */
export function woodCanvas(size: number): HTMLCanvasElement {
  return cached(`wood-${size}`, () => {
    const n = new ValueNoise(51);
    const a = hexToRgb("#c08a55");
    const b = hexToRgb("#7d5530");
    return pixels(size, (x, y) => {
      const g = 0.5 + 0.5 * Math.sin(y * 0.35 + n.fbm(x / 20, y / 60, 3) * 8);
      return lerpRgb(a, b, g * 0.7 + n.fbm(x / 8, y / 8, 2) * 0.3);
    });
  });
}

/** Enamel speckle for the camping spoon. */
export function speckleCanvas(size: number, base: string): HTMLCanvasElement {
  return cached(`speckle-${base}-${size}`, () => {
    const rand = mulberry32(61);
    const c = hexToRgb(base);
    return pixels(size, () => (rand() < 0.04 ? [235, 235, 230] : lerpRgb(c, [0, 0, 0], rand() * 0.15)));
  });
}

/** Noise for roughness/bump on metal (brushed lines, tarnish). */
export function brushedCanvas(size: number, tarnish: boolean): HTMLCanvasElement {
  return cached(`brushed-${tarnish}-${size}`, () => {
    const n = new ValueNoise(71);
    const rand = mulberry32(73);
    return pixels(size, (x, y) => {
      const line = rand() * 0.25 + n.noise(x * 0.05, y * 2) * 0.35;
      const t = tarnish ? n.fbm(x / 30, y / 30, 4) * 0.6 : 0;
      const v = Math.round((0.4 + line + t) * 255);
      return [v, v, v];
    });
  });
}
