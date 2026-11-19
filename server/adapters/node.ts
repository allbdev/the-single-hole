/**
 * Node adapter: runs the room with `ws` for local development (and on a small VM if ever needed).
 * The production adapter is `cloudflare.ts`. Rules live in `server/room.ts`, never here.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { dirname } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { encode, normalizeCountry } from "../../shared/protocol";
import { ALL, Room, type Output } from "../room";
import { chooseSnapshot } from "../snapshot";

const PORT = Number(process.env.ROOM_PORT ?? 8787);
const SNAPSHOT_PATH = process.env.ROOM_SNAPSHOT ?? ".room/snapshot.json";
const SNAPSHOT_EVERY_MS = 5_000;
/** Only trust proxy headers (country, client IP) when explicitly told we sit behind one. */
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
/** Lets local testing pretend to be another country: ROOM_FAKE_COUNTRY=JP. */
const FAKE_COUNTRY = process.env.ROOM_FAKE_COUNTRY;

function readText(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

function loadSnapshot() {
  const picked = chooseSnapshot(readText(SNAPSHOT_PATH), readText(`${SNAPSHOT_PATH}.bak`));
  if (picked.source === "corrupt") {
    if (process.env.ROOM_ALLOW_EMPTY !== "1") {
      console.error(
        `[room] snapshot at ${SNAPSHOT_PATH} and its backup are unreadable. Refusing to start with an ` +
          "empty hole. Fix or move the files, or set ROOM_ALLOW_EMPTY=1 to start from zero.",
      );
      process.exit(1);
    }
    console.warn("[room] snapshots unreadable; starting empty because ROOM_ALLOW_EMPTY=1");
  } else if (picked.source === "backup") {
    console.warn("[room] primary snapshot unreadable; restored from backup");
  }
  return picked.snapshot;
}

function saveSnapshot(room: Room): void {
  const now = Date.now();
  const text = JSON.stringify(room.snapshot(now));
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  if (existsSync(SNAPSHOT_PATH)) renameSync(SNAPSHOT_PATH, `${SNAPSHOT_PATH}.bak`);
  const tmp = `${SNAPSHOT_PATH}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, SNAPSHOT_PATH);
  room.markSnapshotted();
}

function clientIp(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const forwarded = req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (value) return value.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function country(req: IncomingMessage): string {
  if (FAKE_COUNTRY) return normalizeCountry(FAKE_COUNTRY);
  if (!TRUST_PROXY) return "XX";
  const h = req.headers["cf-ipcountry"];
  return normalizeCountry(Array.isArray(h) ? h[0] : h);
}

const room = new Room(loadSnapshot(), Date.now());
const sockets = new Map<string, WebSocket>();

function deliver(out: Output): void {
  for (const [target, msg] of out.send) {
    const text = encode(msg);
    if (target === ALL) {
      for (const ws of sockets.values()) if (ws.readyState === ws.OPEN) ws.send(text);
    } else {
      const ws = sockets.get(target);
      if (ws && ws.readyState === ws.OPEN) ws.send(text);
    }
  }
  for (const id of out.close) sockets.get(id)?.close(1008);
}

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, players: room.players, total: room.totalScoops, ...room.counters }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 1024 });
wss.on("connection", (ws, req) => {
  const id = randomUUID().slice(0, 8);
  sockets.set(id, ws);
  deliver(room.connect(id, { ip: clientIp(req), country: country(req) }, Date.now()));
  ws.on("message", (data, isBinary) => {
    if (isBinary) return deliver(room.message(id, null, Date.now()));
    deliver(room.message(id, data.toString(), Date.now()));
  });
  ws.on("close", () => {
    sockets.delete(id);
    room.disconnect(id);
  });
  ws.on("error", () => ws.close());
});

setInterval(() => deliver(room.tick(Date.now())), 50);
setInterval(() => {
  if (room.needsSnapshot) saveSnapshot(room);
}, SNAPSHOT_EVERY_MS);

function shutdown(): void {
  saveSnapshot(room);
  wss.close();
  http.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

http.listen(PORT, () => console.info(`[room] listening on ws://localhost:${PORT}/ws`));
