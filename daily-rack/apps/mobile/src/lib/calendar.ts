import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { ApiError, api, getBearer } from './api.ts';

/** Hands the night's .ics file to the share sheet, where Calendar can import it. */
export async function addToCalendar(nightId: string): Promise<void> {
  const bearer = getBearer();
  const res = await fetch(api.calendarUrl(nightId), { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'calendar_failed', 'Confirm a time before adding it to your calendar.', false);
  const file = new File(Paths.cache, 'game-night.ics');
  if (file.exists) file.delete();
  file.create();
  await file.write(await res.text());
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle: 'Add to calendar' });
}
