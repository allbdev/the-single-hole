# Designs

Copies of the boards on the design canvas "Um Buraco Só — Mockups" (https://claude.ai/artifact/EYzagD2x24kd3Ay4Thg2gf). Reference only, not shipped.

Every image is rendered from the game itself, so the mockups match the game: the screens are real in-game screenshots (PT-BR, a room seeded at the canvas depth with bots), the spoons and core samples are the game's own models. To regenerate after a change that affects what a board shows:

```sh
npx tsx tools/designs/render-boards.ts --out=/tmp/boards   # starts its own room, Vite and bots
cp /tmp/boards/designs/*.jpg designs/                       # these exports
cp /tmp/boards/og.jpg public/og.jpg                         # the link preview
```

Then upload `/tmp/boards/screens/*` (or the JPGs) to the canvas and point its boards at the new images (see `CLAUDE.md`).

| File | Canvas board | Page |
|---|---|---|
| `01-Main.jpg` | 1 · Landing | Screens |
| `02-Dig.jpg` | 2 · Dig view | Screens |
| `03-Section.jpg` | 3 · Cross-section | Screens |
| `04-World.jpg` | 4 · World | Screens |
| `05-Milestone.jpg` | 5 · New layer reached | Screens |
| `06-Share.jpg` | 6 · Share card | Screens |
| `07-Quiet.jpg` | 7 · Quiet hours (4 am) | Screens |
| `08-Arrival.jpg` | 8 · Season end: Japan | Screens |
| `09-Mobile.jpg` | Phone layouts | Mobile |
| `10-Spoons.jpg` | Spoons: the players | Spoons |
| `11-Layers.jpg` | Layers as core samples | Layers |
| `12-Direction.jpg` | Art direction (a text board, exported from the canvas) | Art direction |
