/**
 * Dev only: fake players for screenshots and local testing. Each bot connects, says hello with a
 * spoon, and digs now and then. Needs the room started with ROOM_DEV_QUERY_COUNTRY=1.
 *
 *   npx tsx tools/bots.ts --count=12 --url=ws://localhost:8787/ws
 */
import WebSocket from "ws";
import { SPOON_IDS } from "../shared/data/spoons";
import { PROTOCOL_VERSION } from "../shared/protocol";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "1"];
  }),
);
const COUNT = Number(args.count ?? 10);
const URL_BASE = args.url ?? "ws://localhost:8787/ws";
const RATE = Number(args.rate ?? 3); // scoops a second per bot, roughly
const COUNTRIES = (args.countries ?? "BR,BR,BR,PT,JP,AR,US,CL,MX,BR,JP,PT,FR,DE,CO,BR").split(",");

for (let i = 0; i < COUNT; i++) {
  const country = COUNTRIES[i % COUNTRIES.length]!;
  const ws = new WebSocket(`${URL_BASE}?country=${country}`, {
    headers: { "x-forwarded-for": `10.0.0.${i}` },
  });
  let seq = 0;
  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        t: "hello",
        v: PROTOCOL_VERSION,
        spoon: SPOON_IDS[(i * 3) % (SPOON_IDS.length - 1)],
        scoops: Math.floor(Math.random() * 4000),
      }),
    );
    const tick = () => {
      if (ws.readyState !== ws.OPEN) return;
      const n = Math.max(1, Math.round(RATE * 0.4 * (0.5 + Math.random())));
      if (Math.random() < 0.7) ws.send(JSON.stringify({ t: "dig", seq: seq++, n }));
      setTimeout(tick, 400 + Math.random() * 1600);
    };
    setTimeout(tick, Math.random() * 2000);
  });
  ws.on("error", () => undefined);
}
console.info(`${COUNT} bots digging at ${URL_BASE}`);
