# Um Buraco Só

> *One hole.* Everyone on the internet digs the same hole, from Brazil to Japan, with a spoon. One shared depth, live. Free, open source, played from a link, no login.

**Status:** the whole game is built and runs locally, on Node or on Cloudflare's runtime (`wrangler dev`). Not deployed yet: that needs a Cloudflare account and a domain (see `TODO_FOR_YOU.md`).

A browser game and a portfolio piece. The interesting problem is not the hole, it's the number: thousands of clients adding to one shared counter in real time, with optimistic updates, reconciliation, server-side rate limiting, persistence across restarts, and a load test that says where it breaks.

Player-facing text is English by default, with a PT-BR toggle in the corner. Code, comments and docs are in English.

| Doc | What's in it |
|---|---|
| [`GAME_PLAN.md`](GAME_PLAN.md) | The game, screens, spoons, layers, seasons, architecture, risks |
| [`ROADMAP.md`](ROADMAP.md) | Ordered task list and current progress |
| [`CLAUDE.md`](CLAUDE.md) | Project rules (language, testing, git workflow, architecture, design sync) |
| [`TODO_FOR_YOU.md`](TODO_FOR_YOU.md) | Things only the developer can do |
| [`load/README.md`](load/README.md) | Load test method and results |
| [`designs/`](designs) | Screen, spoon, layer and art-direction mockups, rendered from the game |
| [`marketing/`](marketing) | Launch posts and clips |

## What you see

- **Buraco (hole):** a photo-style lawn with the hole in the middle. Every player is a spoon planted around the rim, tagged with their country and scoop count; your spoon is orange. Click, tap or press Space to dig. A tape measure reads the world's depth; a feed says who joined and what was found.
- **Corte (cut):** a block of ground with the eight layers, from Quintal to Núcleo, and a thin shaft showing how far the world has got.
- **Mundo (world):** the globe with a dot per country digging right now, the top countries, and the year we reach Japan at this week's pace.
- **Milestones** when the world enters a new layer, a **share card** (1200 × 630, numbers only), **spoons** that unlock with your own scoops, **"while you were away"** and a **replay** of the last minute when few people are online, **night lighting** that follows the time at the hole (Brasília), and a **season end**: when the hole comes out in a Kyoto rock garden, the season goes into the hall of fame, everyone online gets the golden spoon, and a new hole starts.

## How it works

```
 browser (many)                         one room (server)
 ┌──────────────────────┐   batch      ┌──────────────────────────┐
 │ click / tap / Space  │ ───────────▶ │ validate + rate limit    │
 │ count locally        │  every       │ total += scoops          │
 │ show your scoops now │  400 ms      │ snapshot every 5 s       │
 │ ease to server total │ ◀─────────── │ broadcast ≤ 6.7× / s     │
 └──────────────────────┘   total      └──────────────────────────┘
```

**One authoritative room, pure logic.** `server/room.ts` is a class with no timers, sockets or storage: connections, raw messages and the clock go in, messages to send come out. That makes every rule unit-testable with a fake clock, and makes the hosting a thin adapter: `server/adapters/node.ts` (`ws`, for development) and `server/adapters/cloudflare.ts` (a Worker plus one Durable Object, for production).

**The number is an integer of scoops.** Depth in meters is derived from it in `shared/depth.ts`, imported by both client and server, so they never disagree. Meters per scoop grow with depth (a scoop is a tenth of a millimeter in the backyard and kilometers in the core), calibrated so 9.381.220 scoops reach 8.919,4 m and 13.412.006 reach Japan.

**Optimistic, then reconciled.** The client applies your scoops at once and sends them in batches (`src/core/batcher.ts`). It mirrors the server's token bucket, so it never sends more than will be accepted. The display (`src/core/reconcile.ts`) eases toward the server's total plus your unconfirmed scoops and never goes backwards, even if the server drops some. Batches in flight when the connection drops are discarded rather than risk counting twice; scoops dug offline wait and go out after reconnecting, at the server's pace.

**Rate limits and abuse.** Every message is parsed and validated before the room sees it (`shared/protocol.ts`); bad ones are strikes, and too many strikes close the socket. Scoops are capped per connection (15/s) and per IP (45/s, shared across tabs), connections per IP (10) and per room (10,000). The country comes from the platform's request headers, never from the client. The number is a joke, not a prize: cheating is pointless, not impossible. `tests/server/abuse.test.ts` covers click bots, replays, floods, malformed and oversized input, and spoofing.

