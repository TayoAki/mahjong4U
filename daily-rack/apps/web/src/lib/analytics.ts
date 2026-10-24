// Client milestone events. Each has a unique id so a retried batch is counted once.
// No raw audio, captions, contacts or credentials ever go in here.

type Props = Record<string, string | number | boolean | null>;

interface QueuedEvent {
  id: string;
  name: string;
  occurredAt: string;
  props: Props;
}

const queue: QueuedEvent[] = [];
let timer: number | undefined;

export function track(name: string, props: Props = {}): void {
  queue.push({ id: crypto.randomUUID(), name, occurredAt: new Date().toISOString(), props });
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, 1500);
}

export function flush(): void {
  if (queue.length === 0) return;
  const events = queue.splice(0, 50);
  fetch('/v1/events', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
  }).catch(() => {
    // Put them back for the next flush; the server deduplicates by id.
    queue.unshift(...events);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
