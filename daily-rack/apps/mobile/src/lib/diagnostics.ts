import { Dimensions, PixelRatio, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import type { Preferences } from './storage.ts';

// What "Report a problem" attaches without being asked: the device, the app version, a few
// settings, and the last things that went wrong in the app. Kept in memory only, and only
// ever sent when a player sends a report (they can see the list before sending).

export type Details = Record<string, string | number | boolean | null | string[]>;

const RECENT_LIMIT = 15;
const recent: string[] = [];
let last = { text: '', count: 0 };
const clip = (text: string, max = 300) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const clock = () => new Date().toISOString().slice(11, 19);

/** Notes something that went wrong (a failed request, an uncaught error) for the next report. */
export function noteProblem(text: string): void {
  // The same thing failing over and over becomes one line with a count.
  if (text === last.text && recent.length > 0) {
    last.count += 1;
    recent[recent.length - 1] = clip(`${clock()} ${text} (${last.count} times)`);
    return;
  }
  last = { text, count: 1 };
  recent.push(clip(`${clock()} ${text}`));
  if (recent.length > RECENT_LIMIT) recent.shift();
}

let installed = false;
/** Catches uncaught errors so they show up in a report. Safe to call more than once. */
export function installProblemCatcher(): void {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e) => noteProblem(`Error: ${e.message}`));
    window.addEventListener('unhandledrejection', (e) => noteProblem(`Unhandled: ${String((e.reason as Error | undefined)?.message ?? e.reason)}`));
    return;
  }
  const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, fatal) => {
    noteProblem(`${fatal ? 'Fatal' : 'Error'}: ${error?.message ?? String(error)}`);
    previous(error, fatal);
  });
}

function deviceName(): string {
  if (Platform.OS === 'web') return 'Web browser';
  return Device.modelName ?? `${Platform.OS} device`;
}

/** Everything attached to a report, in plain words so the person reading it can follow. */
export function collectDetails(prefs: Preferences, extra: Details = {}): Details {
  const { width, height, fontScale } = Dimensions.get('window');
  const details: Details = {
    device: deviceName(),
    os: [Device.osName ?? Platform.OS, Device.osVersion ?? (Platform.OS === 'web' ? '' : String(Platform.Version))].filter(Boolean).join(' '),
    manufacturer: Device.manufacturer ?? null,
    appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    appBuild: Application.nativeBuildVersion ?? null,
    appRuntime: String(Constants.executionEnvironment),
    platform: Platform.OS,
    screenSize: `${Math.round(width)}x${Math.round(height)} @${PixelRatio.get()}x`,
    textSize: fontScale === 1 ? 'standard' : `${Math.round(fontScale * 100)}%`,
    language: Intl.DateTimeFormat().resolvedOptions().locale,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    largeTiles: prefs.largeTiles,
    tableSounds: prefs.sounds,
    hints: prefs.showHints,
    recentErrors: [...recent],
    ...extra,
  };
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') details.browser = clip(navigator.userAgent, 400);
  return details;
}

/** One line per detail, for the "What we'll include" list. */
export function describeDetails(screen: string, details: Details): string[] {
  const lines = [`Screen: ${screen}`, `Device: ${details.device} (${details.os})`, `App: ${details.appVersion ?? 'unknown'}${details.appBuild ? ` (build ${details.appBuild})` : ''}`];
  lines.push(`Screen size ${details.screenSize}, text size ${details.textSize}, ${details.language}, ${details.timeZone}`);
  lines.push(`Settings: large tiles ${details.largeTiles ? 'on' : 'off'}, table sounds ${details.tableSounds ? 'on' : 'off'}, hints ${details.hints ? 'on' : 'off'}`);
  const errors = Array.isArray(details.recentErrors) ? details.recentErrors : [];
  lines.push(errors.length ? `Recent errors (${errors.length}): ${errors.slice(-3).join('; ')}` : 'No recent errors');
  if (details.error) lines.push(`The error: ${details.error}`);
  if (details.browser) lines.push(`Browser: ${details.browser}`);
  return lines;
}
