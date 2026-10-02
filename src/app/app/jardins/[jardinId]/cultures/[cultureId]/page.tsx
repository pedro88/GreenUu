import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, Card, Muted, Row, Stack } from '@/components/ui/Layout';
import { PlantIcon } from '@/components/ui/PlantIcon';
import { cultureDetail } from '@/features/culture/queries';
import { CultureActions } from '@/features/culture/ui/CultureActions';
import styles from '@/features/culture/ui/CultureDetail.module.scss';
import { familySpriteOf } from '@/features/culture/ui/CultureList';
import { QuickCapture } from '@/features/culture/ui/QuickCapture';
import { StageEditor } from '@/features/culture/ui/StageEditor';
import { StageTimeline } from '@/features/culture/ui/StageTimeline';
import { getGarden } from '@/features/garden/service';
import { appliedGuide, guidesForSpecies } from '@/features/guide/queries';
import { ApplyGuideDialog } from '@/features/guide/ui/ApplyGuideDialog';
import { ticketsOf } from '@/features/ticket/queries';
import { TicketCard } from '@/features/ticket/ui/TicketCard';
import ticketStyles from '@/features/ticket/ui/Ticket.module.scss';
import { listProblems } from '@/features/journal/queries';
import { cultivableZones } from '@/features/zone/service';
import { tDynamic } from '@/i18n/dynamic';
import { localDate } from '@/lib/dates';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { can } from '@/server/authz/scope';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

const TABS = ['journal', 'recoltes', 'taches', 'etapes'] as const;

