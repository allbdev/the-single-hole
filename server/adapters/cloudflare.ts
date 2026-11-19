/**
 * Cloudflare adapter: one Worker serves the static client and routes `/ws` to one Durable Object
 * that holds the room. Uses the WebSocket Hibernation API, so an idle room costs nothing while
 * sockets stay open. Rules live in `server/room.ts`, never here.
 */
import { DurableObject } from "cloudflare:workers";
import { encode, normalizeCountry } from "../../shared/protocol";
import { ALL, Room, type ConnectionInfo, type Output } from "../room";
import { chooseSnapshot } from "../snapshot";

export interface Env {
  ROOM: DurableObjectNamespace<RoomObject>;
  ASSETS: Fetcher;
}

const SNAPSHOT_EVERY_MS = 5_000;
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws" || url.pathname === "/health") {
      return env.ROOM.get(env.ROOM.idFromName("global")).fetch(request);
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
    return out;
  },
} satisfies ExportedHandler<Env>;

interface Attachment extends ConnectionInfo {
  id: string;
}

export class RoomObject extends DurableObject<Env> {
  private room!: Room;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const [primary, backup] = await Promise.all([
        ctx.storage.get<string>("snapshot"),
        ctx.storage.get<string>("snapshot.bak"),
      ]);
      const picked = chooseSnapshot(primary ?? null, backup ?? null);
      if (picked.source === "corrupt") {
        // Never silently reset a live hole: refuse to run until someone looks.
        console.error("[room] snapshot and backup unreadable; refusing to start");
        throw new Error("corrupt snapshot");
      }
      if (picked.source === "backup") console.warn("[room] restored from backup snapshot");
      const now = Date.now();
      this.room = new Room(picked.snapshot, now);
      // Bring back sockets that stayed open while the object slept.
      for (const ws of ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment | null;
        if (a) this.room.resume(a.id, a, now);
      }
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        players: this.room.players,
        total: this.room.totalScoops,
        ...this.room.counters,
      });
    }
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("expected a websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const id = crypto.randomUUID().slice(0, 8);
    const cf = (request as Request & { cf?: { country?: string } }).cf;
    const info: Attachment = {
      id,
      ip: request.headers.get("CF-Connecting-IP") ?? "unknown",
      country: normalizeCountry(cf?.country),
      spoon: "teaspoon",
      claimed: 0,
      hello: false,
    };
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment(info);
    this.deliver(this.room.connect(id, { ip: info.ip, country: info.country }, Date.now()));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a) return ws.close(1011);
    const wasHello = this.room.connectionInfo(a.id)?.hello;
    this.deliver(this.room.message(a.id, typeof message === "string" ? message : null, Date.now()));
    const info = this.room.connectionInfo(a.id);
    if (info && (info.hello !== wasHello || info.spoon !== a.spoon))
      ws.serializeAttachment({ ...info, id: a.id });
    this.schedule();
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (a) this.room.disconnect(a.id);
    this.schedule();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  override async alarm(): Promise<void> {
    if (!this.room.needsSnapshot) return;
    const text = JSON.stringify(this.room.snapshot(Date.now()));
    const previous = await this.ctx.storage.get<string>("snapshot");
    await this.ctx.storage.put(previous ? { "snapshot.bak": previous, snapshot: text } : { snapshot: text });
    this.room.markSnapshotted();
  }

  /** Tick only while there is something to send; save soon after changes. Idle → hibernate. */
  private schedule(): void {
    if (this.room.needsSnapshot) {
      void this.ctx.storage.getAlarm().then((at) => {
        if (at === null) void this.ctx.storage.setAlarm(Date.now() + SNAPSHOT_EVERY_MS);
      });
    }
    if (this.timer !== null || this.room.idle) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.deliver(this.room.tick(Date.now()));
      this.schedule();
    }, 50);
  }

  private deliver(out: Output): void {
    for (const [target, msg] of out.send) {
      const text = encode(msg);
      const sockets = target === ALL ? this.ctx.getWebSockets() : this.ctx.getWebSockets(target);
      for (const ws of sockets) {
        try {
          ws.send(text);
        } catch {
          // Socket already closing.
        }
      }
    }
    for (const id of out.close) for (const ws of this.ctx.getWebSockets(id)) ws.close(1008, "closed by room");
  }
}
