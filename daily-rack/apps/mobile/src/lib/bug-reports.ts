import { ApiError, api, type BugReport } from './api.ts';
import { readJson, writeJson } from './storage.ts';

// Problem reports written with no connection wait on the device and go out the next time
// the server answers. Only the latest few are kept, screenshots included.

const QUEUE_KEY = 'dr:pending-bug-reports';
const QUEUE_LIMIT = 3;

export async function queueBugReport(report: BugReport): Promise<void> {
  const pending = await readJson<BugReport[]>(QUEUE_KEY, []);
  await writeJson(QUEUE_KEY, [...pending, report].slice(-QUEUE_LIMIT));
}

let sending: Promise<void> | null = null;

/** Sends any reports written while offline. Ones the server turns down for good are dropped. */
export function sendQueuedBugReports(): Promise<void> {
  sending ??= (async () => {
    const pending = await readJson<BugReport[]>(QUEUE_KEY, []);
    if (pending.length === 0) return;
    const left: BugReport[] = [];
    for (const report of pending) {
      try {
        await api.bugReport(report);
      } catch (error) {
        if (error instanceof ApiError && (error.code === 'network' || error.retryable || error.status === 429 || error.status >= 500)) left.push(report);
      }
    }
    await writeJson(QUEUE_KEY, left);
  })().finally(() => {
    sending = null;
  });
  return sending;
}
