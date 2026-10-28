import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import type { PlusFeature } from '@daily-rack/core';
import { ApiError, api, type PlusStatus } from './api.ts';
import { pushState, scheduleLocal } from './notifications';
import { buy, configurePurchases, localPlus, purchasesAvailable, restore, type LocalPlus, type PlusPlan } from './purchases';
import { useSession } from './session.tsx';
import { track } from './analytics.ts';

// Daily Rack Plus in the app: what the server says this player has, what the store says
// right after a purchase (so it feels instant), and the Plus screen for anything that needs it.

interface Plus {
  /** Has Plus (by the server, or by the store a moment before the server hears). */
  plus: boolean;
  status: PlusStatus | null;
  /** Free hands left today on the 2026 card. */
  freeHandsLeft: number | null;
  canBuy: boolean;
  /** Opens the Plus screen, saying which feature brought them there. */
  openPlus: (feature?: PlusFeature) => void;
  /** If this error means "needs Plus", opens the Plus screen and returns true. */
  handlePlusError: (error: unknown) => boolean;
  purchase: (plan: PlusPlan) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const PlusContext = createContext<Plus>({
  plus: false,
  status: null,
  freeHandsLeft: null,
  canBuy: false,
  openPlus: () => undefined,
  handlePlusError: () => false,
  purchase: async () => false,
  restorePurchases: async () => false,
  refresh: async () => undefined,
});

export function usePlus(): Plus {
  return useContext(PlusContext);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A heads-up two days before a free trial turns into a paid subscription. */
async function remindTrialEnd(expires: string | null) {
  if (!expires || (await pushState()) !== 'granted') return;
  const end = new Date(expires);
  const date = new Date(end.getTime() - 2 * 86_400_000);
  if (date.getTime() < Date.now() + 3_600_000) return;
  const day = end.toLocaleDateString(undefined, { weekday: 'long' });
  await scheduleLocal({
    id: 'dr-trial-end',
    date,
    title: 'Your Plus trial ends soon',
    body: `Your free week of Daily Rack Plus ends on ${day}. Keep it and do nothing, or cancel any time in your phone’s subscription settings. No hard feelings!`,
    url: '/plus',
  }).catch(() => undefined);
}

export function PlusProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, principalId, offline } = useSession();
  const [status, setStatus] = useState<PlusStatus | null>(null);
  const [local, setLocal] = useState<LocalPlus>({ active: false, expires: null, trial: false });
  const [configured, setConfigured] = useState(false);

  const refresh = useCallback(async () => {
    const next = await api.plusStatus().catch(() => null);
    if (next) setStatus(next);
  }, []);

  // After a purchase or restore: ask the server to check with the store, then wait for it.
  const settle = useCallback(async () => {
    for (let i = 0; i < 8; i++) {
      const next = (await api.plusSync().catch(() => null)) ?? (await api.plusStatus().catch(() => null));
      if (next) setStatus(next);
      if (next?.plus) return;
      await wait(1500);
    }
  }, []);

  useEffect(() => {
    if (!ready || !principalId || offline) return;
    void refresh();
    void configurePurchases(principalId)
      .then(async (ok) => {
        setConfigured(ok);
        if (!ok) return;
        const info = await localPlus().catch(() => null);
        if (info) setLocal(info);
      })
      .catch(() => undefined);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [ready, principalId, offline, refresh]);

  // The store says yes but the server hasn't heard yet: nudge it.
  useEffect(() => {
    if (local.active && status && !status.plus) void settle();
  }, [local.active, status?.plus]);

  const openPlus = useCallback((feature?: PlusFeature) => {
    track('plus_opened', { feature: feature ?? 'browse' });
    router.push({ pathname: '/plus', params: feature ? { feature } : {} });
  }, [router]);

  const handlePlusError = useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError) || error.code !== 'plus_required') return false;
      openPlus(typeof error.extra.feature === 'string' ? (error.extra.feature as PlusFeature) : undefined);
      return true;
    },
    [openPlus],
  );

  const purchase = useCallback(
    async (plan: PlusPlan) => {
      const result = await buy(plan);
      if (!result) return false;
      setLocal(result);
      track('plus_purchased', { plan: plan.kind, trial: result.trial });
      if (result.trial) void remindTrialEnd(result.expires);
      await settle();
      return result.active;
    },
    [settle],
  );

  const restorePurchases = useCallback(async () => {
    const result = await restore();
    setLocal(result);
    if (result.active) await settle();
    else await refresh();
    return result.active;
  }, [settle, refresh]);

  const value = useMemo<Plus>(
    () => ({
      plus: Boolean(status?.plus || local.active),
      status,
      freeHandsLeft: status?.plus || local.active ? null : (status?.freeHandsLeft ?? null),
      canBuy: purchasesAvailable && configured,
      openPlus,
      handlePlusError,
      purchase,
      restorePurchases,
      refresh,
    }),
    [status, local.active, configured, openPlus, handlePlusError, purchase, restorePurchases, refresh],
  );
  return <PlusContext.Provider value={value}>{children}</PlusContext.Provider>;
}
