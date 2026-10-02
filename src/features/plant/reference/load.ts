import { normalizeSearch } from '@/lib/text';
import { seedId } from '@/lib/uuid5';
import type { Executor } from '@/server/db/client';
import { botanicalFamily, companion, problem, species, speciesCalendar, variety } from '@/server/db/schema';
import { loadAvatarCatalog } from '../../avatar/load';
import { loadDecorCatalog } from '../../decor/load';
import { CALENDARS, COMPANIONS, FAMILIES, PROBLEMS, SPECIES, VARIETIES } from './data';

export const familyRefId = (code: string) => seedId(`family:${code}`);
export const speciesRefId = (code: string) => seedId(`species:${code}`);
export const varietyRefId = (speciesCode: string, name: string) => seedId(`variety:${speciesCode}:${name}`);
export const problemRefId = (code: string) => seedId(`problem:${code}`);

/** Charge ou met à jour le référentiel commun (idempotent, identifiants stables), catalogues d'avatar et de déco compris. */
export async function loadReferenceData(tx: Executor): Promise<void> {
  for (const f of FAMILIES) {
    await tx.insert(botanicalFamily).values({ id: familyRefId(f.code), code: f.code, latinName: f.latin, rotationReturnYears: f.returnYears, spriteKey: f.sprite ?? null })
      .onConflictDoUpdate({ target: botanicalFamily.id, set: { latinName: f.latin, rotationReturnYears: f.returnYears, spriteKey: f.sprite ?? null } });
  }
  for (const s of SPECIES) {
    const values = {
      familyId: familyRefId(s.family), latinName: s.latin, commonNames: { fr: s.fr, en: s.en }, visualModel: s.model, skillDomain: s.skill,
      perennial: s.perennial ?? false, greenManure: s.greenManure ?? false, sun: s.sun, water: s.water,
      tempMinC: s.temp[0], tempOptC: s.temp[1], tempMaxC: s.temp[2], spacingRowCm: s.spacing[0], spacingPlantCm: s.spacing[1],
      daysToMaturityMin: s.dtm[0], daysToMaturityMax: s.dtm[1], avgUnitWeightG: s.unitG ?? null, spriteKey: s.sprite ?? null,
      searchText: normalizeSearch([...s.fr, ...s.en, s.latin].join(' ')),
    };
    await tx.insert(species).values({ id: speciesRefId(s.code), ...values }).onConflictDoUpdate({ target: species.id, set: values });
  }
  const speciesByCode = new Map(SPECIES.map((s) => [s.code, s]));
  for (const [sp, name, origin] of VARIETIES) {
    const s = speciesByCode.get(sp);
    if (!s) throw new Error(`espèce inconnue : ${sp}`);
    const searchText = normalizeSearch(`${name} ${s.fr.join(' ')}`);
    await tx.insert(variety).values({ id: varietyRefId(sp, name), speciesId: speciesRefId(sp), name, origin, status: 'approved', searchText })
      .onConflictDoUpdate({ target: variety.id, set: { name, origin, searchText } });
  }
  for (const [a, b, effect] of COMPANIONS) {
    const [x, y] = [speciesRefId(a), speciesRefId(b)].sort();
    if (!x || !y) continue;
    await tx.insert(companion).values({ speciesAId: x, speciesBId: y, effect }).onConflictDoUpdate({ target: [companion.speciesAId, companion.speciesBId], set: { effect } });
  }
  for (const [sp, method, stage, start, end] of CALENDARS) {
    await tx.insert(speciesCalendar).values({ speciesId: speciesRefId(sp), koppenGroup: 'C', environment: 'open_air', method, stage, windowStartDoy: start, windowEndDoy: end })
      .onConflictDoUpdate({ target: [speciesCalendar.speciesId, speciesCalendar.koppenGroup, speciesCalendar.environment, speciesCalendar.method, speciesCalendar.stage], set: { windowStartDoy: start, windowEndDoy: end } });
  }
  for (const [i, [code, category]] of PROBLEMS.entries()) {
    await tx.insert(problem).values({ id: problemRefId(code), code, category, sortOrder: i * 10 }).onConflictDoUpdate({ target: problem.id, set: { category, sortOrder: i * 10 } });
  }
  await loadAvatarCatalog(tx);
  await loadDecorCatalog(tx);
}
