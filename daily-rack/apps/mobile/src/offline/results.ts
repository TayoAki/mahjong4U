import { api, type OfflineResult } from '../lib/api.ts';
import { readJson, writeJson } from '../lib/storage.ts';

// Results of hands played offline wait on the device until the server can take them; they
// then count in your stats (never in ranking). Each has its own id, so a retry adds nothing twice.

const KEY = 'dr:offline-results';

export async function queueOfflineResult(result: OfflineResult): Promise<void> {
  const pending = await readJson<OfflineResult[]>(KEY, []);
  await writeJson(KEY, [...pending, result].slice(-500));
}

/** Sends any waiting results. Returns how many the server added; throws if it can't be reached. */
export async function syncOfflineResults(): Promise<number> {
  let pending = await readJson<OfflineResult[]>(KEY, []);
  let added = 0;
  while (pending.length > 0) {
    const batch = pending.slice(0, 50);
    added += (await api.offlineResults(batch)).added;
    pending = pending.slice(batch.length);
    await writeJson(KEY, pending);
  }
  return added;
}
