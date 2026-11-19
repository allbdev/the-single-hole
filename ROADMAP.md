# Roadmap — Um Buraco Só

> Tasks **in order**. Work top to bottom; move to the next phase only when the current phase's exit criteria are met.
> **The two risky things get proven first:** that one shared number stays correct and live with many clients, and that the realistic hole runs on a mid-range phone. Nothing pretty gets built until both pass.
> Then **the whole game** (every screen on the canvas, spoons, countries, replay, seasons), then hardening and the load-test write-up, then launch. Everything in `GAME_PLAN.md` ships at launch.
> Source of truth: the design canvas and `GAME_PLAN.md`. Project rules in `CLAUDE.md`. Things only the developer can do in `TODO_FOR_YOU.md`.

**Language rule:** player-facing text is **English by default with a PT-BR toggle**, both always complete (`src/i18n/`). Code, comments and docs are in English. Quoted lines below are the PT-BR text from the canvas.

**Definition of done:** a task is `[x]` only when it's implemented **and covered by passing tests** (see `CLAUDE.md`), and the design canvas still matches.

**Push rule:** run the `security-audit` skill before every push (see `CLAUDE.md`).

**Targets (from `GAME_PLAN.md`):** 2 to 4 weekends in total. Estimates, not measurements.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 · Setup

1. [x] Backend platform: compare Cloudflare Durable Objects, PartyKit and Node `ws` on a small VM on current free tiers, WebSocket limits and price at scale; write the numbers and the choice in `CLAUDE.md` (you create the account: `TODO_FOR_YOU.md`)
2. [x] `git init`, `main` branch, origin `https://github.com/allbdev/the-single-hole.git`, `.gitignore`, `.gitattributes` (Git LFS for images, 3D assets, fonts)
3. [x] Scaffold: Vite + TypeScript strict, ESLint + Prettier, `src/` `server/` `shared/` `tests/` `e2e/` `load/` `tools/`; `npm run check` = typecheck + lint + Vitest; MIT `LICENSE`
4. [x] Vitest with a first test per side (client, server, shared); Playwright installed with an empty smoke test
5. [x] GitHub Actions: `check`, `e2e`, `build` on every push and PR
6. [x] Fonts: Archivo (wide, for titles and sentences) and IBM Plex Mono (numbers), self-hosted, OFL, full PT-BR accents
7. [x] Design tokens from the art direction board in one CSS file (`src/ui/tokens.css`)

**Exit:** repo is up, `npm run check` passes locally and in CI.

---

## Phase A · Spikes (kill tests)

> Two questions, answered with no art. If either answer is "no", stop and rethink before Phase B.

### A1 · The shared number
8. [x] `shared/protocol.ts`: versioned messages (`hello`, `dig` batch, `state` broadcast, `event` for the feed), encode/decode, validation, size limits
9. [x] `shared/depth.ts`: scoops → meters with a scale per layer calibrated to the canvas (9.381.220 scoops = 8.919,4 m; 13.412.006 = 12.742 km), meters → layer
10. [x] `server/room.ts` (pure): add batches, cap per connection, count players, emit a broadcast on a tick; time passed in
11. [x] Local adapter (Node `ws`) so the room runs with `npm run dev`
12. [x] `src/core/batcher.ts` and `src/core/reconcile.ts`: batch every 250–500 ms, optimistic total, ease toward the server, never go backwards
13. [x] A plain page: the depth, the player count, a button. Two tabs dig and both numbers agree
14. [x] A quick k6 run against the local room: how many connections before broadcasts lag past 1 s? Write the number in `load/README.md`

### A2 · The hole on a phone
15. [x] three.js gray-box hole: displaced ground mesh, a dark shaft, instanced grass, one steel spoon with a sky reflection
16. [x] Quality presets (phone: fewer blades, no depth of field, pixel ratio ≤ 2); picked by device, overridable with a URL flag for testing
17. [~] Measure on a mid-range phone and a laptop: fps, first paint, JS size (initial JS 174 KB gz, measured; frame rate on a real GPU and on a mid-range phone needs your hands, see TODO_FOR_YOU)

**Exit:** the number stays correct across tabs and reconnects, the local room survives a few hundred connections, and the hole holds 30 fps on a mid-range phone.

---

## Phase B · Systems

