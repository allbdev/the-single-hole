import { LIMITS } from "../../shared/protocol";
import { TokenBucket } from "../../shared/token-bucket";

/** Scoops kept while offline, sent once the connection is back (paced like any other scoops). */
export const MAX_OFFLINE_SCOOPS = 300;

/**
 * Counts local scoops and sends them in batches. Mirrors the server's per-connection bucket so the
 * client never sends more than will be accepted: clicks above the cap still animate, but don't count.
 */
export class Batcher {
  private readonly countBucket: TokenBucket;
  private readonly sendBucket: TokenBucket;
  private unsent = 0;
  private seq = 0;
  private readonly inflight = new Map<number, number>();

  constructor(
    private readonly send: (seq: number, n: number) => boolean,
    now: number,
  ) {
    this.countBucket = new TokenBucket(LIMITS.scoopsPerSecond, LIMITS.scoopBurst, now);
    this.sendBucket = new TokenBucket(LIMITS.scoopsPerSecond, LIMITS.scoopBurst, now);
  }

  /** One click/tap/Space. Returns true when the scoop counts. */
  dig(now: number): boolean {
    if (this.unsent >= MAX_OFFLINE_SCOOPS) return false;
    if (this.countBucket.take(1, now) === 0) return false;
    this.unsent++;
    return true;
  }

  /** Send what the server will accept now. Call every `BATCH_INTERVAL_MS`. */
  flush(now: number): void {
    if (this.unsent === 0) return;
    const n = Math.min(this.unsent, LIMITS.maxBatch, this.sendBucket.available(now));
    if (n <= 0) return;
    const seq = this.seq;
    if (!this.send(seq, n)) return; // offline: keep them unsent
    this.sendBucket.take(n, now);
    this.seq++;
    this.unsent -= n;
    this.inflight.set(seq, n);
  }

  /** Server acknowledged a batch. Returns the accepted count (0 for an unknown seq). */
  ack(seq: number, accepted: number): number {
    const sent = this.inflight.get(seq);
    if (sent === undefined) return 0;
    this.inflight.delete(seq);
    return Math.max(0, Math.min(accepted, sent));
  }

  /**
   * The socket dropped. Unacknowledged batches may or may not have counted; drop them rather than
   * risk counting twice. Unsent scoops stay and go out after reconnecting.
   */
  disconnected(): void {
    this.inflight.clear();
  }

  /** Scoops not yet confirmed by the server (unsent plus in flight). */
  get pending(): number {
    let n = this.unsent;
    for (const v of this.inflight.values()) n += v;
    return n;
  }

  get unsentCount(): number {
    return this.unsent;
  }
}
