import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { listConsents } from '@/features/account/service';
import { latestExport } from '@/features/privacy/service';
import { DeletionRequest, ExportRequest } from '@/features/privacy/ui/PrivacyControls';
import { appClock } from '@/server/clock';
import Link from 'next/link';

export async function generateMetadata() {
  return { title: (await getTranslations('privacy'))('title') };
}

/** Confidentialité (PAGES.md §7, SPEC §11) : consentements, export et suppression du compte. */
export default async function PrivacyPage() {
  const u = await requireUser();
  const t = await getTranslations('privacy');
  const f = await getFormatter();
  const [rows, last] = await Promise.all([listConsents(db(), u.id), latestExport(db(), u.id, appClock().now())]);
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
      <Card>
        <Stack gap="sm">
          <h2>{t('exportTitle')}</h2>
          <Muted>{t('exportIntro')}</Muted>
          {last ? <p data-testid="export-ready">{t('exportReady', { date: f.dateTime(last.expiresAt, { dateStyle: 'medium' }) })} <Link href={`/app/parametres/confidentialite/export/${last.id}`} prefetch={false}>{t('exportDownload')}</Link></p> : null}
          <ExportRequest />
        </Stack>
      </Card>
      <Card>
        <Stack gap="sm">
          <h2>{t('deleteTitle')}</h2>
          <Muted>{t('deleteIntro')}</Muted>
          <DeletionRequest />
        </Stack>
      </Card>
    </Stack>
  );
}
