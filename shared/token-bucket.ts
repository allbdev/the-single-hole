/** Token bucket with time passed in, so tests control the clock. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    now: number,
  ) {
    this.tokens = burst;
    this.last = now;
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSecond);
    this.last = Math.max(this.last, now);
  }

  /** Whole tokens available right now. */
  available(now: number): number {
    this.refill(now);
    return Math.floor(this.tokens);
  }

  /** Take up to `n` whole tokens; returns how many were taken. */
  take(n: number, now: number): number {
    this.refill(now);
    const taken = Math.max(0, Math.min(Math.floor(n), Math.floor(this.tokens)));
    this.tokens -= taken;
    return taken;
  }
}
