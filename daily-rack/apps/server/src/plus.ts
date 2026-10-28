import { PLUS, PLUS_REASONS, isPremiumCard, type PlusFeature } from '@daily-rack/core';
import type { Db } from './db.ts';

// Daily Rack Plus on the server: who has it, kept up to date by RevenueCat's webhooks (and,
// with a secret key, by asking RevenueCat directly), plus the few rules the server enforces.
// The app only explains them; it can't unlock anything by itself.

export interface PlusConfig {
  /** Sent by RevenueCat with every webhook (set the same value in its dashboard). */
  webhookAuth?: string | null;
  /** RevenueCat secret API key (v1), to look a subscriber up after a webhook or a purchase. */
  secretKey?: string | null;
  /** Everyone gets Plus, e.g. before the stores are set up or for a beta. */
  forEveryone?: boolean;
}

export interface PlusStatus {
  plus: boolean;
  /** When it ends; null while it renews forever (lifetime or comp) or when there's none. */
  until: string | null;
  source: 'revenuecat' | 'admin' | 'everyone' | null;
  willRenew: boolean;
  /** Free hands left on premium cards in the last 24 hours (null with Plus). */
  freeHandsLeft: number | null;
}

export class PlusError extends Error {
  readonly status = 402;
  readonly code = 'plus_required';
  constructor(readonly feature: PlusFeature) {
    super(PLUS_REASONS[feature]);
  }
}

interface Row {
  principal_id: string;
  until: string | null;
  source: 'revenuecat' | 'admin';
  will_renew: number;
}

type Fetch = typeof fetch;

export class PlusService {
  constructor(
    private db: Db,
    private config: PlusConfig,
    private now: () => Date = () => new Date(),
    private fetcher: Fetch = fetch,
  ) {}

  private row(principalId: string): Row | undefined {
    return this.db.prepare('SELECT principal_id, until, source, will_renew FROM plus_members WHERE principal_id = ?').get(principalId) as Row | undefined;
  }

  isPlus(principalId: string): boolean {
    if (this.config.forEveryone) return true;
    const row = this.row(principalId);
    return Boolean(row && (row.until === null || new Date(row.until).getTime() > this.now().getTime()));
  }

