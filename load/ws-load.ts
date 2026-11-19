/**
 * Load test for one room: ramps up WebSocket clients that dig like players and measures how late
 * the `state` broadcasts arrive. Runs anywhere Node runs; `k6-room.js` is the same test for k6.
 *
 *   npx tsx load/ws-load.ts --url=ws://localhost:8787/ws --clients=2000 --ramp=200 --hold=30
 *
 * Against the local Node room, start it with TRUST_PROXY=1 so each client gets its own fake IP
 * (otherwise the per-IP connection cap stops the test at 10 clients). Latency compares the server
 * clock in the message with this machine's clock, so run both on the same machine.
 */
import WebSocket from "ws";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "1"];
  }),
);
const URL_ = args.url ?? "ws://localhost:8787/ws";
const CLIENTS = Number(args.clients ?? 500);
const RAMP = Number(args.ramp ?? 100); // new clients per second
const HOLD = Number(args.hold ?? 20); // seconds at full load
const RATE = Number(args.rate ?? 3); // scoops per second per client
const BATCH_MS = 400;

const latencies: number[] = [];
let open = 0;
let failed = 0;
let closed = 0;
let received = 0;
let acked = 0;
let sentScoops = 0;
const sockets: WebSocket[] = [];

function connect(i: number): void {
  const ws = new WebSocket(URL_, {
    headers: { "x-forwarded-for": `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}` },
  });
  sockets.push(ws);
  let seq = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  ws.on("open", () => {
    open++;
    ws.send(JSON.stringify({ t: "hello", v: 1, spoon: "teaspoon", scoops: 0 }));
    timer = setInterval(() => {
      const n = Math.max(1, Math.round((RATE * BATCH_MS) / 1000));
      ws.send(JSON.stringify({ t: "dig", seq: seq++, n }));
      sentScoops += n;
    }, BATCH_MS + Math.random() * 50);
  });
  ws.on("message", (data) => {
    received++;
    const text = String(data);
    if (text.startsWith('{"t":"state"')) {
      const m = JSON.parse(text) as { now: number };
      latencies.push(Date.now() - m.now);
    } else if (text.startsWith('{"t":"ack"')) acked++;
  });
  ws.on("error", () => {
    failed++;
  });
  ws.on("close", () => {
    closed++;
    if (timer) clearInterval(timer);
  });
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

const started = Date.now();
let next = 0;
const ramp = setInterval(() => {
  const target = Math.min(CLIENTS, Math.floor(((Date.now() - started) / 1000) * RAMP));
  while (next < target) connect(next++);
  if (next >= CLIENTS) clearInterval(ramp);
}, 50);

const report = setInterval(() => {
  const window = latencies.splice(0).sort((a, b) => a - b);
  console.info(
    `t=${Math.round((Date.now() - started) / 1000)}s open=${open - closed} failed=${failed} ` +
      `msgs/s=${received} acks/s=${acked} state p50=${pct(window, 50)}ms p95=${pct(window, 95)}ms p99=${pct(window, 99)}ms`,
  );
  received = 0;
  acked = 0;
}, 1000);

const total = CLIENTS / RAMP + HOLD;
setTimeout(() => {
  clearInterval(report);
  console.info(`done: ${CLIENTS} clients requested, ${failed} errors, ${sentScoops} scoops sent`);
  for (const ws of sockets) ws.close();
  setTimeout(() => process.exit(0), 500);
}, total * 1000);
