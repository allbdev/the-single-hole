/**
 * Renders every design-canvas board image from the game itself (CLAUDE.md, "Design canvas").
 * Starts its own seeded room, Vite and bots, takes the screenshots with Playwright, and writes:
 *   <out>/screens/*.png   the in-game screens (board images)
 *   <out>/designs/*.jpg   the /designs exports, one per board
 *
 *   npx tsx tools/designs/render-boards.ts --out=/tmp/boards
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type Page } from "@playwright/test";
import { LAYERS } from "../../shared/data/layers";
import { SPOONS } from "../../shared/data/spoons";
import { formatCount } from "../../src/core/format";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "1"];
  }),
);
const OUT = resolve(args.out ?? join(tmpdir(), "um-buraco-so-boards"));
const ROOT = resolve(import.meta.dirname, "../..");
const ROOM_PORT = 8797;
const WEB_PORT = 5199;
const BASE = `http://localhost:${WEB_PORT}`;
const children: ChildProcess[] = [];

function run(cmd: string, argv: string[], env: Record<string, string>): ChildProcess {
  const child = spawn(cmd, argv, { cwd: ROOT, env: { ...process.env, ...env }, stdio: "ignore" });
  children.push(child);
  return child;
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

const snap = join(tmpdir(), `boards-room-${process.pid}.json`);
rmSync(snap, { force: true });
mkdirSync(join(OUT, "screens"), { recursive: true });
mkdirSync(join(OUT, "designs"), { recursive: true });

async function main(): Promise<void> {
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
  const shoot = async (
    name: string,
    query: string,
    opts: { w?: number; h?: number; before?: (p: Page) => Promise<void>; settle?: number } = {},
  ) => {
    const page = await browser.newPage({
      viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 },
      deviceScaleFactor: 2,
    });
    await page.goto(`${BASE}/${query}`);
    await page.waitForFunction(() => (window as unknown as { __game?: { world: { connected: boolean } } }).__game?.world.connected);
    await page.waitForTimeout(2500);
    if (opts.before) await opts.before(page);
    await page.waitForTimeout(opts.settle ?? 2000);
    const path = join(OUT, "screens", `${name}.png`);
    await page.screenshot({ path });
    await page.close();
    console.info(`  ${name}`);
    return path;
  };
  const digs = async (p: Page, n: number) => {
    for (let i = 0; i < n; i++) {
      await p.keyboard.press("Space");
      await p.waitForTimeout(110);
    }
  };

  console.info("screens:");
  await shoot("01-Main", "?lang=pt-BR");
  await shoot("02-Dig", "?lang=pt-BR&view=hole", { before: (p) => digs(p, 12) });
  await shoot("03-Section", "?lang=pt-BR&view=section");
  await shoot("04-World", "?lang=pt-BR&view=world", { settle: 4000 });
  await shoot("05-Milestone", "?lang=pt-BR&view=hole", {
    before: async (p) => {
      await digs(p, 8);
      await p.evaluate(() => {
        const g = (window as unknown as { __game: { dialogs: { milestone(o: unknown): void } } }).__game;
        g.dialogs.milestone({ layer: 4, tookMs: 6 * 86_400_000, youDug: 412, onShare() {} });
      });
    },
  });
  await shoot("06-Share", "?lang=pt-BR&view=hole", {
    before: async (p) => {
      await digs(p, 8);
      await p.click(".bottom-right .btn");
    },
  });
  await shoot("07-Quiet", "?lang=pt-BR&view=hole", {
    before: async (p) => {
      await p.evaluate(async () => {
        const g = (window as unknown as { __game: Record<string, any> }).__game; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { lightingAt } = await import("/src/core/sun.ts" as string);
        const l = lightingAt(4.2);
        g.hole.setLighting(l);
        g.stage.renderer.toneMappingExposure = l.exposure;
        g.lastLightingAt = performance.now() + 1e9;
        g.ui.setClock("04:12");
        g.ui.showAway(2140, true);
      });
    },
  });
  await shoot("08-Arrival", "?lang=pt-BR&view=hole", {
    before: async (p) => {
      await p.evaluate(() => {
        const g = (window as unknown as { __game: { onSeasonEnd(e: unknown, online: boolean): void } }).__game;
        const now = Date.now();
        g.onSeasonEnd(
          {
            season: 1,
            startedAt: now - (5 * 365 + 41) * 86_400_000,
            endedAt: now,
            scoops: 13_412_006,
            topCountries: [{ code: "BR", scoops: 9_000_000 }],
            onlineAtArrival: 1284,
          },
          true,
        );
      });
    },
    settle: 3500,
  });
  const phoneDig = await shoot("09-Mobile-dig", "?lang=pt-BR&view=hole&quality=medium", {
    w: 390,
    h: 844,
    before: (p) => digs(p, 6),
  });
  const phoneCut = await shoot("09-Mobile-section", "?lang=pt-BR&view=section&quality=medium", { w: 390, h: 844 });
  const phoneShare = await shoot("09-Mobile-share", "?lang=pt-BR&view=hole&quality=medium", {
    w: 390,
    h: 844,
    before: async (p) => {
      await digs(p, 6);
      await p.click(".bottom-right .btn");
    },
  });

  // Open Graph preview (public/og.jpg): the landing at 1200 × 630.
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?lang=pt-BR`);
    await page.waitForTimeout(4500);
    await page.screenshot({ path: join(OUT, "og.jpg"), type: "jpeg", quality: 86 });
    await page.close();
    console.info("  og.jpg (copy to public/og.jpg)");
  }

  console.info("lineups:");
  const lineup = async (name: string, what: string) => {
    const page = await browser.newPage({ viewport: { width: 1664, height: what === "spoons" ? 700 : 760 }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/tools/designs/lineup.html?what=${what}`);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready);
    const path = join(OUT, "screens", `${name}.png`);
    await page.locator("canvas").screenshot({ path });
    await page.close();
    console.info(`  ${name}`);
    return path;
  };
  const spoons = await lineup("10-Spoons", "spoons");
  const cores = await lineup("11-Layers", "cores");

  console.info("designs/ exports:");
  const dataUrl = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const fontCss = `
    @font-face { font-family: "Archivo"; src: url("${BASE}/@fs${ROOT}/node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2") format("woff2"); font-stretch: 62% 125%; font-weight: 100 900; }
    @font-face { font-family: "Plex"; src: url("${BASE}/@fs${ROOT}/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2") format("woff2"); font-weight: 600; }
    body { margin: 0; background: #0c0e10; color: #f2f0ea; font-family: Archivo, sans-serif; }
    .wide { font-stretch: 125%; font-weight: 800; text-transform: uppercase; letter-spacing: -1px; line-height: .92; }
    .muted { color: #b9bcb6; }
    .mono { font-family: Plex, monospace; font-weight: 600; }`;
  const exportPage = async (name: string, w: number, h: number, html: string) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.6 });
    await page.setContent(`<!doctype html><html><head><style>${fontCss}</style></head><body>${html}</body></html>`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "designs", `${name}.jpg`), type: "jpeg", quality: 88 });
    await page.close();
    console.info(`  ${name}.jpg`);
  };
  for (const name of ["01-Main", "02-Dig", "03-Section", "04-World", "05-Milestone", "06-Share", "07-Quiet", "08-Arrival"]) {
    await exportPage(name, 1280, 720, `<img src="${dataUrl(join(OUT, "screens", `${name}.png`))}" style="width:1280px;height:720px;display:block">`);
  }
  const phone = (src: string) =>
    `<div style="width:390px;height:844px;border-radius:44px;border:10px solid #1d2125;overflow:hidden;box-shadow:0 0 0 1px #2c3136"><img src="${dataUrl(src)}" style="width:390px;height:844px;display:block"></div>`;
  await exportPage(
    "09-Mobile",
    1400,
    1000,
    `<div style="padding:44px 48px;display:flex;flex-direction:column;gap:26px">
      <div style="display:flex;align-items:baseline;gap:18px"><span class="wide" style="font-size:40px">No celular</span><span class="muted" style="font-size:17px">Opened from a link, so the phone is the main case. Same three views, one thumb.</span></div>
      <div style="display:flex;justify-content:space-between">${phone(phoneDig)}${phone(phoneCut)}${phone(phoneShare)}</div></div>`,
  );
  const labels = (items: { name: string; line: string; tag: string }[]) =>
    `<div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr))">${items
      .map(
        (i) =>
          `<div style="padding:0 10px;display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center"><span style="font-size:16px;font-weight:700">${i.name}</span><span class="muted" style="font-size:13px;line-height:1.35">${i.line}</span><span class="mono" style="font-size:11px;color:#ff5a1f;letter-spacing:1px;text-transform:uppercase">${i.tag}</span></div>`,
      )
      .join("")}</div>`;
  await exportPage(
    "10-Spoons",
    1760,
    900,
    `<div style="padding:48px;display:flex;flex-direction:column;gap:22px"><div class="wide" style="font-size:44px">Colheres</div>
      <img src="${dataUrl(spoons)}" style="width:100%;border-radius:12px;display:block">
      ${labels(
        SPOONS.map((s) => ({
          name: s.name["pt-BR"],
          line: s.line["pt-BR"],
          tag: s.unlockAt === null ? "fim de temporada" : s.unlockAt === 0 ? "de graça" : `${formatCount(s.unlockAt, "pt-BR")} colheradas`,
        })),
      )}</div>`,
  );
  await exportPage(
    "11-Layers",
    1760,
    1060,
    `<div style="padding:48px;display:flex;flex-direction:column;gap:22px"><div class="wide" style="font-size:44px">Camadas · testemunhos</div>
      <img src="${dataUrl(cores)}" style="width:100%;border-radius:12px;display:block">
      ${labels(
        LAYERS.map((l) => ({
          name: l.name["pt-BR"],
          line: l.line["pt-BR"],
          tag: l.startMeters >= 1000 ? `${formatCount(l.startMeters / 1000, "pt-BR")} km` : `${l.startMeters} m`,
        })),
      )}</div>`,
  );
  await browser.close();
  console.info(`done: ${OUT}`);
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
