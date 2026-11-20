# Um Buraco Só (One Hole) — Game Plan

**Author:** Vinícius Albuquerque Barros · **Written:** 18 Nov 2026 · **Updated:** 19 Nov 2026 (screens, spoons, layers and open questions from the design canvas) · **Status:** plan only, nothing built

Free, open-source, played from a link. A portfolio piece: the code is part of the product. Effort figures are estimates, not measurements.

Mockups: the design canvas "Um Buraco Só — Mockups" (https://claude.ai/artifact/EYzagD2x24kd3Ay4Thg2gf), exported as the JPGs in `/designs`. The canvas and this file must agree; see "Design canvas" in `CLAUDE.md`. Ordered tasks: `ROADMAP.md`. Open decisions: `TODO_FOR_YOU.md`.

**Pitch:** everyone on the internet digs the same hole. One shared depth, live.

## The two-minute loop
1. Open the link. You see the hole, the current depth, and how many people are digging right now.
2. Click or tap to dig. Your scoops add to the world's depth immediately.
3. Other players' spoons appear around the rim as they dig.
4. The world passes layers together (Quintal, Minhocas, Argila … Japan), each with a one-line joke.
5. You leave with a card: "I dug 412 of the world's 9,381,220 spoonfuls. We are 0.07% of the way to Japan."

## Scope

Everything below is built. There is no "first version" and "later": the game launches with all of it.

- One global room, one depth number, live player count.
- Click to dig, batched to the server a few times a second.
- Layer milestones: the eight layers on the canvas (below).
- Share card, and a link to the Steam page.
- Per-country totals and the world view (globe). **Countries on screen, states only for the dots, no cities anywhere.** Every label, tag, total and feed line names a country. The platform also reports the state or region (ISO 3166-2 first level, e.g. Espírito Santo); it is used only to place dots on the globe, never shown as text and never stored. A region's dot appears only when at least 3 players are online there (fewer count at the country's point), except your own dot, which the server tells only you. Decided 20 Nov 2026: a dot for Brazil in the middle of Mato Grosso didn't look like where anyone plays from.
- Spoons: eight, unlocked by your own scoop count (below).
- "Seasons": when the world reaches Japan, the hole is archived in a hall of fame ("mural") and a new one starts.
- Replay of the last minute of activity, so the room never looks empty, and "while you were away".
- Quiet hours: the hole lit for the real time of day (night lantern look).

## Architecture
- **Client:** renders the hole, counts local clicks, sends a batch every 250 to 500 ms, applies its own clicks at once and reconciles with the server's number.
- **Server:** one authoritative room holding the depth. It accepts batches, caps each connection (for example 15 scoops a second), adds them up and broadcasts the depth 5 to 10 times a second.
- **The line:** the room holds 10,000 players. Past that, newcomers wait in a first-come line instead of being turned away: "The hole is full. You're #312 in line: you get a spoon as soon as someone leaves." When a player leaves, the first in line gets in. The line has no length limit in the design (a 50,000 safety cap guards the server against socket floods), gets no broadcasts, only its place, so it costs almost nothing to hold. Decided 20 Nov 2026.
- **Persistence:** snapshot the depth every few seconds, so a restart loses seconds, not the hole.
- **Options for the backend:** a WebSocket room on a serverless platform that supports them (Cloudflare Durable Objects, PartyKit), or a small Node process with `ws` on a cheap VM. Check current free-tier limits before choosing; I have not.
- **No chat, no names.** Nothing to moderate.

## What it shows
- Real-time state shared by many clients, with optimistic updates and reconciliation.
- Server-side rate limiting and abuse handling.
- A load test (k6 or Artillery) with the numbers written up in the README: how many connections one room holds, and where it breaks.

## Risks
| Risk | Mitigation |
|---|---|
| Nobody online, so it looks dead | Depth persists between visits; replay recent activity; show totals, not only "now" |
| Click bots | Server-side caps per connection and per IP; the number is a joke, not a prize |
| Hosting cost if it spreads | Cap players per room (the rest wait in line, getting no broadcasts); the broadcast is one small number |
| Close to existing shared clickers | The planet-scale target, the layers, and the engineering write-up are the difference |

**Effort (estimate):** 2 to 4 weekends for everything, including seasons, the world view and the load-test write-up.

## Look

Realistic, not cartoon: a real-looking hole in real-looking ground, stainless-steel spoons, a geological cross-section and a globe. Mockups are in the design canvas "Um Buraco Só — Mockups".

## Screens (from the canvas)

All eight screens and the phone layouts are built.

| # | Board | What it shows |
|---|---|---|
| 1 | Landing | The hole photo, world depth, live count, PT/EN toggle, "Pegar uma colher" and "Ver o corte" |
| 2 | Dig view | Looking down the hole; each spoon is a player, held over the rim by a hand we don't see, with a country tag and scoop count; a tape measure with the depth; the feed; your scoops; "click the hole or press Space" |
| 3 | Cross-section | A cut block of ground with the eight layers, "we are here", % of the way to Japan, when the current layer started |
| 4 | World | The globe with dots per country, per-country totals ("Quem está cavando"), Brazil → Japan progress, ETA at this week's pace |
| 5 | New layer reached | Milestone card: layer name, depth, how long it took, how much you dug, the layer's joke |
| 6 | Share card | 1200 × 630 image with your scoops, the world's, % to Japan; copy image, copy link, download PNG |
| 7 | Quiet hours | Night version of the hole (local time shown), few spoons, "while you were away" and the replay |
| 8 | Season end: Japan | Arrival in a Kyoto rock garden; season totals, your scoops, the hall of fame ("mural"), "dig the next one" |
| — | Mobile | The same three views (Buraco, Corte, Mundo) one-thumb, portrait; the phone is the main case |

