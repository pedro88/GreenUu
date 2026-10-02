import { tDynamic } from '@/i18n/dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Badge, Card, Muted, PageHeader, Row, Stack } from '@/components/ui/Layout';
import { activeCulturesOfZone, zoneHistory } from '@/features/culture/service';
import { gardenToday, ticketsOf } from '@/features/ticket/service';
import { TicketCard } from '@/features/ticket/ui/TicketCard';
import ticketStyles from '@/features/ticket/ui/Ticket.module.scss';
import { listGroups } from '@/features/group/service';
import { listPracticeCatalog, practicesForZone } from '@/features/practice/service';
import { PracticesEditor } from '@/features/practice/ui/PracticesEditor';
import { seasonYearOf } from '@/features/season/season.pure';
import { zoneTypeOptions } from '@/features/zone/queries';
import { listZoneRows, zoneDetail } from '@/features/zone/service';
import { NewZoneButton } from '@/features/zone/ui/NewZoneButton';
import { ZoneActions } from '@/features/zone/ui/ZoneActions';
import { ZoneRestrictions } from '@/features/zone/ui/ZoneRestrictions';
import { DomainError } from '@/lib/errors';
import { localDate } from '@/lib/dates';
import { uuidSchema } from '@/lib/zod';
import { requireGardenScope } from '@/server/page-guards';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { getGarden } from '@/features/garden/service';

