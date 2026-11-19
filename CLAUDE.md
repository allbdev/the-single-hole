# CLAUDE.md — Um Buraco Só

Browser game in **TypeScript (Vite, three.js)** with a small real-time backend: everyone on the internet digs the same hole with a spoon, one shared depth, live. Design: `GAME_PLAN.md`. Ordered task list: `ROADMAP.md`. Things only the developer can do: `TODO_FOR_YOU.md`. Art references: `/designs` and the design canvas (below).

It is a free, open-source portfolio piece: **the code and the README are part of the product.** Write them for a recruiter reading the repo.

**Source of truth:** the design canvas (below) and `GAME_PLAN.md`. Every decision in them stands. This is its own game: don't import rules, numbers or content from other projects. **Everything in `GAME_PLAN.md` is built**; there is no "first version" and "later".

Repo: https://github.com/allbdev/the-single-hole

## Before every push: security audit (mandatory)

**Run the `security-audit` skill on the changes being pushed before every `git push`.** Fix or explicitly accept every finding first. No exceptions, including docs-only or "small" pushes. The server takes input from anyone on the internet: treat it that way.

## Design canvas (keep it in sync, both ways)

The mockups live in the claude.ai Design canvas **"Um Buraco Só — Mockups"**: https://claude.ai/artifact/EYzagD2x24kd3Ay4Thg2gf (pages: Screens, Mobile, Spoons, Layers, Art direction). `/designs` holds JPG exports of its boards.