  /** Hands dealt in the last 24 hours on premium cards at tables this player hosts. */
  freeHandsUsed(principalId: string): number {
    if (PLUS.premiumCards.length === 0) return 0;
    const since = new Date(this.now().getTime() - 24 * 3_600_000).toISOString();
    const marks = PLUS.premiumCards.map(() => '?').join(', ');
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM games g JOIN tables t ON t.id = g.table_id WHERE t.host_id = ? AND t.card_id IN (${marks}) AND g.created_at >= ?`)
      .get(principalId, ...PLUS.premiumCards, since) as { n: number };
    return Number(row.n);
  }

  status(principalId: string): PlusStatus {
    if (this.config.forEveryone) return { plus: true, until: null, source: 'everyone', willRenew: true, freeHandsLeft: null };
    const row = this.row(principalId);
    const plus = this.isPlus(principalId);
    return {
      plus,
      until: row?.until ?? null,
      source: row ? row.source : null,
      willRenew: Boolean(row?.will_renew),
      freeHandsLeft: plus ? null : Math.max(0, PLUS.freeCardHandsPerDay - this.freeHandsUsed(principalId)),
    };
  }

  /**
   * Throws PlusError if this hand can't be dealt: premium cards need the host to have Plus,
   * except for a few hands a day against computer players only.
   */
  assertCanDeal(hostId: string, cardId: string, vsComputer: boolean): void {
    if (!isPremiumCard(cardId) || this.isPlus(hostId)) return;
    if (!vsComputer) throw new PlusError('host-premium-card');
    if (this.freeHandsUsed(hostId) >= PLUS.freeCardHandsPerDay) throw new PlusError('premium-card');
  }

  assertRanked(principalId: string): void {
    if (!this.isPlus(principalId)) throw new PlusError('ranked');
  }

  /** Gives (or with days = 0, takes away) Plus by hand: testers, support, comps. Null days means forever. */
  grant(principalId: string, days: number | null): PlusStatus {
    if (days === 0) {
      this.db.prepare('DELETE FROM plus_members WHERE principal_id = ?').run(principalId);
    } else {
      const until = days === null ? null : new Date(this.now().getTime() + days * 86_400_000).toISOString();
      this.save(principalId, until, 'admin', days === null, null);
    }
    return this.status(principalId);
  }

  private save(principalId: string, until: string | null, source: 'revenuecat' | 'admin', willRenew: boolean, productId: string | null) {
    if (!this.principalExists(principalId)) return;
    this.db
      .prepare(
        `INSERT INTO plus_members (principal_id, until, source, will_renew, product_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(principal_id) DO UPDATE SET until = excluded.until, source = excluded.source, will_renew = excluded.will_renew, product_id = excluded.product_id, updated_at = excluded.updated_at`,
      )
      .run(principalId, until, source, willRenew ? 1 : 0, productId, this.now().toISOString());
  }

  private principalExists(id: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM principals WHERE id = ?').get(id));
  }

  /** Asks RevenueCat for a subscriber's Plus entitlement. False if there's no secret key. */
  async sync(principalId: string): Promise<boolean> {
    if (!this.config.secretKey) return false;
    const res = await this.fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(principalId)}`, {
      headers: { authorization: `Bearer ${this.config.secretKey}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`RevenueCat answered HTTP ${res.status}`);
    const json = (await res.json()) as {
      subscriber?: {
        entitlements?: Record<string, { expires_date: string | null; grace_period_expires_date?: string | null; product_identifier?: string }>;
        subscriptions?: Record<string, { unsubscribe_detected_at?: string | null; billing_issues_detected_at?: string | null }>;
      };
    };
    const entitlement = json.subscriber?.entitlements?.[PLUS.entitlement];
    const existing = this.row(principalId);
    if (!entitlement) {
      // Never purchased (or refunded away); leave a hand-given Plus alone.
      if (existing?.source === 'revenuecat') this.db.prepare('DELETE FROM plus_members WHERE principal_id = ?').run(principalId);
      return true;
    }
    const until = latest(entitlement.expires_date, entitlement.grace_period_expires_date ?? null);
    const product = entitlement.product_identifier ?? null;
    const subscription = product ? json.subscriber?.subscriptions?.[product] : undefined;
    if (existing?.source === 'admin' && (existing.until === null || (until !== null && existing.until > until))) return true;
    this.save(principalId, until, 'revenuecat', until !== null && !subscription?.unsubscribe_detected_at, product);
    return true;
  }

  /** Handles one RevenueCat webhook event. Returns false for a duplicate. */
  async handleEvent(event: RevenueCatEvent): Promise<boolean> {
    if (!event?.id || event.type === 'TEST') return true;
    if (this.db.prepare('SELECT 1 FROM revenuecat_events WHERE id = ?').get(event.id)) return false;
    await this.apply(event);
    // Recorded only once handled, so a failure (RevenueCat unreachable) is retried.
    this.db.prepare('INSERT OR IGNORE INTO revenuecat_events (id, type, received_at) VALUES (?, ?, ?)').run(event.id, event.type, this.now().toISOString());
    return true;
  }

  private async apply(event: RevenueCatEvent): Promise<void> {
    if (event.type === 'TRANSFER') {
      // The purchase moved to another guest (restored on a new phone): move Plus with it.
      for (const from of event.transferred_from ?? []) {
        const row = this.row(from);
        if (row?.source !== 'revenuecat') continue;
        for (const to of event.transferred_to ?? []) this.save(to, row.until, 'revenuecat', Boolean(row.will_renew), null);
        this.db.prepare('DELETE FROM plus_members WHERE principal_id = ?').run(from);
      }
      if (this.config.secretKey) for (const to of event.transferred_to ?? []) await this.sync(to).catch(() => undefined);
      return;
    }
    const ids = [...new Set([event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].filter((x): x is string => typeof x === 'string'))];
    const principalId = ids.find((id) => this.principalExists(id));
    if (!principalId) return;
    // RevenueCat recommends treating a webhook as a nudge and asking for the subscriber.
    if (this.config.secretKey) {
      await this.sync(principalId);
      return;
    }
    if (!(event.entitlement_ids ?? []).includes(PLUS.entitlement)) return;
    const expires = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
    const grace = event.grace_period_expiration_at_ms ? new Date(event.grace_period_expiration_at_ms).toISOString() : null;
    if (event.type === 'EXPIRATION') {
      this.save(principalId, expires ?? this.now().toISOString(), 'revenuecat', false, event.product_id ?? null);
    } else {
      this.save(principalId, latest(expires, grace), 'revenuecat', event.type !== 'CANCELLATION', event.product_id ?? null);
    }
  }
}

export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  entitlement_ids?: string[] | null;
  product_id?: string | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

/** When access ends: the expiry, stretched by any billing grace period. A null expiry never ends. */
function latest(expires: string | null, grace: string | null): string | null {
  if (expires === null) return null;
  if (grace === null) return expires;
  return expires > grace ? expires : grace;
}
