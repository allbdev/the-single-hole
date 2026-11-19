import { encode, parseServerMessage, type ClientMessage, type ServerMessage } from "../../shared/protocol";

/** The part of WebSocket the connection uses, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type ConnectionStatus = "connecting" | "open" | "waiting";

export interface ConnectionHandlers {
  onOpen(): void;
  onMessage(msg: ServerMessage): void;
  onStatus(status: ConnectionStatus): void;
}

const OPEN = 1;

/** Backoff for reconnect attempt `n` (0-based): 1 s, 2 s, 4 s … 30 s, with ±20 % jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + 0.4 * random()));
}

/** A WebSocket that reconnects with backoff until stopped. */
export class Connection {
  private socket: SocketLike | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private stopped = false;
  /** Set when the server said not to come back (wrong version, room full). */
  private refused = false;

  constructor(
    private readonly url: string,
    private readonly handlers: ConnectionHandlers,
    private readonly makeSocket: (url: string) => SocketLike,
    private readonly timers: Timers = globalThis,
    private readonly random: () => number = Math.random,
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
  }

  get isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  /** Returns false when not connected (the caller keeps the data). */
  send(msg: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(encode(msg));
    return true;
  }

  private open(): void {
    if (this.stopped) return;
    this.handlers.onStatus("connecting");
    const socket = this.makeSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus("open");
      this.handlers.onOpen();
    };
    socket.onmessage = (ev) => {
      const msg = parseServerMessage(ev.data);
      if (!msg) return;
      if (msg.t === "error" && (msg.code === "version" || msg.code === "strikes")) this.refused = true;
      this.handlers.onMessage(msg);
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped || this.refused) return;
      this.handlers.onStatus("waiting");
      const delay = backoffMs(this.attempt++, this.random);
      this.timer = this.timers.setTimeout(() => {
        this.timer = null;
        this.open();
      }, delay);
    };
  }
}