- **Game changes → canvas.** When a change here alters anything a board shows (a screen's layout, a label, a number, a layer, a spoon, a color token, a font), update that board in the same piece of work, then re-export its JPG into `/designs`. Once the game renders, board images come from the game itself (`tools/designs/`).
- **Canvas changes → game.** Before starting a task, read the boards it touches (they may have been edited by hand). If a board differs from the code or docs, the newer one wins: update the code, `GAME_PLAN.md` and `/designs` to match, or ask when it is unclear which is newer.
- New looks are tried on the canvas first, on a new page, then built.
- `GAME_PLAN.md`, the canvas and the code must never disagree at the end of a task. If you can't sync something (canvas unreachable, a render tool missing), add it to `TODO_FOR_YOU.md`.

## Language rules (strict)

| What | Language |
|---|---|
| Code: identifiers, file/folder names, types, events, message fields, data keys | **English** |
| Code comments, docstrings, commit messages, PR descriptions | **English** |
| Docs (`*.md`, including this file) | **English** |
| **Player-facing text** (UI, layer lines, feed, share card, errors shown to players) | **PT-BR and English**, both always complete |

- The game **has two languages**: English by default, with a PT/EN toggle (choice remembered in `localStorage`). Keep it to these two; don't add a third or a translation library.
- Player-facing strings live in `src/i18n/pt-BR.ts` and `src/i18n/en.ts` (and per-locale fields in `shared/data/`), never inline in components. A test fails if a key exists in one locale and not the other.
- Numbers are formatted per locale with `Intl.NumberFormat` (`8.919,4 m` in PT-BR, `8,919.4 m` in English) through one helper in `src/core/format.ts`.
- Example: `const layerReached = t("milestone.title")` is fine; `const profundidade = 0` is not.

## Testing rules

- **Every feature ships with tests.** A roadmap task isn't done until its tests are written and passing.
- **Vitest** for logic, client and server. Tests go in `tests/`, mirroring the source layout (`src/core/reconcile.ts` → `tests/core/reconcile.test.ts`, `server/room.ts` → `tests/server/room.test.ts`).
- **Playwright** for one end-to-end smoke test in `e2e/`: open the page, dig, see the depth go up, against a local server.
- Cover the logic: depth ↔ scoops math, layer lookup, the batcher, optimistic update and reconciliation, rate limiting, snapshot/restore round-trips, protocol encode/decode and validation, spoon unlocks, formatting in both locales, and edge cases (zero, negative, NaN, huge batches, out-of-order messages, reconnects, a corrupt snapshot, depth past Japan).
- Keep logic out of rendering and DOM code so it runs in Node without a browser or WebGL. three.js views read state and get tested on what they build for a given state (which layer material, how many spoons), not on pixels.
- **Fake time and the network** in tests (`vi.useFakeTimers()`, an in-memory transport). No test sleeps or talks to a real server, except the e2e one.
- Bug fixes start with a failing test that reproduces the bug.
- Run the checks before every commit, and don't commit when they fail:
  ```sh
  npm run check   # typecheck + lint + vitest
  ```

## Git workflow

- **Before every push, run the `security-audit` skill** (see the section above).
- Commit or push only when asked. Never push with failing checks.
- Never commit secrets (deploy tokens, API keys): they go in the platform's secret store and GitHub Actions secrets. `.env*` is gitignored.
- Large binary assets (`.jpg`, `.png`, `.glb`, `.hdr`, `.ktx2`, fonts) go through Git LFS (see `.gitattributes`).

## Code conventions

- TypeScript `strict`, no `any` (use `unknown` and narrow). ESLint + Prettier, run in CI.
- `camelCase` for variables and functions, `PascalCase` for types and classes, `CONSTANT_CASE` for module constants, `kebab-case` for file names.
- Content is data: layers, spoons, feed templates and layer lines live in `shared/data/` as typed objects, not hardcoded in views. A data test validates every entry (depths ascending, both locales present, unlock thresholds ascending).
- Client modules talk through a small typed event emitter (`src/core/events.ts`), not direct references between views.
- Don't simulate what you can fake: depth is a number; the hole, the cross-section and the globe swap materials by depth range. Never model anything at planet scale.
- Small bundle: no UI framework unless a task needs one (ask first). three.js is imported per module so it tree-shakes.

## Architecture notes

- **Layout:** `src/` client, `server/` room, `shared/` code and data both sides import (protocol, layers, depth math). The server never imports from `src/`, the client never from `server/`.
- **One authoritative room** holds the depth (as a scoop count, an integer; meters are derived from it with `shared/depth.ts`, so client and server always agree). It accepts batches, caps them, adds them up and broadcasts the total 5 to 10 times a second.
- **Room logic is pure** (`server/room.ts`: state in, messages out, time passed in). The platform (Cloudflare Durable Objects, PartyKit, or Node `ws`; picked in roadmap task 1) is a thin adapter in `server/adapters/`. Switching platforms touches only the adapter.
- **Protocol** (`shared/protocol.ts`): small typed messages, validated on the server before use. Unknown, oversized or malformed messages are dropped and counted, never thrown at the room. Version field from day one.
- **Client batching** (`src/core/batcher.ts`): count local clicks, send a batch every 250 to 500 ms. **Optimistic display** (`src/core/reconcile.ts`): show your own clicks at once, then ease toward the server's number; never show the depth going backwards.
- **Rate limiting:** per connection (first guess 15 scoops a second) and per IP. Extra scoops are dropped quietly; the client still shows them locally until the next reconcile. The number is a joke, not a prize: make cheating pointless, not impossible.
- **Persistence:** snapshot the total every few seconds (and on shutdown) so a restart loses seconds, not the hole. A corrupt or missing snapshot never resets a live hole to zero without a log line and a test.
- **Privacy:** no accounts, no names, no chat, no cookies beyond `localStorage` for language, sound and your own scoop count. IPs are used in memory for rate limiting and country lookup only, never stored or logged. **Countries only, never cities**: the country comes from the platform's request headers, not a third-party API, and is the most precise location the game ever shows or keeps.
- **Rendering:** three.js, one camera, like a photo (art direction board). Phones get fewer grass blades, no depth of field and a capped pixel ratio. HUD, panels, share dialog and tabs are DOM over the canvas, styled with the canvas's tokens (`#0c0e10` ground, `#f2f0ea` ink, `#ff5a1f` survey flag for live things and "you" only, Archivo + IBM Plex Mono, 12 px panels with blur).
- **Share card:** drawn on an offscreen 2D canvas at 1200 × 630 from numbers only (no player data); copy image, copy link, download PNG.
- **Accessibility:** Space and Enter dig as well as click/tap; real buttons; text meets 4.5:1 on the panels; `prefers-reduced-motion` turns off camera shake and particles.
- **Load test:** k6 scripts in `load/`. The README reports how many connections one room holds and where it breaks, with the machine and date. Rerun after any change to the room or the protocol.
- **Performance budget:** a mid-range phone on 4G: first paint under 2 s, 60 fps on the hole view (30 fps floor), initial JS under 300 KB gzipped before textures. Check with Lighthouse in CI.

## Workflow

- Work through `ROADMAP.md` in order. Mark tasks `[~]` when started and `[x]` when done and tested.
- Don't add scope that isn't in the roadmap without asking first.
- Keep `TODO_FOR_YOU.md` current: anything only the developer can do (decisions, money, accounts, domains, people) goes there, newest at the top of each section.
- After every task, check the design canvas rule above.
