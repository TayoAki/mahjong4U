import { AppState } from 'react-native';
import { getBearer } from './api.ts';
import { API_BASE } from './config.ts';
import { newKey } from './storage.ts';

// Client milestone events. Each has a unique id so a retried batch is counted once.
// No audio, captions, contacts or credentials ever go in here.

type Props = Record<string, string | number | boolean | null>;

const queue: { id: string; name: string; occurredAt: string; props: Props }[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

export function track(name: string, props: Props = {}): void {
  queue.push({ id: newKey(), name, occurredAt: new Date().toISOString(), props });
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

export function flush(): void {
  if (queue.length === 0) return;
  const events = queue.splice(0, 50);
  const bearer = getBearer();
  fetch(`${API_BASE}/v1/events`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ events }),
  }).catch(() => queue.unshift(...events));
}

AppState.addEventListener('change', (state) => {
  if (state !== 'active') flush();
});
