import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Card, PageHeader, Stack } from '@/components/ui/Layout';
import { listProblems } from '@/features/journal/queries';
import { resultForm, sharingState } from '@/features/result/service';
import { ResultForm } from '@/features/result/ui/ResultForm';
import { tDynamic } from '@/i18n/dynamic';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { can } from '@/server/authz/scope';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('results'))('title') };
}

/** Bilan de fin de culture (PAGES.md §4, RG-RES-01 à 04). L'XP mise en avant arrive au lot 6. */
export default async function ResultPage({ params }: PageProps<'/app/jardins/[jardinId]/cultures/[cultureId]/bilan'>) {
  const { jardinId, cultureId } = await params;
  const scope = await requireGardenScope(jardinId);
  if (!uuidSchema.safeParse(cultureId).success) notFound();
  const form = await resultForm(db(), scope, cultureId).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const t = await getTranslations('results');
  const tp = await getTranslations('problems');
  const [problems, shared] = await Promise.all([listProblems(db()), sharingState(db(), scope.gardenId)]);
  const label = [form.detail.sp.commonNames.fr[0], form.detail.varietyName].filter(Boolean).join(' ');
  const r = form.existing;
  const back = `/app/jardins/${scope.gardenId}/cultures/${cultureId}`;
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} subtitle={<Link href={back}>{label}</Link>} />
      {!form.available ? <Alert tone="info">{t('notYet')}</Alert> : !can(scope, 'result:submit') ? null : (
        <Card>
          <ResultForm gardenId={scope.gardenId} cultureId={cultureId} areaKnown={form.prefill.areaM2 !== null} shared={shared}
            problems={problems.map((p) => ({ id: p.id, label: tDynamic(tp, p.code, p.code) }))}
            initial={{
              totalKg: form.prefill.totalKg, noHarvest: r?.noHarvest ?? false, quality: r?.quality ?? null, successPct: r?.successPct ?? null, rating: r?.rating ?? null,
              wouldGrowAgain: r?.wouldGrowAgain ?? null, problems: form.problems, noProblem: r ? r.problemsReviewed && form.problems.length === 0 : false, notes: r?.notes ?? '',
            }} />
        </Card>
      )}
    </Stack>
  );
}
