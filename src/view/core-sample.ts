import { LAYERS } from "../../shared/data/layers";
import { layerCanvas, layerEmissiveCanvas, makeCanvas } from "./textures";

/**
 * A drill core of one layer, as on the Layers board: a short cylinder of the layer's material
 * with shading and broken ends. Drawn on a 2D canvas for the milestone card.
 */
export function coreSampleCanvas(layerIndex: number, width = 96, height = 260): HTMLCanvasElement {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const tex = layerCanvas(layerIndex, 256);
  const glow = layerEmissiveCanvas(layerIndex, 256);
  const top = 14;
  const bottom = height - 14;
  // Ragged ends.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, top);
  for (let x = 0; x <= width; x += 8) ctx.lineTo(x, top + Math.sin(x * 0.7 + layerIndex) * 6);
  ctx.lineTo(width, bottom);
  for (let x = width; x >= 0; x -= 8) ctx.lineTo(x, bottom + Math.cos(x * 0.5 + layerIndex) * 6);
  ctx.closePath();
  ctx.clip();
  // Tile the layer texture down the whole core (at the core's width). The Pré-Sal is one
  // sequence (salt over black rock), so it's drawn once, stretched.
  const stretch = LAYERS[layerIndex]?.id === "preSalt";
  if (stretch) ctx.drawImage(tex, 0, 0, width, height);
  for (let y = 0; !stretch && y < height; y += width) {
    ctx.drawImage(tex, 0, 0, 256, 256, 0, y, width, width);
    if (glow) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.45;
      ctx.drawImage(glow, 0, 0, 256, 256, 0, y, width, width);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }
  // Cylinder shading.
  const shade = ctx.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.55)");
  shade.addColorStop(0.35, "rgba(255,255,255,0.12)");
  shade.addColorStop(0.55, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  return canvas;
}
