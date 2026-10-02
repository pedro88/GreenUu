import { CalendarDays, CheckSquare, Repeat } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PixelIcon } from '@/components/ui/PlantIcon';
import type { TicketListRow } from '../service';
import styles from './Ticket.module.scss';
import { ticketTitle } from './ticketText';

const ICONS: Record<string, string> = {
  watering: 'ui/action-arroser', sowing: 'ui/action-semer', planting: 'ui/action-planter', harvest: 'ui/action-recolter', treatment: 'ui/action-observer',
};

export function ticketIcon(row: { actionTag: string | null; type: string }) {
  return ICONS[row.actionTag ?? ''] ?? (row.type === 'harvest' ? 'ui/action-recolter' : row.type === 'check' ? 'ui/action-observer' : 'ui/action-ticket');
}

export async function TicketCard({ gardenId, row, today }: { gardenId: string; row: TicketListRow; today: string }) {
  const t = await getTranslations();
  const f = await getFormatter();
  const late = row.dueOn !== null && row.dueOn < today && ['todo', 'in_progress', 'blocked'].includes(row.status);
  const place = row.cultureLabel ?? row.zoneName;
  return (
    <Link href={`/app/jardins/${gardenId}/tickets/${row.id}`} className={`${styles.card} ${late ? styles.late : ''}`} data-testid={`ticket-${row.id}`} data-status={row.status}>
      <span className={styles.head}>
        <span className={styles.icon}><PixelIcon name={ticketIcon(row)} size={32} /></span>
        <span>{ticketTitle(t, row)}</span>
      </span>
      <span className={styles.meta}>
        {place ? <span className={styles.place}>{place}</span> : null}
        {row.dueOn ? <span><CalendarDays aria-hidden size={14} /> {f.dateTime(new Date(`${row.dueOn}T12:00:00`), { day: 'numeric', month: 'short' })}{late ? ` · ${t('tickets.late')}` : ''}</span> : null}
        {row.seriesId ? <span><Repeat aria-hidden size={14} /><span className="visually-hidden">{t('tickets.recurring')}</span></span> : null}
        {row.checklist ? <span><CheckSquare aria-hidden size={14} /> {row.checklist.done}/{row.checklist.total}</span> : null}
        <span className={styles.avatars}>
          {row.assignees.map((a) => a.kind === 'group'
            ? <span key={a.id} className={styles.group}>{a.label}</span>
            : <span key={a.id} className={styles.avatar} title={a.label}>{a.label.slice(0, 1)}</span>)}
        </span>
      </span>
    </Link>
  );
}
