import { isBlockedEitherWay } from './blocks.ts';
import type { Db } from './db.ts';
import type { Notifier } from './push.ts';
import type { Hub } from './realtime.ts';
import { ratingOf } from './stats.ts';
import type { TableService } from './tables.ts';

// Public matchmaking: people waiting for a live game with strangers, casual or ranked.
// A table forms as soon as four people who can play together are waiting. If the longest
// wait passes the fill time, whoever is there plays with computer players in the empty
// seats, so nobody waits forever while the app is small. Ranked groups prefer close
// ratings, widening the range the longer someone waits. Blocked pairs are never matched.

export type QueueMode = 'casual' | 'ranked';

/** At matched tables strangers talk only in these phrases. */
export const QUICK_PHRASES = ['Hello!', 'Good luck!', 'Nice hand!', 'Well played!', 'Good game!', 'Thanks!', 'Oops!', 'Sorry, one moment'];

export interface MatchmakerOptions {
  /** How long the first person in line waits before computer players fill the table. */
  fillAfterMs: Record<QueueMode, number>;
  tickMs: number;
  /** Tells people who stepped away that their game is ready. */
  notifier?: Notifier;
}

interface Waiting {
  principalId: string;
  mode: QueueMode;
  since: number;
  rating: number;
}

/** Someone who loses their connection while waiting this long is taken out of line. */
const OFFLINE_GRACE_MS = 45_000;

export class Matchmaker {
  private waiting = new Map<string, Waiting>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Db,
    private hub: Hub,
    private tables: TableService,
    private options: MatchmakerOptions,
  ) {}

  join(principalId: string, mode: QueueMode) {
    const existing = this.waiting.get(principalId);
    if (!existing || existing.mode !== mode) {
      this.waiting.set(principalId, { principalId, mode, since: Date.now(), rating: ratingOf(this.db, principalId).rating });
    }
    this.match();
    if (this.waiting.size > 0 && !this.timer) this.timer = setInterval(() => this.match(), this.options.tickMs);
    return this.status(principalId);
  }

  leave(principalId: string): void {
    this.waiting.delete(principalId);
  }

  status(principalId: string): { mode: QueueMode; since: string; waiting: number; fillAt: string } | null {
    const w = this.waiting.get(principalId);
    if (!w) return null;
    const first = Math.min(...[...this.waiting.values()].filter((x) => x.mode === w.mode).map((x) => x.since));
    return {
      mode: w.mode,
      since: new Date(w.since).toISOString(),
      waiting: [...this.waiting.values()].filter((x) => x.mode === w.mode).length,
      fillAt: new Date(first + this.options.fillAfterMs[w.mode]).toISOString(),
    };
  }

  match(): void {
    const now = Date.now();
    for (const w of [...this.waiting.values()]) {
      if (!this.hub.isOnline(w.principalId) && now - w.since > OFFLINE_GRACE_MS) this.waiting.delete(w.principalId);
    }
    for (const mode of ['ranked', 'casual'] as const) {
      let queue = [...this.waiting.values()].filter((w) => w.mode === mode).sort((a, b) => a.since - b.since);
      while (queue.length > 0) {
        const first = queue[0]!;
        const waited = now - first.since;
        const range = mode === 'ranked' ? 150 + (waited / 1000) * 10 : Infinity;
        const group = [first];
        for (const w of queue.slice(1)) {
          if (group.length === 4) break;
          if (Math.abs(w.rating - first.rating) > range) continue;
          if (group.some((g) => isBlockedEitherWay(this.db, g.principalId, w.principalId))) continue;
          group.push(w);
        }
        if (group.length < 4 && waited < this.options.fillAfterMs[mode]) break;
        for (const g of group) this.waiting.delete(g.principalId);
        queue = queue.filter((w) => !group.includes(w));
        const tableId = this.tables.createPublic(
          group.map((g) => g.principalId),
          mode === 'ranked',
        );
        for (const g of group) this.hub.send(g.principalId, { type: 'match', tableId, mode });
        this.options.notifier?.notify(
          group.map((g) => g.principalId),
          { category: 'turns', title: 'Your game is ready', body: `We found your ${mode === 'ranked' ? 'ranked game' : 'quick match'}. Hurry back before a computer plays your turn.`, url: `/table/${tableId}` },
        );
      }
    }
    if (this.waiting.size === 0) this.stop();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
