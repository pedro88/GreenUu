import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { ledgerOf, progressOf } from '@/features/progression/service';
import { tDynamic } from '@/i18n/dynamic';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('profile'))('xpTitle') };
}

/** Journal d'XP (PAGES.md §6) : gains, plafonds et annulations présentés de façon neutre (§8.1). */
export default async function XpPage() {
  const u = await requireUser();
  const t = await getTranslations('profile');
  const tc = await getTranslations('xpCodes');
  const tr = await getTranslations('xpReasons');
  const f = await getFormatter();
  const [p, rows] = await Promise.all([progressOf(db(), u.id), ledgerOf(db(), u.id)]);
  return (
    <Stack gap="lg">
      <PageHeader title={t('xpTitle')} subtitle={t('xpIntro')} />
      <Card><strong data-testid="xp-total">{t('xp', { xp: p.totalXp })}</strong></Card>
      {rows.length === 0 ? <Muted>{t('xpEmpty')}</Muted> : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="xp-ledger">
          {rows.map((r) => (
            <li key={r.id} data-code={r.code} data-reason={r.reason}>
              <strong>{r.amount > 0 ? `+${r.amount}` : r.amount}</strong> · {tDynamic(tc, r.code.replaceAll('.', '_'), r.code)}
              {tDynamic(tr, r.reason, '') ? ` (${tDynamic(tr, r.reason, '')})` : ''} · <small>{f.dateTime(r.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}{r.gardenName ? ` · ${r.gardenName}` : ''}</small>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
