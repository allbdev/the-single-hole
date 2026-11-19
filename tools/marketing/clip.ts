/**
 * Records the launch clips from the game: landing → dig → cut → world → share card.
 * Starts its own seeded room, Vite and bots (like tools/designs/render-boards.ts), records with
 * Playwright and encodes with ffmpeg (must be on PATH).
 *
 *   npx tsx tools/marketing/clip.ts --lang=pt-BR    # writes marketing/clip-pt-BR.mp4 and clip-pt-BR-vertical.mp4
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "1"];
  }),
);
const LANG = args.lang === "en" ? "en" : "pt-BR";
const ROOT = resolve(import.meta.dirname, "../..");
const ROOM_PORT = 8798;
const WEB_PORT = 5198;
const BASE = `http://localhost:${WEB_PORT}`;
const children: ChildProcess[] = [];
const snap = join(tmpdir(), `clip-room-${process.pid}.json`);
const videoDir = join(tmpdir(), `clip-video-${process.pid}`);

function run(cmd: string, argv: string[], env: Record<string, string>): void {
  children.push(spawn(cmd, argv, { cwd: ROOT, env: { ...process.env, ...env }, stdio: "ignore" }));
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function script(page: Page, phone: boolean, started: number): Promise<number> {
  const t = (en: string, pt: string) => (LANG === "en" ? en : pt);
  await page.goto(`${BASE}/?lang=${LANG}&quality=${phone ? "medium" : "high"}`);
  await page.waitForFunction(
    () => (window as unknown as { __game?: { world: { connected: boolean } } }).__game?.world.connected,
  );
  // The clip starts once the game is connected and the first numbers are on screen.
  const trim = (Date.now() - started) / 1000 + 0.6;
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: t("Grab a spoon", "Pegar uma colher") }).click();
  await page.waitForTimeout(1500);
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: t("Cut", "Corte") }).click();
  await page.waitForTimeout(3000);
  await page.getByRole("tab", { name: t("World", "Mundo") }).click();
  await page.waitForTimeout(3500);
  await page.getByRole("tab", { name: t("Hole", "Buraco") }).click();
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: t("Share", "Compartilhar") })
    .first()
    .click();
  await page.waitForTimeout(3500);
  return trim;
}

async function main(): Promise<void> {
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });
  run("npx", ["tsx", "server/adapters/node.ts"], {
    ROOM_PORT: String(ROOM_PORT),
    ROOM_SNAPSHOT: snap,
    ROOM_START_SCOOPS: "9381220",
    ROOM_DEV_QUERY_COUNTRY: "1",
    TRUST_PROXY: "1",
  });
  run("npx", ["vite", "--port", String(WEB_PORT), "--strictPort"], {
    VITE_ROOM_URL: `ws://localhost:${ROOM_PORT}/ws?country=BR`,
  });
  await waitFor(`http://localhost:${ROOM_PORT}/health`);
  await waitFor(BASE);
  run("npx", ["tsx", "tools/bots.ts", "--count=14", "--rate=4", `--url=ws://localhost:${ROOM_PORT}/ws`], {});
  await new Promise((r) => setTimeout(r, 6000));

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const [name, size, phone] of [
    [`clip-${LANG}`, { width: 1280, height: 720 }, false],
    [`clip-${LANG}-vertical`, { width: 405, height: 720 }, true],
  ] as const) {
    const dir = join(videoDir, name);
    const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
    const started = Date.now();
    const page = await context.newPage();
    const trim = await script(page, phone, started);
    await context.close();
    const webm = join(
      dir,
      readdirSync(dir).find((f) => f.endsWith(".webm"))!,
    );
    const out = join(ROOT, "marketing", `${name}.mp4`);
    // Skip the page load and connecting; H.264 for every platform.
    spawnSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-ss",
        trim.toFixed(2),
        "-i",
        webm,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "20",
        "-movflags",
        "+faststart",
        out,
      ],
      { stdio: "inherit" },
    );
    console.info(`wrote marketing/${name}.mp4`);
  }
  await browser.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const c of children) c.kill("SIGTERM");
    rmSync(snap, { force: true });
    rmSync(`${snap}.bak`, { force: true });
    setTimeout(() => process.exit(), 500);
  });
