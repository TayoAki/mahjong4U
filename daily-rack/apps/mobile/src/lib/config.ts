import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the API lives. On the web build the server serves the app, so requests are
 * same-origin. Native builds need EXPO_PUBLIC_API_URL (or extra.apiUrl in app.json).
 */
export const API_BASE: string = (() => {
  const configured = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | null | undefined) ?? null;
  if (Platform.OS === 'web') return configured ?? '';
  return configured ?? 'http://localhost:8787';
})();

export function realtimeUrl(ticket: string): string {
  const query = `/v1/realtime?ticket=${encodeURIComponent(ticket)}`;
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + query;
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${query}`;
}

/** Absolute link for sharing; falls back to the current site on the web. */
export function publicLink(path: string, publicBaseUrl: string | null): string {
  if (publicBaseUrl) return `${publicBaseUrl}${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return `${API_BASE}${path}`;
}
