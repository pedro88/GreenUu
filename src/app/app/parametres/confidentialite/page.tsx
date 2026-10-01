import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { listConsents } from '@/features/account/service';

export async function generateMetadata() {
  return { title: (await getTranslations('privacy'))('title') };
}

/** Lot 1 : consentements tracés. Partage des résultats, export et suppression : lot 5 (SPEC §11). */
export default async function PrivacyPage() {
  const u = await requireUser();
  const t = await getTranslations('privacy');
  const f = await getFormatter();
  const rows = await listConsents(db(), u.id);
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} />
      <Card>
        <Stack gap="sm">
          <h2>{t('consentsTitle')}</h2>
          <ul>
            {rows.map((c) => (
              <li key={c.id}>{t(`consent_${c.kind}`)} · {c.version} · {f.dateTime(c.grantedAt, { dateStyle: 'medium' })}{c.revokedAt ? ` · ${t('revoked')}` : ''}</li>
            ))}
          </ul>
        </Stack>
      </Card>
      <Muted>{t('comingSoon')}</Muted>
    </Stack>
  );
}
