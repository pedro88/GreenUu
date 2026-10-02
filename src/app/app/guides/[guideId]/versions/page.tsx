import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { NativeSelect } from '@/components/ui/Field';
import { Card, Muted, PageHeader, Row, Stack } from '@/components/ui/Layout';
import { compareVersions, guideVersions } from '@/features/guide/queries';
import styles from '@/features/guide/ui/Content.module.scss';
import { DiffView } from '@/features/guide/ui/DiffView';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('guides'))('versionsTitle') };
}

const toInt = (v: unknown) => (typeof v === 'string' && /^\d{1,4}$/.test(v) ? Number(v) : null);

/** Historique d'un guide (PAGES.md §5) : versions immuables et comparaison (RG-GUI-06). */
export default async function GuideVersionsPage({ params, searchParams }: PageProps<'/app/guides/[guideId]/versions'>) {
  const u = await requireUser();
  const { guideId } = await params;
  if (!uuidSchema.safeParse(guideId).success) notFound();
  const sp = await searchParams;
  const onNotFound = (e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  };
  const { guide, versions } = await guideVersions(db(), u, guideId).catch(onNotFound);
  const t = await getTranslations('guides');
  const f = await getFormatter();
  const latest = versions[0]?.number ?? 1;
  const from = toInt(sp.de) ?? Math.max(1, latest - 1);
  const to = toInt(sp.a) ?? latest;
  const diff = versions.length > 1 && from !== to ? await compareVersions(db(), u, guideId, from, to).catch(onNotFound) : null;
  return (
    <Stack gap="lg">
      <PageHeader title={t('versionsTitle')} subtitle={<Link href={`/app/guides/${guide.id}`}>{t('back')}</Link>} />
      <Card>
        <ol reversed className={styles.list} data-testid="guide-version-list">
          {versions.map((v) => (
            <li key={v.id}><strong>{t('versionShort', { number: v.number })}</strong> · {f.dateTime(v.publishedAt, { dateStyle: 'medium' })} · {v.changeNote ?? t('noChangeNote')}</li>
          ))}
        </ol>
      </Card>
      {versions.length > 1 ? (
        <form method="get" data-testid="guide-compare">
          <Row>
            <label htmlFor="de">{t('compareFrom')}</label>
            <NativeSelect id="de" name="de" defaultValue={String(from)}>{versions.map((v) => <option key={v.number} value={v.number}>{t('versionShort', { number: v.number })}</option>)}</NativeSelect>
            <label htmlFor="a">{t('compareTo')}</label>
            <NativeSelect id="a" name="a" defaultValue={String(to)}>{versions.map((v) => <option key={v.number} value={v.number}>{t('versionShort', { number: v.number })}</option>)}</NativeSelect>
            <Button type="submit" variant="secondary">{t('compare')}</Button>
          </Row>
        </form>
      ) : null}
      {diff ? (
        <Stack>
          <h2>{t('diffBody')}</h2>
          <DiffView lines={diff.body} addedLabel={t('diffAdded')} removedLabel={t('diffRemoved')} testId="diff-body" />
          <h2>{t('diffContext')}</h2>
          {diff.context.every((l) => l.kind === 'same') ? <Muted>{t('noDiff')}</Muted> : <DiffView lines={diff.context} addedLabel={t('diffAdded')} removedLabel={t('diffRemoved')} testId="diff-context" />}
          <h2>{t('diffCalendar')}</h2>
          {diff.calendar.every((l) => l.kind === 'same') ? <Muted>{t('noDiff')}</Muted> : <DiffView lines={diff.calendar} addedLabel={t('diffAdded')} removedLabel={t('diffRemoved')} testId="diff-calendar" />}
        </Stack>
      ) : null}
    </Stack>
  );
}
