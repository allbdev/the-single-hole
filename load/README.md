# Load test

How many players one room holds, and where it breaks.

## Method

`load/ws-load.ts` ramps up WebSocket clients that behave like players: say hello, then send a dig batch every ~400 ms (about 3 scoops a second each). It measures how late each `state` broadcast arrives (the server's clock in the message against the client's clock, same machine). `load/k6-room.js` is the same test for [k6](https://k6.io), for the deployed room.

```sh
# local Node room (TRUST_PROXY=1 gives each fake client its own IP, so the per-IP cap doesn't stop the test)
ROOM_PORT=8795 TRUST_PROXY=1 ROOM_SNAPSHOT=/tmp/load.json node --import tsx server/adapters/node.ts
npx tsx load/ws-load.ts --url=ws://localhost:8795/ws --clients=6000 --ramp=500 --hold=15

# deployed room (only your own deployment)
k6 run -e URL=wss://YOUR-DOMAIN/ws -e VUS=1000 load/k6-room.js
```

## Results: Node adapter, local (19 Nov 2026)

Machine: Apple M3 Max laptop, Node 24, the room and the load generator on the same machine (so the generator competes for CPU; real numbers on a dedicated host are better, not worse).

| Clients | Errors | Messages in/s (dig batches) | Messages out/s | `state` latency p50 / p95 / p99 | Room CPU |
|---:|---:|---:|---:|---|---|
| 1,000 | 0 | ~2,400 | ~10,000 | 9 / 16 / 18 ms | low |
| 3,000 | 0 | ~7,100 | ~30,000 | 16 / 29 / 32 ms | — |
| 6,000 | 0 | ~14,000 | ~62,000 | 18 / 34 / 40 ms | — |
| 10,500 asked | 266 refused | ~24,000 | ~100,000 | 29 / 55 / 60 ms | ~85 % of one core |

**Where it breaks:** the room caps itself at 10,000 players (then `RoomOptions.maxConnections`, now `maxPlayers`); past that, new clients got `{"t":"error","code":"full"}` and were refused (234 refused plus 32 that failed during the burst). Since this run, they wait in a line instead (`{"t":"line","position":N}`) and get in as players leave; the line gets no broadcasts, so it doesn't add to the broadcast cost measured here. Only past `maxWaiting` (50,000) is anyone refused. At the cap, one Node process uses ~85 % of one core, so the CPU limit is not far beyond: about 12,000 players digging continuously is the ceiling for one room on this machine. Broadcast latency stays well under the 1 s target the whole way.

**What scales with players:** every `state` broadcast goes to every socket (6.7 a second), so outgoing messages grow with players × broadcast rate. Incoming messages grow with players × batch rate. Both are the knobs if a room gets hot: a longer `BATCH_INTERVAL_MS` and a slower `stateMs`.

## Cloudflare Durable Object

Not measured yet: it needs the deployed room (see `TODO_FOR_YOU.md`). A Durable Object is single-threaded like the Node process, so expect the same shape. Cost on the paid Workers plan: incoming WebSocket messages are billed as requests at 20:1, so 10,000 players digging non-stop (~24,000 batches a second) would be ~1,200 billed requests a second, about 100 million a day. Players idle most of the time and batches are only sent while someone digs, so real traffic is far lower, but that is the number to watch.
