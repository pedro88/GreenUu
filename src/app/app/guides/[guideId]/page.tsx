import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { Card, Muted, Stack } from '@/components/ui/Layout';
import { Markdown } from '@/components/ui/Markdown';
import { applicableCultures, guideDetail } from '@/features/guide/queries';
import { publicForkCount } from '@/features/guide/service';
import { ApplyGuideDialog } from '@/features/guide/ui/ApplyGuideDialog';
import styles from '@/features/guide/ui/Content.module.scss';
import { ForkButton, PublishButton } from '@/features/guide/ui/GuideActions';
import { ReportDialog } from '@/features/moderation/ui/ReportDialog';
import { tDynamic } from '@/i18n/dynamic';
import { localDate } from '@/lib/dates';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

async function load(guideId: string) {
  const u = await requireUser();
  if (!uuidSchema.safeParse(guideId).success) notFound();
  const d = await guideDetail(db(), u, guideId).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  return { u, d };
}

export async function generateMetadata({ params }: PageProps<'/app/guides/[guideId]'>) {
  const { d } = await load((await params).guideId);
  return { title: d.version?.title ?? d.guide.draft.title, robots: d.guide.visibility === 'public' ? undefined : { index: false } };
}

/** Lecture d'un guide (PAGES.md §5, maquette « Réussir ses fraisiers ») : contenu, contexte, versions, appliquer, forker. */
export default async function GuidePage({ params }: PageProps<'/app/guides/[guideId]'>) {
  const { guideId } = await params;
  const { u, d } = await load(guideId);
  const t = await getTranslations('guides');
  const te = await getTranslations('environments');
  const ts = await getTranslations('stages');
  const f = await getFormatter();
  const g = d.guide;
  const v = d.version;
  const [forks, cultures] = await Promise.all([
    publicForkCount(db(), g.id),
    v ? applicableCultures(db(), u.id, g.speciesId, g.visibility === 'private' ? g.gardenId : null) : Promise.resolve([]),
  ]);
  const context = v?.context ?? g.draft.context;
  const anchor = v?.calendarTemplate?.anchor ?? 'sowing';
  return (
    <Stack gap="lg">
      <Card>
        <Stack gap="sm">
          <h1 data-testid="guide-title">{v?.title ?? g.draft.title}</h1>
          <p className={styles.meta}>
            {t('byAuthor', { pseudo: d.authorPseudo })} · {d.speciesName}{d.varietyName ? ` ${d.varietyName}` : ''}
            {v ? <> · <span data-testid="guide-version">{t('versionShort', { number: v.number })}</span> · {t('updatedOn', { date: f.dateTime(v.publishedAt, { dateStyle: 'medium' }) })}</> : null}
          </p>
          {d.origin ? (
            <p className={styles.meta} data-testid="guide-origin">
              {d.origin.readable && d.origin.guideId ? <Link href={`/app/guides/${d.origin.guideId}`}>{t('adaptedFrom', { title: d.origin.title ?? '', number: d.origin.number })}</Link> : t('originPrivate', { number: d.origin.number })}
            </p>
          ) : null}
          <ul className={styles.chips}>
            {(context.koppen ?? []).map((k) => <li key={k} className={styles.chip}>{k}</li>)}
            {(context.environments ?? []).map((e) => <li key={e} className={styles.chip}>{tDynamic(te, e, e)}</li>)}
          </ul>
        </Stack>
      </Card>
      {g.hiddenByModeration ? <Alert tone="warning">{t('hidden')}</Alert> : null}
      {!v ? <Alert tone="info">{t('unpublished')}</Alert> : null}
      {d.isAuthor && v && JSON.stringify({ t: g.draft.title, b: g.draft.bodyMd, c: g.draft.context, k: g.draft.calendarTemplate }) !== JSON.stringify({ t: v.title, b: v.bodyMd, c: v.context, k: v.calendarTemplate })
        ? <Muted>{t('draftChanges')}</Muted> : null}
      <Card><Markdown>{v?.bodyMd ?? g.draft.bodyMd}</Markdown></Card>
      {v?.calendarTemplate ? (
        <Card>
          <h2>{t('calendar')}</h2>
          <ul data-testid="guide-calendar">
            <li>{ts(v.calendarTemplate.anchor)} : J</li>
            {v.calendarTemplate.stages.map((s) => <li key={s.stage}>{ts(s.stage)} : J{s.offsetDays >= 0 ? '+' : ''}{s.offsetDays}</li>)}
            {v.calendarTemplate.tasks.map((x, i) => <li key={i}>{x.title} — {ts(x.relativeTo)} {x.offsetDays >= 0 ? '+' : ''}{x.offsetDays} j</li>)}
          </ul>
        </Card>
      ) : null}
      <p className={styles.meta}>
        <span data-testid="guide-forks">{t('forks', { count: forks })}</span> · {t('gardensUsing', { count: d.gardensUsing })}
      </p>
      <div className={styles.actions}>
        {v && cultures.length > 0 ? (
          <ApplyGuideDialog triggerLabel={t('apply')} anchorLabel={ts(anchor)} today={localDate(appClock().now(), u.timezone)}
            options={cultures.map((c) => ({ key: c.cultureId, label: `${c.gardenName} · ${d.speciesName} ${c.label}`, gardenId: c.gardenId, cultureId: c.cultureId, guideId: g.id }))} />
        ) : null}
        {v && !d.isAuthor ? <ForkButton guideId={g.id} /> : null}
        {d.isAuthor ? <LinkButton variant="secondary" href={`/app/guides/${g.id}/edition`} data-testid="guide-edit">{t('edit')}</LinkButton> : null}
        {d.isAuthor ? <PublishButton guideId={g.id} /> : null}
        {v ? <LinkButton variant="secondary" href={`/app/guides/${g.id}/versions`} data-testid="guide-versions">{t('versions')}</LinkButton> : null}
        {!d.isAuthor && v ? <ReportDialog target={{ kind: 'guide', id: g.id }} label={t('report')} /> : null}
      </div>
    </Stack>
  );
}
