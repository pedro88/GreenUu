import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, Card, Muted, Row, Stack } from '@/components/ui/Layout';
import { PixelIcon } from '@/components/ui/PlantIcon';
import { listGroups } from '@/features/group/service';
import { listMembers } from '@/features/member/service';
import { gardenToday, ticketDetail } from '@/features/ticket/service';
import { AssignDialog, ChecklistEditor, CommentForm, EditTicketDialog, TicketStatusBar } from '@/features/ticket/ui/TicketControls';
import { ticketIcon } from '@/features/ticket/ui/TicketCard';
import styles from '@/features/ticket/ui/Ticket.module.scss';
import { ticketTitle } from '@/features/ticket/ui/ticketText';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

/** Fiche ticket (maquette « Réparer le récupérateur d'eau »). */
export default async function TicketPage({ params }: PageProps<'/app/jardins/[jardinId]/tickets/[ticketId]'>) {
  const { jardinId, ticketId } = await params;
  const scope = await requireGardenScope(jardinId);
  if (!uuidSchema.safeParse(ticketId).success) notFound();
  const d = await ticketDetail(db(), scope, ticketId).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const t = await getTranslations();
  const tk = await getTranslations('tickets');
  const ts = await getTranslations('ticketStatus');
  const tp = await getTranslations('ticketPriorities');
  const f = await getFormatter();
  const today = await gardenToday(db(), scope.gardenId, appClock().now());
  const [groups, { active }] = await Promise.all([listGroups(db(), scope), listMembers(db(), scope, appClock().now())]);
  const full = d.full;
  const canAct = !scope.archived && can(scope, 'ticket:transition', d.facts);
  const canEdit = !scope.archived && can(scope, 'ticket:update', d.facts);
  const g = `/app/jardins/${scope.gardenId}`;
  return (
    <Stack gap="lg">
      <Card>
        <Row>
          <span className={styles.icon} style={{ width: 64, height: 64 }}><PixelIcon name={ticketIcon(d)} size={48} /></span>
          <h1 data-testid="ticket-title">{ticketTitle(t, d)}</h1>
        </Row>
      </Card>
      <Row>
        <Badge data-testid="ticket-status">{ts(d.status)}</Badge>
        <Badge>{tp(d.priority)}</Badge>
        {d.dueOn ? <Badge>{tk('dueBadge', { date: f.dateTime(new Date(`${d.dueOn}T12:00:00`), { day: 'numeric', month: 'long' }) })}</Badge> : null}
        {d.seriesId ? <Badge>{tk('recurring')}</Badge> : null}
      </Row>
      <p>
        {tk('attachedTo')} :{' '}
        {d.cultureId ? <Link href={`${g}/cultures/${d.cultureId}`}>{d.cultureLabel}</Link> : d.zoneId ? <Link href={`${g}/zones/${d.zoneId}`}>{d.zoneName}</Link> : tk('wholeGarden')}
        {' · '}{tk('createdBy', { name: d.creatorPseudo })}
      </p>
      <TicketStatusBar gardenId={scope.gardenId} ticketId={d.id} status={d.status} today={today} canAct={canAct} />
      <Card>
        <Stack gap="sm">
          <Row><h2>{tk('assignees')}</h2>{can(scope, 'ticket:assign') && !scope.archived ? (
            <AssignDialog gardenId={scope.gardenId} ticketId={d.id} members={active.filter((m) => m.role !== 'observer').map((m) => ({ id: m.id, pseudo: m.pseudo ?? m.name }))}
              groups={groups.map((x) => ({ id: x.id, name: x.name }))} memberIds={d.assignees.filter((a) => a.kind === 'member').map((a) => a.id)} groupIds={d.assignees.filter((a) => a.kind === 'group').map((a) => a.id)} />
          ) : null}</Row>
          {d.assignees.length === 0 ? <Muted>{tk('unassigned')}</Muted> : (
            <Row data-testid="assignees">{d.assignees.map((a) => <span key={a.id} className={a.kind === 'group' ? styles.group : styles.avatar} title={a.label}>{a.kind === 'group' ? a.label : a.label.slice(0, 1)}</span>)}
              <span className="visually-hidden">{d.assignees.map((a) => a.label).join(', ')}</span></Row>
          )}
        </Stack>
      </Card>
      {full?.description ? <Card><p style={{ whiteSpace: 'pre-wrap' }}>{full.description}</p></Card> : null}
      {d.photos.length > 0 ? (
        <Card>
          <Stack gap="sm">
            <h2>{tk('photos')}</h2>
            <Row>{d.photos.map((p) => <a key={p.id} href={`/api/files/${p.id}`}><img src={`/api/files/${p.id}`} alt={tk('photoAlt')} width={p.width} height={p.height} loading="lazy" className={styles.photo} data-testid="ticket-photo" /></a>)}</Row>
          </Stack>
        </Card>
      ) : null}
      <Card>
        <Stack gap="sm">
          <h2>{tk('checklist')}</h2>
          <ChecklistEditor gardenId={scope.gardenId} ticketId={d.id} items={d.checklistItems} canToggle={!scope.archived && can(scope, 'checklist:toggle')} canAdd={canEdit} />
        </Stack>
      </Card>
      <Card>
        <Stack gap="sm">
          <h2>{tk('comments')}</h2>
          {d.comments.length === 0 ? <Muted>{tk('noComments')}</Muted> : (
            <ul style={{ listStyle: 'none', padding: 0 }} data-testid="comments">
              {d.comments.map((c) => <li key={c.id}><Row><span className={styles.avatar} aria-hidden>{(c.pseudo ?? '?').slice(0, 1)}</span><p><strong>{c.pseudo}</strong> : {c.body}</p></Row></li>)}
            </ul>
          )}
          {can(scope, 'ticket:comment') && !scope.archived ? <CommentForm gardenId={scope.gardenId} ticketId={d.id} /> : null}
        </Stack>
      </Card>
      {canEdit && full ? (
        <EditTicketDialog gardenId={scope.gardenId} ticketId={d.id} recurring={full.seriesId !== null && !full.detached}
          initial={{ title: full.title, description: full.description ?? '', priority: full.priority, dueOn: full.dueOn ?? '', type: full.type, actionTag: full.actionTag ?? '' }} />
      ) : null}
    </Stack>
  );
}
