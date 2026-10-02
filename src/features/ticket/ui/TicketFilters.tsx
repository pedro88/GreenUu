'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { NativeSelect } from '@/components/ui/Field';
import { TICKET_TYPES } from '@/lib/enums';
import styles from './Ticket.module.scss';

/** Vue et filtres des tickets, dans l'URL (TCK-09). */
export function TicketFilters({ groups, members, zones }: { groups: { id: string; name: string }[]; members: { id: string; pseudo: string }[]; zones: { id: string; label: string }[] }) {
  const t = useTranslations('tickets');
  const tt = useTranslations('ticketTypes');
  const pathname = usePathname();
  const params = useSearchParams();
  const [f, setF] = useQueryStates(
    { statut: parseAsString, assigne: parseAsString, groupe: parseAsString, zone: parseAsString, echeance: parseAsString, type: parseAsString },
    { shallow: false },
  );
  const view = params.get('vue') ?? 'liste';
  const hrefFor = (v: string) => {
    const p = new URLSearchParams(params.toString());
    p.set('vue', v);
    return `${pathname}?${p.toString()}`;
  };
  const sel = (id: string, label: string, value: string | null, key: keyof typeof f, options: { v: string; l: string }[], all: string) => (
    <>
      <label className="visually-hidden" htmlFor={id}>{label}</label>
      <NativeSelect id={id} value={value ?? ''} onChange={(e) => void setF({ [key]: e.target.value || null })} data-testid={id}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </NativeSelect>
    </>
  );
  return (
    <>
      <nav className={styles.views} aria-label={t('views')}>
        {(['liste', 'kanban', 'calendrier'] as const).map((v) => <Link key={v} href={hrefFor(v)} aria-current={view === v ? 'page' : undefined} data-testid={`view-${v}`}>{t(`view_${v}`)}</Link>)}
      </nav>
      <div role="search" aria-label={t('filters')} className={styles.filters}>
        {sel('f-assigne', t('assignee'), f.assigne, 'assigne', [{ v: 'moi', l: t('me') }, ...members.map((m) => ({ v: m.id, l: m.pseudo }))], t('allAssignees'))}
        {sel('f-groupe', t('group'), f.groupe, 'groupe', groups.map((g) => ({ v: g.id, l: g.name })), t('allGroups'))}
        {sel('f-zone', t('zone'), f.zone, 'zone', zones.map((z) => ({ v: z.id, l: z.label })), t('allZones'))}
        {sel('f-echeance', t('due'), f.echeance, 'echeance', (['retard', 'aujourdhui', 'semaine', 'avenir', 'sans'] as const).map((v) => ({ v, l: t(`due_${v}`) })), t('allDue'))}
        {sel('f-type', t('type'), f.type, 'type', TICKET_TYPES.map((v) => ({ v, l: tt(v) })), t('allTypes'))}
        {view === 'liste' ? sel('f-statut', t('status'), f.statut, 'statut', [{ v: 'termines', l: t('statusDone') }, { v: 'tous', l: t('statusAll') }], t('statusOpen')) : null}
      </div>
    </>
  );
}
