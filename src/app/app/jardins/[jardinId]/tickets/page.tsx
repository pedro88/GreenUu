import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { listGroups } from '@/features/group/service';
import { listMembers } from '@/features/member/service';
import { ticketFiltersSchema } from '@/features/ticket/schema';
import { calendarMonth, listTickets } from '@/features/ticket/queries';
import { gardenToday } from '@/features/ticket/shared';
import { KanbanBoard } from '@/features/ticket/ui/KanbanBoard';
import styles from '@/features/ticket/ui/Ticket.module.scss';
import { TicketCalendar } from '@/features/ticket/ui/TicketCalendar';
import { TicketCard } from '@/features/ticket/ui/TicketCard';
import { TicketFilters } from '@/features/ticket/ui/TicketFilters';
import { listZoneRows } from '@/features/zone/service';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('tickets'))('title') };
}

/** Tickets du jardin : liste, kanban, calendrier (PAGES.md §4, maquette kanban). */
export default async function TicketsPage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/tickets'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const sp = await searchParams;
  const parsed = ticketFiltersSchema.safeParse(sp);
  const f = parsed.success ? parsed.data : {};
  const t = await getTranslations('tickets');
  const today = await gardenToday(db(), scope.gardenId, appClock().now());
  const view = f.vue ?? 'liste';
  const [groups, { active }, zones] = await Promise.all([listGroups(db(), scope), listMembers(db(), scope, appClock().now()), listZoneRows(db(), scope)]);
  const filterQuery = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' && k !== 'vue' && k !== 'mois' ? [[k, v]] : []))).toString();
  const header = (
    <PageHeader title={t('title')} actions={can(scope, 'ticket:create') ? <LinkButton href={`/app/jardins/${scope.gardenId}/tickets/nouveau`} data-testid="new-ticket">{t('new')}</LinkButton> : null} />
  );
  const filters = <TicketFilters groups={groups.map((g) => ({ id: g.id, name: g.name }))} members={active.map((m) => ({ id: m.id, pseudo: m.pseudo ?? m.name }))} zones={zones.map((z) => ({ id: z.id, label: `${'— '.repeat(z.depth)}${z.name}` }))} />;
  if (view === 'calendrier') {
    const month = f.mois ?? today.slice(0, 7);
    return <Stack gap="lg">{header}{filters}<TicketCalendar gardenId={scope.gardenId} month={month} today={today} items={await calendarMonth(db(), scope, month, today)} baseQuery={filterQuery} /></Stack>;
  }
  const rows = await listTickets(db(), scope, { ...f, ...(view === 'kanban' ? { statut: 'tous' as const } : {}) }, today);
  if (view === 'kanban') {
    const items = await Promise.all(rows.filter((r) => r.status !== 'skipped').map(async (r) => ({ id: r.id, status: r.status, node: <TicketCard gardenId={scope.gardenId} row={r} today={today} /> })));
    return <Stack gap="lg">{header}{filters}<KanbanBoard key={JSON.stringify(rows.map((r) => [r.id, r.status]))} gardenId={scope.gardenId} items={items} /></Stack>;
  }
  return (
    <Stack gap="lg">
      {header}
      {filters}
      {rows.length === 0 ? <Card><Muted>{t('empty')}</Muted></Card> : (
        <ul className={styles.list} data-testid="ticket-list">{rows.map((r) => <li key={r.id}><TicketCard gardenId={scope.gardenId} row={r} today={today} /></li>)}</ul>
      )}
    </Stack>
  );
}
