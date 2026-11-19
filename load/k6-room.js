// k6 load test for the deployed room (same idea as ws-load.ts).
//   k6 run -e URL=wss://YOUR-DOMAIN/ws -e VUS=1000 load/k6-room.js
// Only run it against your own deployment, never someone else's.
import ws from "k6/ws";
import { Trend, Counter } from "k6/metrics";

const latency = new Trend("state_latency_ms");
const errors = new Counter("ws_errors");
const URL = __ENV.URL || "ws://localhost:8787/ws";
const VUS = Number(__ENV.VUS || 200);

export const options = {
  scenarios: {
    diggers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: VUS },
        { duration: "2m", target: VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: { state_latency_ms: ["p(95)<1000"], ws_errors: ["count<10"] },
};

export default function () {
  ws.connect(URL, {}, (socket) => {
    let seq = 0;
    socket.on("open", () => {
      socket.send(JSON.stringify({ t: "hello", v: 1, spoon: "teaspoon", scoops: 0 }));
      socket.setInterval(() => socket.send(JSON.stringify({ t: "dig", seq: seq++, n: 1 })), 400);
    });
    socket.on("message", (data) => {
      if (data.startsWith('{"t":"state"')) latency.add(Date.now() - JSON.parse(data).now);
    });
    socket.on("error", () => errors.add(1));
    socket.setTimeout(() => socket.close(), 60000 + Math.random() * 60000);
  });
}
