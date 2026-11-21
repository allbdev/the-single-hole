# What I need from you

> Things only you can do (money, accounts, domains, people, hardware). Claude keeps this list current while working; newest items at the top of each section.
> Last updated: 20 Nov 2026. The game is live at https://the-single-hole.vinicius-albuquerque.com.br (also at the old https://the-single-hole.alb-develloper.workers.dev; Cloudflare Workers Free plan; every push to `main` deploys after the tests pass). What's left needs you: an uptime check, a phone, and people.

## To go live (in this order)

- [ ] **Load test against the live room** (roadmap 49): your call. A real k6 run uses up the Free plan's 100,000 daily Durable Object requests in minutes, so the game would refuse players until 00:00 UTC. Either run it right after a UTC midnight when nobody plays, or after moving to the $5 plan. Say when, and I'll run it and write up the numbers.
- [x] **Cloudflare account** (20 Nov 2026): created, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` saved as GitHub Actions secrets (token from the "Edit Cloudflare Workers" template, no expiration: revoke it in My Profile → API Tokens if it ever leaks). First deploy succeeded.
- [x] **Domain** (20 Nov 2026): `the-single-hole.vinicius-albuquerque.com.br`, a subdomain of your portfolio's domain. The domain's DNS moved from Vercel to Cloudflare (nameservers changed at registro.br); the portfolio's records (`@` and `www`, CNAMEs to Vercel) are **DNS only** on purpose so Vercel keeps serving it and renewing its certificate. Edit your portfolio's DNS in Cloudflare from now on, not Vercel. The game's subdomain is a Worker custom domain in `wrangler.jsonc`.
- [ ] **Uptime check** (roadmap 50): any free monitor (Cloudflare Health Checks, UptimeRobot, Better Stack) pinging `https://the-single-hole.vinicius-albuquerque.com.br/health` every few minutes.
- [ ] **Steam link.** Dig to Japan's Steam page URL, when it exists: it goes in `src/config.ts` (`steamUrl`), and the landing shows the link. Hidden until then.

## Worth knowing (no action unless you want a change)

- [x] **A busy world finishes a season fast** (19 Nov 2026). The canvas numbers (13.412.006 scoops to Japan, "5 anos, 41 dias") mean the world averages ~0,085 scoops a second. If 1,000 people dig at once (3 scoops a second each), a whole season would take about **an hour**. I built it as the canvas says (`shared/data/layers.ts`, `tests/shared/balance.test.ts`). If you'd rather a season take weeks even with a crowd, the knob is the scoop counts per layer; say how long a season should last with how many players, and I'll rescale (and update the canvas numbers).
- [x] **Hosting cost if it spreads**: on the paid Workers plan ($5/month), incoming WebSocket messages count as requests (20:1). Ten thousand people digging non-stop would be ~100 million billed requests a day. Batches only go out while someone digs, so real traffic is far lower; details in `load/README.md`.

## Hardware and playtesting

- [x] **Frame rate on real hardware** (roadmap 17). My screenshots run in software rendering, so I couldn't measure fps. Open the game on a mid-range phone and on your laptop (`npm run dev`, then the Network URL from `npx vite --host`) and tell me if anything stutters. `?quality=low|medium|high` forces a preset.
- [x] **Playtest** (roadmap 56): 5+ people digging at once on phones; tell me where they get confused.
