import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL, PACKAGE_TYPE, PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';
import { PLUS } from '@daily-rack/core';

// The store side of Daily Rack Plus, through RevenueCat. Development builds use RevenueCat's
// Test Store (purchases you can make without a real store account); release builds use the
// App Store or Google Play. The server decides what Plus unlocks; this only buys it.

export interface PlusPlan {
  id: string;
  kind: 'annual' | 'monthly';
  /** Localized price, e.g. "$39.99". */
  price: string;
  /** For the yearly plan, what it works out to a month. */
  perMonth: string | null;
  /** e.g. "7-day free trial", when the store offers one to this player. */
  trial: string | null;
  pkg: PurchasesPackage;
}

export interface LocalPlus {
  active: boolean;
  expires: string | null;
  trial: boolean;
}

export const purchasesAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

function apiKey(): string | null {
  const keys = (Constants.expoConfig?.extra as { revenuecat?: { ios?: string; android?: string; test?: string } } | undefined)?.revenuecat;
  if (!keys) return null;
  if (__DEV__ && keys.test) return keys.test;
  return (Platform.OS === 'ios' ? keys.ios : keys.android) ?? null;
}

let configuredFor: string | null = null;

/** Starts RevenueCat as this guest (so a purchase belongs to them), or switches guest. */
export async function configurePurchases(appUserId: string): Promise<boolean> {
  const key = apiKey();
  if (!purchasesAvailable || !key) return false;
  if (configuredFor === appUserId) return true;
  if (configuredFor === null) {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: key, appUserID: appUserId });
  } else {
    await Purchases.logIn(appUserId);
  }
  configuredFor = appUserId;
  return true;
}

function trialText(pkg: PurchasesPackage): string | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const unit = intro.periodUnit.toLowerCase().replace(/s$/, '');
  return `${intro.periodNumberOfUnits}-${unit} free trial`;
}

export async function loadPlans(): Promise<PlusPlan[]> {
  if (!configuredFor) return [];
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const plans: PlusPlan[] = [];
  for (const pkg of packages) {
    const kind = pkg.packageType === PACKAGE_TYPE.ANNUAL ? 'annual' : pkg.packageType === PACKAGE_TYPE.MONTHLY ? 'monthly' : null;
    if (!kind) continue;
    plans.push({ id: pkg.identifier, kind, price: pkg.product.priceString, perMonth: kind === 'annual' ? pkg.product.pricePerMonthString : null, trial: trialText(pkg), pkg });
  }
  return plans.sort((a, b) => (a.kind === 'annual' ? -1 : 1) - (b.kind === 'annual' ? -1 : 1));
}

function fromInfo(info: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>): LocalPlus {
  const entitlement = info.entitlements.active[PLUS.entitlement];
  return { active: Boolean(entitlement), expires: entitlement?.expirationDate ?? null, trial: entitlement?.periodType === 'TRIAL' };
}

/** Buys a plan. Null when the player backed out. Throws with a friendly message otherwise. */
export async function buy(plan: PlusPlan): Promise<LocalPlus | null> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
    return fromInfo(customerInfo);
  } catch (error) {
    const e = error as { code?: string; userCancelled?: boolean | null; message?: string };
    if (e.userCancelled || e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return null;
    if (e.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) throw new Error('Your payment is waiting for approval. Plus will turn on as soon as it goes through.');
    throw new Error(e.message ?? 'The purchase didn’t go through. Nothing was charged.');
  }
}

export async function restore(): Promise<LocalPlus> {
  return fromInfo(await Purchases.restorePurchases());
}

export async function localPlus(): Promise<LocalPlus> {
  if (!configuredFor) return { active: false, expires: null, trial: false };
  return fromInfo(await Purchases.getCustomerInfo());
}

export async function manageSubscription(): Promise<void> {
  await Purchases.showManageSubscriptions();
}
