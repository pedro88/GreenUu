import { eq } from 'drizzle-orm';
import { createCulture, recordStage } from '../src/features/culture/service';
import { recordHarvest } from '../src/features/harvest/service';
import { createJournalEntry } from '../src/features/journal/service';
import { speciesRefId, varietyRefId } from '../src/features/plant/reference/load';
import type { Actor, ScopedCtx } from '../src/server/action-core';
import { loadScope } from '../src/server/authz/scope';
import { fixedClock } from '../src/server/clock';
import type { Tx } from '../src/server/db/client';
import { culture, season, user } from '../src/server/db/schema';
import type { HarvestUnit, Method, Stage } from '../src/lib/enums';

/**
 * Historique de cultures sur trois saisons (SPEC §14), créé via les services pour rester cohérent
 * (statuts, occupation, saisons). Dates relatives à l'année de référence ; rien n'est daté après `ref`.
 */
type C = {
  zone: string; species: string; variety?: string; method: Method; anchor: string; author: string;
  actual?: Partial<Record<Stage, string>>; harvests?: [string, number, HarvestUnit][]; notes?: [string, string][]; pest?: [string, string];
  ack?: boolean; moveTo?: string; areaM2?: number;
};

export async function seedCultures(tx: Tx, ref: Date, ids: { gardenId: (k: string) => string; zoneId: (g: string, z: string) => string; userId: (k: string) => string }) {
  const Y = ref.getFullYear();
  const refIso = ref.toISOString().slice(0, 10);
  const d = (offset: number, md: string) => `${Y + offset}-${md}`;
  const plan: Record<string, C[]> = {
    tilleuls: [
      { zone: 'p1', species: 'tomate', variety: 'Cœur de bœuf', method: 'bought_plants', anchor: d(-2, '05-15'), author: 'alice', actual: { planting: d(-2, '05-16'), flowering: d(-2, '06-20'), harvest_start: d(-2, '07-25'), harvest_end: d(-2, '09-30'), end: d(-2, '10-05') }, harvests: [[d(-2, '08-05'), 3.2, 'kg'], [d(-2, '08-25'), 4.1, 'kg'], [d(-2, '09-15'), 2.6, 'kg']], pest: ['aphids', d(-2, '07-02')] },
      { zone: 'p2', species: 'haricot', variety: 'Contender', method: 'direct_sowing', anchor: d(-2, '05-20'), author: 'alice', actual: { sowing: d(-2, '05-20'), emergence: d(-2, '05-30'), harvest_start: d(-2, '07-20'), harvest_end: d(-2, '08-30'), end: d(-2, '09-01') }, harvests: [[d(-2, '07-28'), 1.4, 'kg'], [d(-2, '08-15'), 1.9, 'kg']] },
      { zone: 'p3', species: 'carotte', variety: 'Nantaise', method: 'direct_sowing', anchor: d(-2, '04-01'), author: 'alice', actual: { sowing: d(-2, '04-02'), emergence: d(-2, '04-18'), harvest_start: d(-2, '07-01'), harvest_end: d(-2, '08-15'), end: d(-2, '08-16') }, harvests: [[d(-2, '07-10'), 2.5, 'kg'], [d(-2, '08-10'), 3, 'kg']] },
      { zone: 'p4', species: 'pomme-de-terre', variety: 'Charlotte', method: 'bulb_tuber', anchor: d(-2, '04-10'), author: 'alice', actual: { planting: d(-2, '04-10'), emergence: d(-2, '05-02'), flowering: d(-2, '06-15'), harvest_start: d(-2, '07-25'), harvest_end: d(-2, '08-05'), end: d(-2, '08-05') }, harvests: [[d(-2, '08-02'), 12, 'kg']] },
      { zone: 'bac1', species: 'laitue', variety: 'Batavia blonde', method: 'bought_plants', anchor: d(-2, '04-15'), author: 'alice', actual: { planting: d(-2, '04-15'), harvest_start: d(-2, '05-25'), harvest_end: d(-2, '06-15'), end: d(-2, '06-16') }, harvests: [[d(-2, '06-01'), 8, 'unit']] },
      { zone: 'fruits', species: 'fraisier', variety: 'Gariguette', method: 'bought_plants', anchor: d(-2, '09-10'), author: 'alice', actual: { planting: d(-2, '09-10') }, harvests: [[d(-1, '06-05'), 1.2, 'kg'], [d(0, '06-02'), 1.6, 'kg']] },
      { zone: 'p1', species: 'chou', variety: 'Milan de Pontoise', method: 'bought_plants', anchor: d(-1, '05-01'), author: 'alice', actual: { planting: d(-1, '05-02'), harvest_start: d(-1, '09-20'), harvest_end: d(-1, '10-20'), end: d(-1, '10-21') }, harvests: [[d(-1, '10-01'), 5, 'unit']], pest: ['cabbage_white', d(-1, '07-10')] },
      { zone: 'p2', species: 'tomate', variety: 'Marmande', method: 'bought_plants', anchor: d(-1, '05-18'), author: 'alice', actual: { planting: d(-1, '05-18'), flowering: d(-1, '06-22'), harvest_start: d(-1, '07-28'), harvest_end: d(-1, '09-25'), end: d(-1, '10-01') }, harvests: [[d(-1, '08-10'), 4.4, 'kg'], [d(-1, '09-05'), 3.8, 'kg']], pest: ['mildew', d(-1, '08-20')] },
      { zone: 'p3', species: 'haricot', variety: 'Coco de Paimpol', method: 'direct_sowing', anchor: d(-1, '05-22'), author: 'alice', actual: { sowing: d(-1, '05-22'), emergence: d(-1, '06-01'), harvest_start: d(-1, '08-01'), harvest_end: d(-1, '09-10'), end: d(-1, '09-12') }, harvests: [[d(-1, '08-20'), 1.7, 'kg']] },
      { zone: 'p4', species: 'carotte', variety: 'Chantenay', method: 'direct_sowing', anchor: d(-1, '04-05'), author: 'alice', actual: { sowing: d(-1, '04-05'), emergence: d(-1, '04-20'), harvest_start: d(-1, '07-05'), harvest_end: d(-1, '08-20'), end: d(-1, '08-20') }, harvests: [[d(-1, '07-20'), 3.4, 'kg']] },
      { zone: 'bac2', species: 'basilic', variety: 'Grand vert', method: 'bought_plants', anchor: d(-1, '05-20'), author: 'alice', actual: { planting: d(-1, '05-20'), harvest_start: d(-1, '06-25'), harvest_end: d(-1, '09-15'), end: d(-1, '09-20') }, harvests: [[d(-1, '07-15'), 6, 'bunch']] },
      // Saison en cours : retour des solanacées sur la Planche 1 deux ans après la tomate (alerte de rotation confirmée).
      { zone: 'p1', species: 'tomate', variety: 'Noire de Crimée', method: 'bought_plants', anchor: d(0, '05-16'), author: 'alice', ack: true, actual: { planting: d(0, '05-17'), flowering: d(0, '06-18'), harvest_start: d(0, '07-24') }, harvests: [[d(0, '08-02'), 2.1, 'kg'], [d(0, '08-20'), 3.5, 'kg'], [d(0, '09-12'), 2.8, 'kg']], notes: [[d(0, '06-18'), 'Premières fleurs, beau feuillage.']] },
      { zone: 'p2', species: 'courgette', variety: 'Verte des maraîchers', method: 'bought_plants', anchor: d(0, '05-20'), author: 'alice', actual: { planting: d(0, '05-20'), flowering: d(0, '06-15'), harvest_start: d(0, '07-01'), harvest_end: d(0, '09-20'), end: d(0, '09-25') }, harvests: [[d(0, '07-10'), 12, 'unit'], [d(0, '08-01'), 18, 'unit']] },
      { zone: 'p3', species: 'oignon', variety: 'Jaune paille des vertus', method: 'bulb_tuber', anchor: d(0, '03-20'), author: 'alice', actual: { planting: d(0, '03-21'), emergence: d(0, '04-10'), harvest_start: d(0, '07-20'), harvest_end: d(0, '08-01'), end: d(0, '08-01') }, harvests: [[d(0, '07-25'), 4.2, 'kg']] },
      { zone: 'p4', species: 'mache', variety: 'Verte de Cambrai', method: 'direct_sowing', anchor: d(0, '09-05'), author: 'alice', actual: { sowing: d(0, '09-05'), emergence: d(0, '09-15') } },
      { zone: 'bac3', species: 'radis', variety: 'Flamboyant', method: 'direct_sowing', anchor: d(0, '09-10'), author: 'alice', actual: { sowing: d(0, '09-10') } },
    ],
    canal: [
      { zone: 'a1', species: 'tomate', variety: 'Saint-Pierre', method: 'bought_plants', anchor: d(0, '05-15'), author: 'david', actual: { planting: d(0, '05-15'), harvest_start: d(0, '07-25') }, harvests: [[d(0, '08-10'), 5.5, 'kg']] },
      { zone: 'a2', species: 'courgette', variety: 'Ronde de Nice', method: 'bought_plants', anchor: d(0, '05-18'), author: 'chloe', actual: { planting: d(0, '05-18'), harvest_start: d(0, '07-05') }, harvests: [[d(0, '07-20'), 9, 'unit']] },
      { zone: 'b1', species: 'haricot', variety: 'Beurre de Rocquencourt', method: 'direct_sowing', anchor: d(0, '05-25'), author: 'emma', actual: { sowing: d(0, '05-25'), emergence: d(0, '06-04'), harvest_start: d(0, '07-25'), harvest_end: d(0, '09-01'), end: d(0, '09-02') }, harvests: [[d(0, '08-05'), 2.2, 'kg']] },
      // RES-01 : culture terminée, 3 récoltes (4,2 kg en tout) sur 3 m², sans bilan.
      { zone: 'b2', species: 'haricot', variety: 'Contender', method: 'direct_sowing', anchor: d(0, '05-10'), author: 'david', areaM2: 3, actual: { sowing: d(0, '05-10'), emergence: d(0, '05-20'), harvest_start: d(0, '07-10'), harvest_end: d(0, '08-20'), end: d(0, '08-25') }, harvests: [[d(0, '07-15'), 1.2, 'kg'], [d(0, '07-30'), 1.6, 'kg'], [d(0, '08-15'), 1.4, 'kg']] },
      { zone: 'd1', species: 'carotte', variety: 'Touchon', method: 'direct_sowing', anchor: d(0, '04-10'), author: 'emma', actual: { sowing: d(0, '04-10'), emergence: d(0, '04-28') } },
      { zone: 't1-b1', species: 'basilic', variety: 'Pourpre', method: 'tray_sowing', anchor: d(0, '04-01'), author: 'david', actual: { sowing: d(0, '04-01'), emergence: d(0, '04-09'), transplanting: d(0, '04-25') } },
      { zone: 't1-b2', species: 'poivron', variety: 'Corno di toro', method: 'bought_plants', anchor: d(0, '05-05'), author: 'emma', actual: { planting: d(0, '05-05'), flowering: d(0, '06-10'), fruiting: d(0, '07-05'), harvest_start: d(0, '08-01') }, harvests: [[d(0, '08-20'), 14, 'unit']] },
    ],
    combes: [
      { zone: 's1-1', species: 'tomate', variety: 'Cerise rouge', method: 'tray_sowing', anchor: d(0, '02-20'), author: 'gaelle', actual: { sowing: d(0, '02-20'), emergence: d(0, '02-28'), transplanting: d(0, '03-15'), planting: d(0, '04-15'), harvest_start: d(0, '06-20') }, harvests: [[d(0, '07-01'), 18, 'kg'], [d(0, '08-01'), 26, 'kg']] },
      { zone: 't1-1', species: 'concombre', variety: 'Marketmore', method: 'bought_plants', anchor: d(0, '04-20'), author: 'gaelle', actual: { planting: d(0, '04-20'), harvest_start: d(0, '06-10'), harvest_end: d(0, '08-31'), end: d(0, '09-02') }, harvests: [[d(0, '06-25'), 40, 'unit'], [d(0, '07-25'), 55, 'unit']] },
      { zone: 'plaque1', species: 'laitue', variety: 'Feuille de chêne', method: 'tray_sowing', anchor: d(0, '09-01'), author: 'gaelle', actual: { sowing: d(0, '09-01'), emergence: d(0, '09-07') }, moveTo: 's1-2' },
    ],
  };

  for (const [gardenKey, cultures] of Object.entries(plan)) {
    const gardenId = ids.gardenId(gardenKey);
    const [existing] = await tx.select({ id: culture.id }).from(culture).where(eq(culture.gardenId, gardenId)).limit(1);
    if (existing) continue;
    for (const c of cultures) {
      if (c.anchor > refIso) continue;
      const ctx = await ctxFor(tx, gardenId, ids.userId(c.author), new Date(`${c.anchor}T09:00:00Z`));
      const { cultureId } = await createCulture(ctx, {
        gardenId, zoneId: ids.zoneId(gardenKey, c.zone), speciesId: speciesRefId(c.species), varietyId: c.variety ? varietyRefId(c.species, c.variety) : undefined,
        method: c.method, anchorDate: c.anchor, seedSource: 'bought', plannedDates: {}, acknowledgeRotation: c.ack ?? false, ...(c.areaM2 ? { areaM2: c.areaM2 } : {}),
      });
      const later = await ctxFor(tx, gardenId, ids.userId(c.author), ref);
      for (const [stage, on] of Object.entries(c.actual ?? {}) as [Stage, string][]) { // as: clés issues du type Partial<Record<Stage, string>>
        if (on <= refIso) await recordStage(later, { gardenId, cultureId, stage, actualOn: on });
      }
      for (const [on, quantity, unit] of c.harvests ?? []) {
        if (on <= refIso) await recordHarvest(await ctxFor(tx, gardenId, ids.userId(c.author), new Date(`${on}T18:00:00Z`)), { gardenId, cultureId, harvestedOn: on, quantity, unit, seedSaving: false });
      }
      for (const [on, body] of c.notes ?? []) {
        if (on <= refIso) await createJournalEntry(await ctxFor(tx, gardenId, ids.userId(c.author), new Date(`${on}T18:00:00Z`)), { gardenId, cultureId, kind: 'note', body, observedAt: `${on}T17:00:00Z`, attachmentIds: [] });
      }
      if (c.pest && c.pest[1] <= refIso) {
        const kind = ['mildew', 'powdery_mildew', 'rust'].includes(c.pest[0]) ? 'disease' : 'pest';
        await createJournalEntry(await ctxFor(tx, gardenId, ids.userId(c.author), new Date(`${c.pest[1]}T18:00:00Z`)), { gardenId, cultureId, kind, problemCode: c.pest[0], severity: 2, observedAt: `${c.pest[1]}T17:00:00Z`, attachmentIds: [] });
      }
    }
  }
}

async function ctxFor(tx: Tx, gardenId: string, userId: string, at: Date): Promise<ScopedCtx> {
  const scope = await loadScope(tx, userId, gardenId);
  if (!scope) throw new Error(`seed : ${userId} n'est pas membre de ${gardenId}`);
  const [u] = await tx.select().from(user).where(eq(user.id, userId)).limit(1);
  const actor: Actor = { id: userId, email: u?.email ?? '', name: u?.name ?? '', emailVerified: true, platformRole: 'user', timezone: 'Europe/Brussels' };
  return { tx, scope, actor, clock: fixedClock(at), jobs: { enqueue: async () => undefined }, appUrl: '' };
}

export async function closeOldSeasons(tx: Tx, gardenId: string, beforeYear: number) {
  const rows = await tx.select().from(season).where(eq(season.gardenId, gardenId));
  for (const s of rows) if (s.year < beforeYear) await tx.update(season).set({ status: 'closed' }).where(eq(season.id, s.id));
}
