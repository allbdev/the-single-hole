# Launch posts

Ready to paste once the game is live (roadmap 57). Replace `[YOUR-DOMAIN]` with the real link. Clips: `marketing/clip-en.mp4` and `clip-pt-BR.mp4` (landscape, ~27 s), `clip-*-vertical.mp4` (9:16, for Reels / Shorts / TikTok). Regenerate them with `npx tsx tools/marketing/clip.ts --lang=en` (or `pt-BR`).

Numbers quoted here come from `load/README.md`; update them after the deployed load test.

---

## English

### Short (X / Bluesky / Threads)

> Everyone on the internet is digging the same hole. From Brazil to Japan. With a spoon.
>
> One shared depth, live. Every player is a spoon around the rim.
>
> No sign-up, free, open source: [YOUR-DOMAIN]

### LinkedIn / portfolio

> I built a small multiplayer browser game to explore a classic real-time problem: thousands of clients adding to one shared number.
>
> **Um Buraco Só** ("one hole"): everyone on the internet digs the same hole from Brazil to Japan, with a spoon. You click, your scoop shows up instantly, and the world's depth moves for everyone.
>
> Under the hood:
> • one authoritative room as pure TypeScript logic, with the hosting (a Cloudflare Durable Object, or Node) as a thin adapter
> • optimistic updates that reconcile with the server and never jump backwards
> • per-connection and per-IP rate limits, input validation, abuse tests
> • snapshots that survive restarts and refuse to silently reset the hole
> • a load test: one room held 6,000 players at 34 ms p95 broadcast latency
>
> Play: [YOUR-DOMAIN] · Code and write-up: https://github.com/allbdev/the-single-hole

### Show HN

> **Show HN: Everyone digs the same hole, live, with a spoon**
>
> A tiny multiplayer browser game: one shared counter (the depth of a hole from Brazil to Japan), live, with three.js visuals. The interesting part is the counter: optimistic client updates reconciled against one authoritative room, token-bucket rate limits mirrored on the client, hibernating WebSockets on a Durable Object, and a load test with numbers. Write-up in the README. No accounts, no tracking, countries only.
>
> [YOUR-DOMAIN] · https://github.com/allbdev/the-single-hole

### Reddit (r/WebGames, r/incremental_games)

> **Title:** Everyone on the internet digs the same hole, from Brazil to Japan, with a spoon
>
> Free, no sign-up, works on phones. Every player is a spoon planted around the hole, tagged with their country. When the world reaches a new layer, everyone gets the milestone together. When it reaches Japan, the season ends and a new hole starts. [YOUR-DOMAIN]

---

## Português (PT-BR)

### Curto (X / Bluesky / Threads / Instagram)

> A internet inteira cavando o mesmo buraco. Do Brasil ao Japão. Com colher.
>
> Uma profundidade só, ao vivo. Cada jogador é uma colher na beira do buraco.
>
> Sem cadastro, grátis, código aberto: [YOUR-DOMAIN]

### LinkedIn

> Fiz um joguinho multiplayer de navegador pra estudar um problema clássico de tempo real: milhares de clientes somando no mesmo número.
>
> **Um Buraco Só**: a internet inteira cavando o mesmo buraco do Brasil ao Japão, com colher. Você clica, sua colherada aparece na hora, e a profundidade do mundo anda pra todo mundo.
>
> Por baixo:
> • uma sala autoritativa em TypeScript puro, com a hospedagem (Durable Object da Cloudflare, ou Node) como adaptador fino
> • atualização otimista que reconcilia com o servidor e nunca volta pra trás
> • limite por conexão e por IP, validação de entrada, testes de abuso
> • snapshots que sobrevivem a reinício e se recusam a zerar o buraco em silêncio
> • teste de carga: uma sala aguentou 6.000 jogadores com 34 ms de latência (p95)
>
> Jogar: [YOUR-DOMAIN] · Código e explicação: https://github.com/allbdev/the-single-hole

### Legenda do vídeo vertical

> 9 milhões de colheradas e a gente ainda tá no Pré-Sal. Falta você. 🥄 [YOUR-DOMAIN]
