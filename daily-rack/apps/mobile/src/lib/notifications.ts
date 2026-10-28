import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api.ts';
import { noteProblem } from './diagnostics.ts';

// Notifications on phones: the permission, this phone's push token for the server, the
// Android channels people can tune in Settings, tapping a notification to open its screen,
// and reminders scheduled on the phone itself (they work even without the push service).

export type PushState = 'unsupported' | 'undetermined' | 'denied' | 'granted';

const CHANNELS: [id: string, name: string, high: boolean][] = [
  ['turns', 'Your move', true],
  ['invites', 'Invites and new friends', true],
  ['messages', 'Messages from friends', false],
  ['nights', 'Game Night', false],
  ['reminders', 'Reminders from Pip', false],
];

let configured = false;
export function configureNotifications(): void {
  if (configured) return;
  configured = true;
  // While the app is open it already shows what's new, so notifications stay quiet then.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

let channelsMade = false;
async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android' || channelsMade) return;
  channelsMade = true;
  for (const [id, name, high] of CHANNELS) {
    await Notifications.setNotificationChannelAsync(id, {
      name,
      importance: high ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      lightColor: '#99028F',
    });
  }
}

export async function pushState(): Promise<PushState> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    return status === 'denied' && !canAskAgain ? 'denied' : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/** Shows the system prompt (or reports that it was already turned down). */
export async function requestPush(): Promise<PushState> {
  await ensureChannels();
  const { status } = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  if (status !== 'granted') return 'denied';
  void registerPushToken();
  return 'granted';
}

/** The Expo project the push service sends for. Set up with `eas init`. */
export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

let lastToken: string | null = null;

/** Tells the server where to send pushes. Reminders on the phone work either way. */
export async function registerPushToken(): Promise<boolean> {
  try {
    if ((await Notifications.getPermissionsAsync()).status !== 'granted') return false;
    await ensureChannels();
    const projectId = easProjectId();
    if (!projectId) {
      noteProblem('Push: no EAS project ID yet, so only reminders on the phone work');
      return false;
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    lastToken = data;
    await api.savePushToken(data, Platform.OS === 'ios' ? 'ios' : 'android');
    return true;
  } catch (error) {
    noteProblem(`Push registration failed: ${(error as Error).message}`);
    return false;
  }
}

/** Stops pushes to this phone, e.g. before deleting the player's data. */
export async function forgetPushToken(): Promise<void> {
  if (lastToken) await api.removePushToken(lastToken).catch(() => undefined);
}

export function openNotificationSettings(): void {
  void Linking.openSettings();
}

/** Tapping a notification (even one that opened the app) goes to the screen it's about. */
export function onNotificationTap(go: (url: string) => void): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) go(url);
  };
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      handle(response);
      // So it doesn't send them there again next time the app starts.
      return Notifications.clearLastNotificationResponseAsync();
    })
    .catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0).catch(() => undefined);
}

export interface LocalNote {
  id: string;
  date: Date;
  title: string;
  body: string;
  url: string;
}

/** A notification the phone shows at `date` by itself, no server needed. */
export async function scheduleLocal(note: LocalNote): Promise<void> {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: note.id,
    content: { title: note.title, body: note.body, data: { url: note.url, category: 'reminders' }, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: note.date, channelId: 'reminders' },
  });
}

/** Cancels every scheduled notification whose id starts with `prefix`. */
export async function cancelLocal(prefix: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of scheduled) if (n.identifier.startsWith(prefix)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
}
