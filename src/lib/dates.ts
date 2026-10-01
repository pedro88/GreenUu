import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/** Date locale `YYYY-MM-DD` d'un instant dans un fuseau IANA. */
export function localDate(at: Date, timeZone: string): string {
  return format(new TZDate(at, timeZone), 'yyyy-MM-dd');
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * 86_400_000);
}