export default async function ZoneDetailPage({ params }: PageProps<'/app/jardins/[jardinId]/zones/[zoneId]'>) {
  const { jardinId, zoneId } = await params;
  const scope = await requireGardenScope(jardinId);
  if (!uuidSchema.safeParse(zoneId).success) notFound();
  const detail = await zoneDetail(db(), scope, zoneId).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const t = await getTranslations('zones');
  const tt = await getTranslations('zoneTypes');
  const te = await getTranslations('environments');
  const f = await getFormatter();
  const { zone: z } = detail;
  const g = await getGarden(db(), scope);
  const types = await zoneTypeOptions(db(), scope);
  const base = `/app/jardins/${scope.gardenId}/zones`;
  const allZones = await listZoneRows(db(), scope);
  const moveTargets = allZones
    .filter((o) => o.id !== z.id && !o.path.split('/').includes(z.id))
    .map((o) => ({ id: o.id, label: `${'— '.repeat(o.depth)}${o.name}` }));
  const year = seasonYearOf(localDate(appClock().now(), g.timezone), g.seasonStartMonth);
  const chain = [...(z.path ? z.path.split('/') : []), z.id];
  const practices = await practicesForZone(db(), scope, chain, year);
  const parentPractices = await practicesForZone(db(), scope, chain.slice(0, -1), year);
  const catalog = (await listPracticeCatalog(db())).map((p) => p.code);
  const groups = can(scope, 'zone:restrict') ? await listGroups(db(), scope) : [];
  const [active, history, tickets] = await Promise.all([activeCulturesOfZone(db(), scope, z.id), zoneHistory(db(), scope, z.id), ticketsOf(db(), scope, { zoneId: z.id })]);
  const today = await gardenToday(db(), scope.gardenId, appClock().now());
  const canPlant = !z.archivedAt && (detail.type?.canHostCultures ?? false) && can(scope, 'culture:create');
  const typeLabel = detail.type ? (detail.type.gardenId ? detail.type.label : tDynamic(tt, detail.type.code, detail.type.label)) : '';
  const surfaceText = detail.surface.m2 === null ? t('surfaceUnknown') : t(`surfaceFrom.${detail.surface.source}`, { m2: f.number(detail.surface.m2, { maximumFractionDigits: 2 }) });
  return (
    <Stack gap="lg">
      <nav aria-label={t('breadcrumb')}>
        <Row>
          <Link href={base}>{t('title')}</Link>
          {detail.ancestors.map((a) => <span key={a.id}>› <Link href={`${base}/${a.id}`}>{a.name}</Link></span>)}
        </Row>
      </nav>
      <PageHeader
        title={z.name}
        subtitle={typeLabel}
        actions={detail.canEdit ? (
          <ZoneActions gardenId={scope.gardenId} zoneId={z.id} archived={z.archivedAt !== null} types={types} currentParentId={z.parentId} moveTargets={moveTargets}
            initial={{ name: z.name, zoneTypeId: z.zoneTypeId, environment: z.environment ?? '', lengthCm: z.lengthCm?.toString() ?? '', widthCm: z.widthCm?.toString() ?? '', surfaceM2Manual: z.surfaceM2Manual?.toString() ?? '', hasInterior: z.hasInterior, notes: z.notes ?? '' }} />
        ) : null}
      />
      {z.archivedAt ? <Badge>{t('archived')}</Badge> : null}
      <Card>
        <Stack gap="sm">
          <p data-testid="zone-environment">{t('environment')} : <strong>{te(detail.effectiveEnvironment)}</strong> {detail.environmentInherited ? <Muted>{t('inheritedTag')}</Muted> : null}</p>
          <p data-testid="zone-surface">{t('surface')} : <strong>{surfaceText}</strong></p>
          {z.notes ? <p>{z.notes}</p> : null}
        </Stack>
      </Card>
      <Card>
        <Stack>
          <Row>
            <h2>{t('children')}</h2>
            {detail.canEdit && !z.archivedAt ? <NewZoneButton gardenId={scope.gardenId} parent={{ id: z.id, name: z.name }} types={types} variant="secondary" /> : null}
          </Row>
          {detail.children.length === 0 ? <Muted>{t('noChildren')}</Muted> : (
            <ul>{detail.children.map((c) => <li key={c.id}><Link href={`${base}/${c.id}`}>{c.name}</Link>{c.archivedAt ? ` (${t('archived')})` : ''}</li>)}</ul>
          )}
        </Stack>
      </Card>
      <Card>
        <Stack>
          <Row>
            <h2>{t('culturesTitle')}</h2>
            {canPlant ? <LinkButton href={`/app/jardins/${scope.gardenId}/cultures/nouvelle?zone=${z.id}`} variant="secondary" data-testid="plant-here">{t('plantHere')}</LinkButton> : null}
          </Row>
          {active.length === 0 ? <Muted>{t('noActiveCultures')}</Muted> : (
            <ul>{active.map((c) => <li key={c.id}><Link href={`/app/jardins/${scope.gardenId}/cultures/${c.id}`}>{c.label}</Link></li>)}</ul>
          )}
          {history.length > 0 ? (
            <>
              <h3>{t('historyTitle')}</h3>
              <ul data-testid="zone-history">
                {history.map((h) => (
                  <li key={h.year}><strong>{h.year}</strong> : {h.cultures.map((c, i) => <span key={c.id}>{i > 0 ? ', ' : ''}<Link href={`/app/jardins/${scope.gardenId}/cultures/${c.id}`}>{c.label}</Link>{c.zoneName !== z.name ? ` (${c.zoneName})` : ''}</span>)}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Stack>
      </Card>
      <Card>
        <Stack>
          <Row>
            <h2>{t('ticketsTitle')}</h2>
            {can(scope, 'ticket:create') && !z.archivedAt ? <LinkButton href={`/app/jardins/${scope.gardenId}/tickets/nouveau?zone=${z.id}`} variant="secondary">{t('newTicket')}</LinkButton> : null}
          </Row>
          {tickets.length === 0 ? <Muted>{t('noTickets')}</Muted> : <ul className={ticketStyles.list}>{tickets.map((r) => <li key={r.id}><TicketCard gardenId={scope.gardenId} row={r} today={today} /></li>)}</ul>}
        </Stack>
      </Card>
      <Card>
        <Stack>
          <h2>{t('practicesTitle')}</h2>
          <PracticesEditor gardenId={scope.gardenId} zoneId={z.id} catalog={catalog} declared={practices.ownDeclared} excluded={practices.ownExcluded}
            inherited={parentPractices.effective} readOnly={!detail.canEdit || z.archivedAt !== null} />
        </Stack>
      </Card>
      {can(scope, 'zone:restrict') ? (
        <Card>
          <Stack>
            <h2>{t('restrictionsTitle')}</h2>
            {detail.restrictionInherited ? <Muted>{t('restrictionInherited')}</Muted> : null}
            <ZoneRestrictions gardenId={scope.gardenId} zoneId={z.id} groups={groups.map((gr) => ({ id: gr.id, name: gr.name }))} own={detail.ownRestrictions} />
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
