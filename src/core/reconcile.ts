/**
 * Optimistic display of the world's scoop count. Shows your own scoops at once, eases toward the
 * server's number, and never goes backwards (except when a new season starts).
 */
export class Reconciler {
  private server = 0;
  private shown = 0;
  private season = 0;

  constructor(private readonly easeMs = 180) {}

  /** First state, or a new season: jump straight to the number. */
  reset(total: number, season: number): void {
    this.server = total;
    this.shown = total;
    this.season = season;
  }

  /** A server total arrived. Returns true when it started a new season (display reset). */
  setServer(total: number, season: number = this.season): boolean {
    if (season !== this.season) {
      this.reset(total, season);
      return true;
    }
    this.server = Math.max(this.server, total);
    return false;
  }

  target(pending: number): number {
    return this.server + Math.max(0, pending);
  }

  /** Advance the display by `dtMs` frames; returns the value to show. */
  step(dtMs: number, pending: number): number {
    const target = this.target(pending);
    if (target > this.shown) {
      const k = 1 - Math.exp(-Math.max(0, dtMs) / this.easeMs);
      const next = this.shown + (target - this.shown) * k;
      this.shown = target - next < 0.5 ? target : next;
    }
    return this.shown;
  }

  get displayed(): number {
    return this.shown;
  }

  get serverTotal(): number {
    return this.server;
  }

  get seasonNumber(): number {
    return this.season;
  }
}
