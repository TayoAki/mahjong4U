// The web build has no notifications: turn-based moves, invites and messages show up as
// badges in the app instead. Same functions as on phones, doing nothing.
import type { LocalNote, PushState } from './notifications.ts';

export type { LocalNote, PushState };

export function configureNotifications(): void {}
export async function pushState(): Promise<PushState> {
  return 'unsupported';
}
export async function requestPush(): Promise<PushState> {
  return 'unsupported';
}
export function easProjectId(): string | null {
  return null;
}
export async function registerPushToken(): Promise<boolean> {
  return false;
}
export async function forgetPushToken(): Promise<void> {}
export function openNotificationSettings(): void {}
export function onNotificationTap(_go: (url: string) => void): () => void {
  return () => undefined;
}
export async function clearBadge(): Promise<void> {}
export async function scheduleLocal(_note: LocalNote): Promise<void> {}
export async function cancelLocal(_prefix: string): Promise<void> {}