Navigation is three tabs: **Buraco** (hole), **Corte** (cross-section), **Mundo** (world). The feed in the dig view ("Chile entrou com colher de pau", "+1.000 m em 4 min", "Japão cavou 300 seguidas", "Alguém achou um osso") is generated from server events, never typed by players, and names countries only.

## Spoons

There are no characters: a player is a spoon, held by someone we don't see. It hovers over the rim and, on each scoop, reaches into the lip, scoops, lifts out and flicks the dirt onto the mound. Everyone starts with the teaspoon; the rest unlock with your own scoop count, kept in the browser (no account).

| Spoon | Unlock |
|---|---|
| Colher de chá (stainless) | free |
| Colher de sopa (brushed steel) | 100 scoops |
| Colher de pau | 500 |
| Colher de plástico | 1.000 |
| Prata da vó | 5.000 |
| Esmaltada | 10.000 |
| Colher torta | 25.000 |
| Colher dourada | online when a season reaches Japan |

Spoons are cosmetic only: every spoon digs the same amount, so there is nothing to farm. Material and wear tell them apart at small size: mirror steel, brushed steel, wood grain, matte plastic, tarnish, enamel speckle, a kink, gold.

## Layers

Eight layers, shown on the canvas as drill cores in a core box. Each milestone card shows that layer's core, and the cross-section is built from the same eight materials.

| Layer | Starts at | Line on the card |
|---|---|---|
| Quintal | 0 m | Terra preta e raiz. |
| Minhocas | 2 m | Terra, pedrinha, minhoca. |
| Argila | 150 m | Vermelha, gruda na colher. |
| Fósseis | 1 km | Calcário com concha. |
| Pré-Sal | 7 km | Sal em cima, pedra preta embaixo. |
| Lençol Freático | 10 km | Arenito molhado. |
| Manto | 35 km | Pedra verde. Quente. |
| Núcleo | 2.900 km | Ferro. Ainda não esfriou. |

After the Núcleo, the hole comes out in Japan (12.742 km): the season ends (board 8).

## Numbers

- **Distance:** Brazil to Japan through the middle, 12.742 km.
- **Meters per scoop grow with depth**, set per layer and calibrated to the canvas: 9.381.220 scoops reach 8.919,4 m (about 1 mm a scoop near the top), and 13.412.006 scoops reach Japan. The arrival board's "5 anos, 41 dias" is the season length the scale is tuned for; a balance test guards it at an assumed player count.
- **Server caps:** 15 scoops a second per connection, plus a per-IP cap.
- **Broadcast:** 5 to 10 times a second, one small message.
- **Client batch:** every 250 to 500 ms.

## Stack and conventions

Shared with the other two browser games; see `README.md`.

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | Your day-to-day stack; readable to recruiters |
| Build | Vite | Fast, zero-config static output |
| Rendering | three.js for the hole, cross-section and globe, as the canvas's art direction says (instanced grass, displaced ground, PBR steel with a sky reflection); DOM for the HUD and panels | Matches the mockups; phones get fewer grass blades and no depth of field |
| Tests | Vitest for logic, Playwright for one end-to-end smoke test | Same habit as the Godot repo: logic separate from drawing, and tested |
| CI | GitHub Actions: lint, test, build, deploy on push | Shows the pipeline, not only the game |
| Hosting | Any static host; the shared hole also needs a small real-time backend | No store, no review queue |
| Repo | Public, MIT, with a README that explains the architecture and the interesting problem | The README is what a recruiter reads |
| Session | 2 to 5 minutes, works on a phone, no login | It is opened from a link |
| Sharing | A result you can paste (text or image) | That is how these spread |
| Text | English by default, PT-BR toggle (the PT/EN switch on the canvas); the choice is remembered | The audience includes recruiters abroad |
| Money | None. No ads, no accounts, no personal data stored | Keeps it simple and outside any compliance work |

One scaffold (Vite + TS + tests + CI + deploy) is built once and reused for the other two.

## What already exists

A quick search on 18 Nov 2026, not exhaustive.

Shared-counter clickers are a known small genre: *Global Clicker*, *Everybody Clicks*, *Pet the Pixel* (a global counter with a pixel that reacts), and a Sisyphus game where the boulder slides back when everyone stops. Closest to yours: *One Giant Hole*, a multiplayer voxel-mining game where players dig one hole together. I did not find one aimed at digging through the planet with a spoon.

Sources:
- https://dummanstudio.itch.io/global-clicker
- https://eloi546.itch.io/everybody-clicks
- https://dev.to/milkyicedtea/i-built-a-multiplayer-browser-game-where-everyone-pets-the-same-pixel-10e2
- https://trollingron.itch.io/dont-drop-the-ball
- https://gamescrobbler.com/de/games/one-giant-hole