18. [x] `shared/data/layers.ts`: the eight layers with depths and a line in both languages; data tests
19. [x] `shared/data/spoons.ts`: the eight spoons with unlock thresholds; data tests
20. [x] i18n: `t()` helper, `en.ts` and `pt-BR.ts`, English by default, toggle remembered; test that both locales have every key
21. [x] `src/core/format.ts`: depths, counts, percentages and durations per locale (`8,919.4 m` / `8.919,4 m`, "5 anos, 41 dias")
22. [x] Your own scoop count and unlocked spoons in `localStorage` (survives reloads, tolerates a corrupt value); spoon picker
23. [x] Reconnect with backoff; scoops dug while offline are sent once on reconnect (capped)
24. [x] Persistence: snapshot every few seconds and on shutdown, restore on start, refuse to silently reset to zero
25. [x] Countries: country code from the platform's request headers, per-country scoop totals and player counts in the room; never cities, never stored with an IP
26. [x] Feed events from the server (a country joined with a spoon, "+1.000 m em 4 min", a country's 300 in a row, "Alguém achou um osso"), rendered from templates in both languages
27. [x] Activity log of the last minute (aggregated per tick, no identities) for the replay
28. [x] Layer timing: when the world entered each layer and how long it took
29. [x] Seasons in the room: arrival at 12.742 km closes the season, archives it (totals, duration, per-country, date) in the hall of fame, marks who was online for the golden spoon, starts a new hole at 0
30. [x] Balance test: at an assumed player count, a season lasts about "5 anos, 41 dias" and the canvas numbers hold

**Exit:** every system has tests and runs on the local room.

---

## Phase C · Screens (match each canvas board)

31. [x] Landing (board 1): the hole, world depth, live count, PT/EN, "Pegar uma colher", "Ver o corte", "sem cadastro · grátis · código aberto"
32. [x] Dig view (board 2): looking down the hole, other players' spoons planted around the rim with country tag and scoops, the tape measure, the feed, your scoops, "Clique no buraco ou aperte espaço para cavar", Compartilhar
33. [x] Juice: dirt puff per scoop, a small spoon motion, a soft sound after the first click (toggle in the corner), reduced motion respected
34. [x] Spoon models: the eight materials (mirror steel, brushed steel, wood, plastic, tarnished silver, enamel, bent, gold), readable at small size
35. [x] Cross-section (board 3): the cut block with the eight layer materials, "ESTAMOS AQUI", % of the way to Japan, when the current layer started
36. [x] World (board 4): the globe with dots per country, "Quem está cavando" per-country list, Brazil → Japan bar, ETA at this week's pace
37. [x] New layer reached (board 5): the milestone card with the layer's core, depth, how long it took, how much you dug, its line
38. [x] Share card (board 6): 1200 × 630 from numbers only; copy image, copy link, download PNG; text fallback when image copy isn't supported
39. [x] Quiet hours (board 7): lighting follows the real time of day (night lantern look), local time shown, "while you were away" with the meters dug since your last visit, the replay when few people are online
40. [x] Season end (board 8): the arrival in the Kyoto rock garden, season totals, your scoops, "Ver o mural" (hall of fame), "Cavar o próximo", the golden spoon for those online
41. [x] Mobile (Mobile page): the three views portrait, one thumb, tap to dig, share sheet
42. [x] Link to the Steam page
43. [x] Open Graph tags and a static preview image so a pasted link shows the hole
44. [x] Board renders from the game (`tools/designs/`): replace the canvas images with real screenshots, re-export `/designs`
45. [x] Playwright smoke: open, dig, depth goes up, switch tabs, share dialog opens

**Exit:** a friend opens the link on their phone, digs, sees others' spoons, reaches a milestone and a season end (on a test room) and shares the card without help.

---

## Phase D · Hardening and the write-up

46. [x] Per-IP caps alongside per-connection caps; connection cap per room; drop and count bad messages
47. [x] Abuse tests: oversized batches, floods, malformed JSON, many connections from one IP, replayed messages, a forged country
48. [~] Deploy the room to the chosen platform (adapter in `server/adapters/`), client to a static host; deploy from CI on push to `main` (adapter, wrangler config and CI deploy job are ready and verified with `wrangler dev`; the first deploy needs your Cloudflare account)
49. [~] Load test against the deployed room with k6: connections held, broadcast latency, where it breaks, what it costs; results in `load/` and the README (local Node room: 6,000 players at 34 ms p95, cap at 10,000; the deployed run needs the deploy)
50. [~] Monitoring: an uptime check and the room's own counters (players, scoops/s, dropped messages), no personal data (`/health` reports players, scoops and dropped/bad messages with no personal data; the uptime check needs an account)
51. [x] Performance budget in CI from `CLAUDE.md` (`npm run budget`: initial JS under 300 KB gz; a WebGL page's Lighthouse score is too noisy in CI, so run Lighthouse by hand before launch)
52. [x] README write-up: architecture, the interesting problems (reconciliation, rate limiting, persistence, seasons), load-test numbers, trade-offs
53. [x] Full security audit of the repo before it goes public

**Exit:** the deployed room survives the load test, and the README explains it.

---

## Phase E · Launch

54. [ ] Domain pointed at the static host; HTTPS; `[SEU DOMÍNIO]` on the share card replaced
55. [x] Posts: short clip of the hole and the share card, in English and PT-BR (`marketing/`) (posts in `marketing/posts/`, clips recorded from the game by `tools/marketing/clip.ts`)
56. [ ] Playtest with 5+ people at once on phones; fix what confuses them
57. [ ] Go public: repo, link, posts

**Exit:** it's live, and the repo is the portfolio piece.

---

## Out of scope (decided)

- Accounts, names, chat, anything players type: nothing to moderate.
- Ads, payments, personal data storage.
- Cities or any location finer than a country.