export default async function CulturePage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/cultures/[cultureId]'>) {
  const { jardinId, cultureId } = await params;
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.onglet) ?? 'journal';
  const scope = await requireGardenScope(jardinId);
  if (!uuidSchema.safeParse(cultureId).success) notFound();
  const d = await cultureDetail(db(), scope, cultureId).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const t = await getTranslations('cultureDetail');
  const ts = await getTranslations('cultureStatus');
  const tm = await getTranslations('methods');
  const tu = await getTranslations('quick');
  const tp = await getTranslations('problems');
  const ti = await getTranslations('interventions');
  const f = await getFormatter();
  const g = await getGarden(db(), scope);
  const today = localDate(appClock().now(), g.timezone);
  const label = [d.sp.commonNames.fr[0], d.varietyName].filter(Boolean).join(' ');
  const base = `/app/jardins/${scope.gardenId}/cultures/${cultureId}`;
  const deleted = d.c.deletedAt !== null;
  const canEdit = !deleted && can(scope, 'culture:update') && d.seasonStatus !== 'closed';
  const problems = await listProblems(db());
  const problemCode = new Map(problems.map((p) => [p.id, p.code]));
  const zones = canEdit ? await cultivableZones(db(), scope) : [];
  const tickets = tab === 'taches' ? await ticketsOf(db(), scope, { cultureId }) : [];
  const canApply = canEdit && can(scope, 'guide:apply');
  const [guides, applied] = await Promise.all([canApply ? guidesForSpecies(db(), await requireUser(), d.c.speciesId, scope.gardenId) : Promise.resolve([]), appliedGuide(db(), d.c.appliedGuideVersionId)]);
  const tg = await getTranslations('guides');
  const tst = await getTranslations('stages');
  const fmtDay = (iso: string) => f.dateTime(new Date(`${iso}T12:00:00`), { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <Stack gap="lg">
      <section className={styles.hero}>
        <PlantIcon spriteKey={d.c.varietyId ? d.sp.spriteKey : d.sp.spriteKey} familySprite={familySpriteOf(d.family.code)} size={96} />
        <h1 data-testid="culture-title">{label}</h1>
        <p>
          <Link href={`/app/jardins/${scope.gardenId}/zones/${d.c.zoneId}`}>{d.zoneName}</Link> · {t('season', { year: d.seasonYear })}
        </p>
        <Row><Badge data-testid="culture-status">{ts(d.c.status)}</Badge><Badge>{tm(d.c.method)}</Badge>{d.varietyStatus === 'pending' ? <Badge>{t('varietyPending')}</Badge> : null}{d.c.rotationOverride ? <Badge>{t('rotationOverride')}</Badge> : null}</Row>
        <Muted>{d.area.m2 !== null ? t(`area_${d.area.source}`, { m2: f.number(d.area.m2, { maximumFractionDigits: 2 }) }) : t('areaUnknown')}{d.totalKg > 0 ? ` · ${t('totalKg', { kg: f.number(d.totalKg, { maximumFractionDigits: 2 }) })}` : ''}</Muted>
      </section>
      <CultureActions gardenId={scope.gardenId} cultureId={cultureId} deleted={deleted} canDelete={can(scope, 'culture:delete', { isOwn: d.c.createdBy === scope.userId })} canEdit={canEdit} ended={['finished', 'failed', 'abandoned'].includes(d.c.status)} />
      {applied ? <Muted data-testid="culture-applied-guide"><Link href={`/app/guides/${applied.guideId}`}>{tg('appliedVersion', { title: applied.title, number: applied.number })}</Link></Muted> : null}
      {canApply ? (
        <ApplyGuideDialog triggerLabel={tg('applyTitle')} anchorLabel={tst('sowing')} today={today}
          options={guides.map((x) => ({ key: x.id, label: `${x.title} (${tg('versionShort', { number: x.number })})`, gardenId: scope.gardenId, cultureId, guideId: x.id, anchorLabel: tst(x.anchor === 'planting' ? 'planting' : 'sowing') }))} />
      ) : null}
      <StageTimeline stages={d.stages} />
      <nav className={styles.tabs} aria-label={t('tabs')}>
        {TABS.map((x) => <Link key={x} href={`${base}?onglet=${x}`} aria-current={tab === x ? 'page' : undefined}>{t(`tab_${x}`)}</Link>)}
      </nav>

      {tab === 'journal' ? (
        d.journal.length === 0 ? <Muted>{t('noJournal')}</Muted> : (
          <ul className={styles.entries} data-testid="journal">
            {d.journal.map((e) => (
              <li key={e.id} className={styles.entry} data-testid={`entry-${e.kind}`}>
                <div>
                  <strong>{f.dateTime(e.observedAt, { day: 'numeric', month: 'short' })}</strong>{' — '}
                  {e.kind === 'intervention' && e.intervention ? ti(e.intervention) : null}
                  {(e.kind === 'disease' || e.kind === 'pest') && e.problemId ? <Badge>{tDynamic(tp, problemCode.get(e.problemId) ?? 'other', e.problemOther ?? '')}</Badge> : null}
                  {e.body ? <p>{e.body}</p> : null}
                  {e.photos.length > 0 ? (
                    <div className={styles.photos}>
                      {e.photos.map((p) => <a key={p.id} href={`/api/files/${p.id}`}><img src={`/api/files/${p.id}`} alt={t('photoAlt', { date: f.dateTime(e.observedAt, { dateStyle: 'medium' }) })} width={p.width} height={p.height} loading="lazy" data-testid="journal-photo" /></a>)}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'recoltes' ? (
        d.harvests.length === 0 ? <Muted>{t('noHarvest')}</Muted> : (
          <Card>
            <ul data-testid="harvests">
              {d.harvests.map((h) => (
                <li key={h.id}>{fmtDay(h.harvestedOn)} · {f.number(h.quantity)} {tu(`unit_${h.unit}`)}{h.quantityKg !== null && h.unit !== 'kg' ? ` (${f.number(h.quantityKg, { maximumFractionDigits: 2 })} kg)` : ''}{h.seedSaving ? ` · ${t('seedSaving')}` : ''}</li>
              ))}
            </ul>
          </Card>
        )
      ) : null}

      {tab === 'taches' ? (
        <Stack gap="sm">
          {tickets.length === 0 ? <Muted>{t('noTickets')}</Muted> : (
            <ul className={ticketStyles.list}>{tickets.map((r) => <li key={r.id}><TicketCard gardenId={scope.gardenId} row={r} today={today} /></li>)}</ul>
          )}
          {can(scope, 'ticket:create') && !deleted ? <Link href={`/app/jardins/${scope.gardenId}/tickets/nouveau?culture=${cultureId}`}>{t('newTicket')}</Link> : null}
        </Stack>
      ) : null}

      {tab === 'etapes' ? (
        canEdit ? <StageEditor gardenId={scope.gardenId} cultureId={cultureId} stages={d.stages} today={today} zones={zones} currentZoneId={d.c.zoneId} readOnly={!canEdit} />
          : <Muted>{d.seasonStatus === 'closed' ? t('seasonClosed') : t('readOnly')}</Muted>
      ) : null}

      {canEdit && can(scope, 'journal:create') ? (
        <QuickCapture gardenId={scope.gardenId} cultureId={cultureId} title={label} problems={problems.map((p) => ({ code: p.code, category: p.category }))} triggerClassName={styles.fab} />
      ) : null}
    </Stack>
  );
}
