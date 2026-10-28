// The web build doesn't sell Plus: subscriptions come from the App Store or Google Play.
// Same functions as on phones, reporting that buying isn't available here.
import type { LocalPlus, PlusPlan } from './purchases.ts';

export type { LocalPlus, PlusPlan };

export const purchasesAvailable = false;
export async function configurePurchases(_appUserId: string): Promise<boolean> {
  return false;
}
export async function loadPlans(): Promise<PlusPlan[]> {
  return [];
}
export async function buy(_plan: PlusPlan): Promise<LocalPlus | null> {
  throw new Error('Plus is available in the iPhone and Android app.');
}
export async function restore(): Promise<LocalPlus> {
  return { active: false, expires: null, trial: false };
}
export async function localPlus(): Promise<LocalPlus> {
  return { active: false, expires: null, trial: false };
}
export async function manageSubscription(): Promise<void> {}
