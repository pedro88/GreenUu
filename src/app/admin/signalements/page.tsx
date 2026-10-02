import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, Card, Muted, PageHeader, Row, Stack } from '@/components/ui/Layout';
import { openReportQueue } from '@/features/moderation/service';
import { DecisionButtons } from '@/features/moderation/ui/DecisionButtons';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('moderation'))('reportsTitle') };
}

/** Signalements (PAGES.md §8) : guides, tips, profils, un élément par contenu (RG-MOD-01 à 03). */
export default async function AdminReportsPage() {
  const u = await requireUser();
  const t = await getTranslations('moderation');
  const tr = await getTranslations('reportReasons');
  const f = await getFormatter();
  const queue = await openReportQueue(db(), u);
  return (
    <Stack gap="lg">
      <PageHeader title={t('reportsTitle')} />
      {queue.length === 0 ? <Card><Muted>{t('reportsEmpty')}</Muted></Card> : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="report-queue">
          {queue.map((q) => (
            <li key={`${q.target.kind}-${q.target.id}`} data-testid={`report-item-${q.target.id}`}>
              <Card>
                <Stack gap="sm">
                  <Row>
                    <Badge>{t(`kind_${q.target.kind}`)}</Badge>
                    <strong>{q.label}</strong>
                    {q.hidden ? <Badge>{t('hiddenNow')}</Badge> : null}
                  </Row>
                  <Muted>{t('reportCount', { count: q.reports })} · {q.reasons.map((r) => tr(r)).join(', ')} · {f.relativeTime(q.lastAt)}</Muted>
                  <DecisionButtons target={q.target} />
                </Stack>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
