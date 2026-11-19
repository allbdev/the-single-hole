# Um Buraco Só

> *One hole.* Everyone on the internet digs the same hole, from Brazil to Japan, with a spoon. One shared depth, live. Free, open source, played from a link, no login.

**Status:** plan and mockups only. Nothing is built yet (see `ROADMAP.md`).

A browser game and a portfolio piece. The interesting problem is not the hole, it's the number: thousands of clients adding to one shared counter in real time, with optimistic updates, reconciliation, server-side rate limiting, persistence across restarts, and a load test that says where it breaks.

Player-facing text is English by default, with a PT-BR toggle in the corner. Code, comments and docs are in English.

| Doc | What's in it |
|---|---|
| [`GAME_PLAN.md`](GAME_PLAN.md) | The game, screens, spoons, layers, seasons, architecture, risks |
| [`ROADMAP.md`](ROADMAP.md) | Ordered task list and current progress |
| [`CLAUDE.md`](CLAUDE.md) | Project rules (language, testing, git workflow, architecture, design sync) |
| [`TODO_FOR_YOU.md`](TODO_FOR_YOU.md) | Open decisions and things only the developer can do |
| [`designs/`](designs) | Screen, spoon, layer and art-direction mockups |

## How it works

```
 browser (many)                         one room (server)
 ┌──────────────────────┐   batch      ┌──────────────────────────┐
 │ click / tap / Space  │ ───────────▶ │ validate + rate limit    │
 │ count locally        │  every       │ total += scoops          │
 │ show your scoops now │  250–500 ms  │ snapshot every few s     │
 │ ease to server total │ ◀─────────── │ broadcast 5–10× / s      │
 └──────────────────────┘   total      └──────────────────────────┘
```

- **Client:** applies your own scoops at once, sends them in batches, and eases toward the server's total so the depth never jumps backwards.
- **Server:** one authoritative room. Pure TypeScript logic (`server/room.ts`) behind a thin platform adapter, so the hosting choice can change without touching the rules.
- **Shared:** the protocol and the depth math live in `shared/`, imported by both sides, so the client and server never disagree on what a scoop is worth.

The write-up (load-test numbers, what broke first, what it costs) will go here once it exists.

## Requirements

- **Node.js 22 LTS** and npm
- **Git LFS** (images, textures and fonts)

```sh
brew install node@22 git-lfs
git lfs install
```

## Getting the code

```sh
git clone https://github.com/allbdev/the-single-hole.git
cd the-single-hole
git lfs pull
```

## Running

> Not built yet. These are the planned commands (`ROADMAP.md` Phase 0).

```sh
npm install
npm run dev        # client (Vite) + local room server, http://localhost:5173
npm run check      # typecheck + lint + unit tests
npm run e2e        # Playwright smoke test
npm run build      # static client in dist/
npm run load       # k6 load test against a local room
```

## Controls

| Input | Action |
|---|---|
| **Click / tap the hole**, or **Space** | Dig one scoop |
| **Buraco · Corte · Mundo** tabs | Hole, cross-section, world |
| **PT / EN** | Language |

## Project layout (planned)

```
src/
  core/        Client logic with no rendering: batcher, reconcile, format, unlocks. Unit tested.
  view/        three.js scenes: hole, cross-section, globe.
  ui/          DOM HUD, panels, share dialog, tabs.
  i18n/        pt-BR.ts, en.ts
server/
  room.ts      The authoritative room (pure logic). Unit tested.
  adapters/    The hosting platform glue.
shared/        Protocol, depth math, data (layers, spoons, feed templates).
tests/         Vitest, mirroring src/, server/ and shared/.
e2e/           Playwright smoke test.
load/          k6 scripts and results.
tools/         Board renders for the design canvas, asset scripts.
designs/       Mockups (reference only, not shipped).
```

## Contributing workflow

1. Pick the next task in `ROADMAP.md`.
2. Write the feature together with its tests, keeping logic out of the views.
3. Run `npm run check` and make sure it passes.
4. If the change affects a screen, update the design canvas and `/designs` (see `CLAUDE.md`).
5. Commit. Before pushing, run a security review of the changes (see `CLAUDE.md`).

## License

MIT (to be added with the scaffold).
