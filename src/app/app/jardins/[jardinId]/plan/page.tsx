import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { decorCatalogFor } from '@/features/decor/service';
import { sceneSnapshot } from '@/features/scene/snapshot';
import { zoneTypeOptions } from '@/features/zone/queries';
import { PlanEditor } from '@/game/PlanEditor';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('plan'))('title') };
}

/**
 * Éditeur de plan (PAGES.md §4 `/plan`, SPEC §9.7). Tout membre peut l'ouvrir ; sans `plan:edit`, les outils sont
 * désactivés avec une explication, et l'action refuse les commandes (PLN-06).
 */
export default async function PlanPage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/plan'>) {
  const { jardinId } = await params;
  const sp = await searchParams;
  const scope = await requireGardenScope(jardinId);
  const u = await requireUser();
  const t = await getTranslations('plan');
  const scene = typeof sp.scene === 'string' && uuidSchema.safeParse(sp.scene).success ? sp.scene : null;
  const [snapshot, types, decorCatalog] = await Promise.all([
    sceneSnapshot(db(), scope, { userId: u.id, sceneZoneId: scene, now: appClock().now() }).catch((e: unknown) => { if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound(); throw e; }),
    zoneTypeOptions(db(), scope),
    decorCatalogFor(db(), u.id),
  ]);
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} />
      <PlanEditor snapshot={snapshot} zoneTypes={types.map((z) => ({ id: z.id, code: z.code, label: z.label, isCustom: z.isCustom, hasInteriorDefault: z.hasInteriorDefault, canHostCultures: z.canHostCultures }))} decorCatalog={decorCatalog} />
    </Stack>
  );
}
