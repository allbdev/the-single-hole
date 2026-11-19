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
  ctx.drawImage(tex, 0, 0, 256, 256 * (height / width) * 0.4, 0, 0, width, height);
  if (glow) {
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glow, 0, 0, 256, 256 * (height / width) * 0.4, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
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
