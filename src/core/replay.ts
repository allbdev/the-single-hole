import type { ActivityFrame, CountryCode } from "../../shared/protocol";

/** Below this many players online, the game offers the replay so the hole never looks empty. */
export const REPLAY_THRESHOLD = 5;

export interface GhostDig {
  /** Ms from the start of the replay. */
  at: number;
  country: CountryCode;
  scoops: number;
}

/**
 * Turn the last minute of per-second activity into a schedule of ghost digs, spread inside each
 * second, so the replay plays at real speed. At most `maxPerSecond` ghosts per second (grouped).
 */
export function replaySchedule(frames: ActivityFrame[], maxPerSecond = 6): GhostDig[] {
  if (frames.length === 0) return [];
  const start = frames[0]!.at;
  const out: GhostDig[] = [];
  for (const frame of frames) {
    const entries = Object.entries(frame.countries).filter(([, n]) => n > 0);
    const slots = Math.min(
      maxPerSecond,
      entries.reduce((n, [, v]) => n + v, 0),
    );
    if (slots === 0) continue;
    // Distribute slots across countries proportionally, at least one each while slots remain.
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    let index = 0;
    for (const [country, n] of sorted) {
      if (index >= slots) break;
      const share = Math.max(1, Math.round((n / frame.scoops) * slots));
      const per = n / share;
      for (let k = 0; k < share && index < slots; k++, index++) {
        out.push({
          at: frame.at - start + Math.floor((index / slots) * 1000),
          country,
          scoops: Math.round(per) || 1,
        });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function replayDuration(frames: ActivityFrame[]): number {
  if (frames.length === 0) return 0;
  return frames[frames.length - 1]!.at - frames[0]!.at + 1000;
}

/** Ghosts due between two replay times (ms), for the frame loop. */
export function ghostsBetween(schedule: GhostDig[], fromMs: number, toMs: number): GhostDig[] {
  return schedule.filter((g) => g.at >= fromMs && g.at < toMs);
}

export function shouldOfferReplay(players: number, frames: number): boolean {
  return players < REPLAY_THRESHOLD && frames > 0;
}
