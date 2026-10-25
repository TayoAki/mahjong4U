import { ApiError, api } from './api.ts';

/** Downloads the night's .ics file; the browser or OS offers to add it to a calendar. */
export async function addToCalendar(nightId: string): Promise<void> {
  const res = await fetch(api.calendarUrl(nightId), { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'calendar_failed', 'Confirm a time before adding it to your calendar.', false);
  const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/calendar' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'game-night.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