**Persistence.** The room snapshots its state every few seconds (and on shutdown) with a backup copy. If both copies are unreadable, it refuses to start rather than silently reset a live hole to zero.

**Cheap when idle.** On Cloudflare the room uses the WebSocket Hibernation API: sockets stay open while the object sleeps, connection info lives in socket attachments, and the room only ticks while something changed. Clients only send while someone digs.

**Privacy.** No accounts, names, chat or cookies. IPs are used in memory for rate limits and never stored. Locations are countries only. Your own scoop count, spoon and language live in your browser's `localStorage`.

**Rendering.** three.js with procedural textures (no image assets): instanced grass, a radial ground mesh with the hole, steel spoons with a reflection map, a cut block, and a globe drawn from Natural Earth land data. The globe is a lazy-loaded chunk. Phones get fewer grass blades, no shadows and a capped pixel ratio. Initial JS is ~175 KB gzipped (budget 300 KB, checked in CI).

## Load test

One room on the Node adapter (M3 Max laptop, load generator on the same machine) held **6,000 players digging at 34 ms p95** broadcast latency with no errors, and reached its **10,000-connection cap at 55 ms p95** using ~85 % of one CPU core. Past the cap, new players are told the room is full. Method, numbers and the Cloudflare cost math: [`load/README.md`](load/README.md).

## Requirements

- **Node.js 22+** (CI uses 24) and npm
- **Git LFS** (design images)

```sh
brew install node git-lfs
git lfs install
```

## Getting the code

```sh
git clone https://github.com/allbdev/the-single-hole.git
cd the-single-hole
git lfs pull
npm install
```

## Running

```sh
npm run dev        # client (Vite) + local room (Node), http://localhost:5173
npm run check      # typecheck (client + worker) + lint + unit tests
npm run e2e        # Playwright smoke test (starts the dev server)
npm run build      # static client in dist/
npm run budget     # initial JS size against the budget
npm run dev:worker # the production stack on Cloudflare's local runtime
npm run deploy     # build + wrangler deploy (needs a Cloudflare account)
```

Dev helpers:

```sh
# a busy room: start deep, read the country from the socket URL, then add fake players
ROOM_START_SCOOPS=9381220 ROOM_DEV_QUERY_COUNTRY=1 TRUST_PROXY=1 npm run dev
npx tsx tools/bots.ts --count=14
# URL flags: ?lang=pt-BR  ?view=hole|section|world  ?quality=low|medium|high
```

## Controls

| Input | Action |
|---|---|
| **Click / tap the hole**, or **Space** / **Enter** | Dig one scoop |
| **Your orange tag** | Choose a spoon |
| **Buraco · Corte · Mundo** tabs | Hole, cross-section, world |
| **Drag** on the globe | Turn it |
| **PT / EN**, speaker icon | Language, sound |

## Project layout

```
src/
  core/        Client logic with no rendering: batcher, reconcile, connection, game state,
               replay, format, storage, layout, lighting, quality. Unit tested.
  view/        three.js scenes: hole (lawn and Kyoto garden), cut block, globe; textures, spoons.
  ui/          DOM HUD, panels, dialogs, share card, styles.
  i18n/        en.ts, pt-BR.ts
server/
  room.ts      The authoritative room (pure logic). Unit and abuse tested.
  snapshot.ts  Snapshot validation and recovery.
  adapters/    node.ts (dev / VM), cloudflare.ts (Worker + Durable Object).
shared/        Protocol, depth math, token bucket, data (layers, spoons, finds).
tests/         Vitest, mirroring src/, server/ and shared/.
e2e/           Playwright smoke test.
load/          Load test (Node and k6) and results.
tools/         Bots, bundle budget, board renders, launch clips, country centroids.
designs/       Mockups (reference only, not shipped).
```

## Contributing workflow

1. Pick the next task in `ROADMAP.md`.
2. Write the feature together with its tests, keeping logic out of the views.
3. Run `npm run check` and make sure it passes.
4. If the change affects a screen, update the design canvas and `/designs` (see `CLAUDE.md`).
5. Commit. Before pushing, run a security review of the changes (see `CLAUDE.md`).

## License

[MIT](LICENSE). Land shapes on the globe: Natural Earth via `world-atlas` (public domain). Fonts: Archivo and IBM Plex Mono (SIL Open Font License).
