import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CalendarItem } from '../queries';
import styles from './Ticket.module.scss';
import { ticketTitle } from './ticketText';

/** Calendrier mensuel (RG-TCK-12) ; occurrences virtuelles en pointillés, non modifiables (TCK-11). */
export async function TicketCalendar({ gardenId, month, today, items, baseQuery }: { gardenId: string; month: string; today: string; items: CalendarItem[]; baseQuery: string }) {
  const t = await getTranslations();
  const [y = 2026, m = 1] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(y, m - 1, 1 - offset + i)).toISOString().slice(0, 10));
  const shift = (delta: number) => new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  const label = first.toLocaleDateString('fr', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const q = (mo: string) => `?${baseQuery ? `${baseQuery}&` : ''}vue=calendrier&mois=${mo}`;
  return (
    <section aria-label={label} data-testid="calendar">
      <p>
        <Link href={q(shift(-1))}>{t('tickets.prevMonth')}</Link>{' · '}<strong>{label}</strong>{' · '}<Link href={q(shift(1))}>{t('tickets.nextMonth')}</Link>
      </p>
      <div className={styles.calendar}>
        {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => <strong key={d} aria-hidden>{d}</strong>)}
        {days.map((d) => (
          <div key={d} className={`${styles.day} ${d.slice(0, 7) !== month ? styles.dayOther : ''} ${d === today ? styles.dayToday : ''}`} data-day={d}>
            {Number(d.slice(8))}
            {items.filter((i) => i.dueOn === d).map((i, idx) => i.virtual || !i.id
              ? <span key={`v-${idx}`} className={`${styles.event} ${styles.virtual}`} data-testid="calendar-virtual" title={t('tickets.virtual')}>{i.title}</span>
              : <Link key={i.id} href={`/app/jardins/${gardenId}/tickets/${i.id}`} className={`${styles.event} ${['done', 'cancelled'].includes(i.status) ? styles.done : ''}`}>{ticketTitle(t, i)}</Link>)}
          </div>
        ))}
      </div>
    </section>
  );
}
