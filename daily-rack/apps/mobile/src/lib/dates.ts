/** Formats an instant in the night's own time zone, falling back to the device zone. */
export function formatWhen(iso: string, timeZone?: string, style: 'long' | 'short' = 'long'): string {
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return new Date(iso).toLocaleString(undefined, { ...options, timeZone });
  } catch {
    return new Date(iso).toLocaleString(undefined, options);
  }
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}
