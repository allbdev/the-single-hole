import type { ShareCardText } from "../core/share-text";

export const CARD_W = 1200;
export const CARD_H = 630;

/**
 * Draw the 1200 × 630 share card (board 6) from a photo of the hole and the numbers. The photo is
 * a frame of the game, so the card shows the real hole.
 */
export function drawShareCard(
  photo: CanvasImageSource & { width: number; height: number },
  text: ShareCardText,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0c0e10";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // Cover-fit the photo.
  const scale = Math.max(CARD_W / photo.width, CARD_H / photo.height);
  const w = photo.width * scale;
  const h = photo.height * scale;
  ctx.drawImage(photo, (CARD_W - w) / 2, (CARD_H - h) / 2 - 20, w, h);
  const grad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  grad.addColorStop(0, "rgba(8,10,12,0.88)");
  grad.addColorStop(0.48, "rgba(8,10,12,0.5)");
  grad.addColorStop(0.75, "rgba(8,10,12,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const left = 48;
  ctx.fillStyle = "#f2f0ea";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 58px "Archivo Variable", Archivo, sans-serif`;
  try {
    (ctx as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = "expanded";
  } catch {
    // older browsers
  }
  ctx.fillText(text.title.toUpperCase(), left, 104);

  ctx.font = `500 18px "IBM Plex Mono", monospace`;
  ctx.fillStyle = "#b9bcb6";
  ctx.fillText(spaced(text.kicker.toUpperCase()), left, 368);

  ctx.font = `600 100px "IBM Plex Mono", monospace`;
  ctx.fillStyle = "#f2f0ea";
  ctx.fillText(text.mine, left, 470);
  const mineWidth = ctx.measureText(text.mine).width;

  ctx.font = `600 27px "Archivo Variable", Archivo, sans-serif`;
  wrap(ctx, text.ofWorld, left + mineWidth + 18, 470, 600 - mineWidth, 32);

  ctx.font = `400 26px "Archivo Variable", Archivo, sans-serif`;
  ctx.fillText(text.progress, left, 522);

  ctx.font = `400 19px "IBM Plex Mono", monospace`;
  ctx.fillStyle = "#b9bcb6";
  ctx.fillText(text.domain, left, 586);
  return canvas;
}

function spaced(text: string): string {
  return text.split("").join(String.fromCharCode(8202));
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lh: number,
): void {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const start = y - (lines.length - 1) * lh;
  lines.forEach((l, i) => ctx.fillText(l, x, start + i * lh));
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
