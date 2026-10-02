import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { NativeSelect } from '@/components/ui/Field';
import { Muted, PageHeader, Row, Stack } from '@/components/ui/Layout';
import styles from '@/features/guide/ui/Content.module.scss';
import { KnowledgeTabs } from '@/features/guide/ui/KnowledgeTabs';
import { ReportDialog } from '@/features/moderation/ui/ReportDialog';
import { listSpecies } from '@/features/plant/service';
import { tipFiltersSchema } from '@/features/tip/schema';
import { gardenContext, myGardensForContext, popularTags, tipFeed } from '@/features/tip/service';
import { TipComposer } from '@/features/tip/ui/TipComposer';
import { TipVotes } from '@/features/tip/ui/TipVotes';
import { tDynamic } from '@/i18n/dynamic';
import { ENVIRONMENTS } from '@/lib/enums';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('tips'))('title') };
}

/** Fil de tips (PAGES.md §5, maquette « Tips ») : proches de mon contexte, votes, filtres, création rapide. */
export default async function TipsPage({ searchParams }: PageProps<'/app/tips'>) {
  const u = await requireUser();
  const t = await getTranslations('tips');
  const te = await getTranslations('environments');
  const raw = await searchParams;
  const parsed = tipFiltersSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v : undefined])));
  const f = parsed.success ? parsed.data : {};
  const gardens = await myGardensForContext(db(), u.id);
  const contextGarden = gardens.find((g) => g.id === f.jardin) ?? gardens[0] ?? null;
  const context = contextGarden ? await gardenContext(db(), contextGarden.id) : null;
  const [feed, tags, species] = await Promise.all([
    tipFeed(db(), u, { tag: f.tag, speciesId: f.espece, environment: f.env }, context),
    popularTags(db()),
    listSpecies(db()),
  ]);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ ...f, ...patch }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return q.size ? `/app/tips?${q.toString()}` : '/app/tips';
  };
  return (
    <Stack gap="lg">
      <KnowledgeTabs active="tips" />
      <PageHeader title={t('title')} actions={<TipComposer gardens={gardens} species={species.map((s) => ({ id: s.id, name: s.names.fr[0] ?? s.latinName }))} defaultGardenId={contextGarden?.id ?? null} />} />
      <ul className={styles.chips} aria-label={t('filterTag')}>
        <li><Link className={styles.chip} href={href({ tag: undefined })} aria-current={f.tag ? undefined : 'true'}>{t('near')}</Link></li>
        {tags.map((tag) => <li key={tag}><Link className={styles.chip} href={href({ tag })} aria-current={f.tag === tag ? 'true' : undefined} data-testid={`tip-tag-${tag}`}>{tag}</Link></li>)}
      </ul>
      <form method="get" data-testid="tip-filters">
        <Row>
          {f.tag ? <input type="hidden" name="tag" value={f.tag} /> : null}
          {gardens.length > 1 ? (
            <>
              <label htmlFor="tip-jardin">{t('context')}</label>
              <NativeSelect id="tip-jardin" name="jardin" defaultValue={contextGarden?.id ?? ''}>{gardens.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect>
            </>
          ) : null}
          <label htmlFor="tip-env">{t('filterEnvironment')}</label>
          <NativeSelect id="tip-env" name="env" defaultValue={f.env ?? ''}>
            <option value="">{t('anyEnvironment')}</option>
            {ENVIRONMENTS.map((e) => <option key={e} value={e}>{tDynamic(te, e, e)}</option>)}
          </NativeSelect>
          <Button type="submit" variant="secondary">{t('filterTag')}</Button>
        </Row>
      </form>
      {feed.length === 0 ? <Muted>{t('empty')}</Muted> : (
        <ul className={styles.list} data-testid="tip-feed">
          {feed.map((tip) => (
            <li key={tip.id} className={styles.item} data-testid={`tip-${tip.id}`}>
              <Row>
                <strong><Link href={`/app/jardiniers/${encodeURIComponent(tip.authorPseudo ?? '')}`}>{tip.authorPseudo}</Link></strong>
                <span className={styles.meta}>{[tip.koppen, tip.environment ? tDynamic(te, tip.environment, tip.environment) : null].filter(Boolean).join(' · ')}</span>
              </Row>
              <p style={{ margin: 0 }}>{tip.body}</p>
              <Row>
                <ul className={styles.chips}>{tip.tags.map((tag) => <li key={tag}><Link className={styles.chip} href={href({ tag })}>{tag}</Link></li>)}</ul>
                <TipVotes tipId={tip.id} useful={tip.useful} notUseful={tip.notUseful} myVote={tip.myVote} own={tip.authorId === u.id} />
                {tip.authorId !== u.id ? <ReportDialog target={{ kind: 'tip', id: tip.id }} label={t('report')} /> : null}
              </Row>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
