# What I need from you

> Things only you can do (money, accounts, domains, people, hardware). Claude keeps this list current while working; newest items at the top of each section.
> Last updated: 19 Nov 2026. The whole game is built and runs locally on Node and on Cloudflare's local runtime. What's left needs you: an account to deploy to, a domain, a phone, and people.

## To go live (in this order)

- [ ] **Cloudflare account** (free plan is enough to start). Then, in GitHub → the repo → Settings → Secrets and variables → Actions, add:
  - `CLOUDFLARE_ACCOUNT_ID` (Cloudflare dashboard → Workers & Pages → right sidebar)
  - `CLOUDFLARE_API_TOKEN` (My Profile → API Tokens → "Edit Cloudflare Workers" template)

  The next push to `main` deploys automatically (`.github/workflows/ci.yml`, job `deploy`). Or deploy by hand once: `npx wrangler login` then `npm run deploy`. Tell me the `*.workers.dev` URL and I'll run the load test against it (roadmap 49).
- [ ] **Domain** (roadmap 54). Buy one, add it to Cloudflare, and point it at the Worker (Workers → the-single-hole → Settings → Domains & Routes). The share card prints whatever host the page is on, so nothing to change in code.
- [ ] **Uptime check** (roadmap 50): any free monitor (Cloudflare Health Checks, UptimeRobot, Better Stack) pinging `https://YOUR-DOMAIN/health` every few minutes.
- [ ] **Steam link.** Dig to Japan's Steam page URL, when it exists: it goes in `src/config.ts` (`steamUrl`), and the landing shows the link. Hidden until then.

## Worth knowing (no action unless you want a change)

- [ ] **A busy world finishes a season fast** (19 Nov 2026). The canvas numbers (13.412.006 scoops to Japan, "5 anos, 41 dias") mean the world averages ~0,085 scoops a second. If 1,000 people dig at once (3 scoops a second each), a whole season would take about **an hour**. I built it as the canvas says (`shared/data/layers.ts`, `tests/shared/balance.test.ts`). If you'd rather a season take weeks even with a crowd, the knob is the scoop counts per layer; say how long a season should last with how many players, and I'll rescale (and update the canvas numbers).
- [ ] **Hosting cost if it spreads**: on the paid Workers plan ($5/month), incoming WebSocket messages count as requests (20:1). Ten thousand people digging non-stop would be ~100 million billed requests a day. Batches only go out while someone digs, so real traffic is far lower; details in `load/README.md`.

## Hardware and playtesting

- [ ] **Frame rate on real hardware** (roadmap 17). My screenshots run in software rendering, so I couldn't measure fps. Open the game on a mid-range phone and on your laptop (`npm run dev`, then the Network URL from `npx vite --host`) and tell me if anything stutters. `?quality=low|medium|high` forces a preset.
- [ ] **Playtest** (roadmap 56): 5+ people digging at once on phones; tell me where they get confused.
