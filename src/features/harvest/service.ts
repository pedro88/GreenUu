import { and, eq, isNull } from 'drizzle-orm';
import { forbidden, notFound, validation } from '@/lib/errors';
import { addDays, localDate } from '@/lib/dates';
import type { ScopedCtx } from '@/server/action-core';
import { captureInstant, replayOf } from '@/server/offline';
import { can } from '@/server/authz/scope';
import { culture, garden, harvest, species } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { harvestKg } from '../culture/stages.pure';
import { assertZoneContribute } from '../zone/service';
import type { HarvestCreateInput } from './schema';

/** RG-JRN-05 : récolte saisie, convertie en kg quand c'est possible. */
export async function recordHarvest(ctx: ScopedCtx, input: HarvestCreateInput) {
  const { tx, scope, actor, clock } = ctx;
  const [c] = await tx.select({ id: culture.id, zoneId: culture.zoneId, unitG: species.avgUnitWeightG }).from(culture).innerJoin(species, eq(species.id, culture.speciesId))
    .where(and(eq(culture.gardenId, scope.gardenId), eq(culture.id, input.cultureId), isNull(culture.deletedAt))).limit(1);
  if (!c) throw notFound('cultureNotFound');
  await assertZoneContribute(tx, scope, 'journal:create', c.zoneId);
  // Renvoi d'une saisie déjà reçue : la récolte existante (OFF-03).
  const replayed = input.clientId ? await replayOf(tx, harvest, input.clientId, scope.gardenId, actor.id) : null;
  if (replayed) {
    const [h] = await tx.select({ quantityKg: harvest.quantityKg }).from(harvest).where(eq(harvest.id, replayed)).limit(1);
    return { harvestId: replayed, quantityKg: h?.quantityKg ?? null };
  }
  const [g] = await tx.select({ timezone: garden.timezone }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  const tz = g?.timezone ?? 'Europe/Paris';
  // Saisie hors-ligne : la récolte et son événement comptent pour le jour de saisie (OFF-07).
  const eventAt = captureInstant(input.capturedAt, clock.now());
  const today = localDate(eventAt, tz);
  const harvestedOn = input.harvestedOn ?? today;
  if (harvestedOn > localDate(addDays(clock.now(), 1), tz)) throw validation({ harvestedOn: ['futureDate'] });
  const quantityKg = harvestKg(input.quantity, input.unit, c.unitG);
  const [h] = await tx.insert(harvest).values({
    ...(input.clientId ? { id: input.clientId } : {}),
    gardenId: scope.gardenId, cultureId: c.id, harvestedOn, quantity: input.quantity, unit: input.unit, quantityKg, quality: input.quality ?? null,
    seedSaving: input.seedSaving, note: input.note ?? null, authorId: actor.id,
  }).returning({ id: harvest.id });
  if (!h) throw new Error('Insertion de la récolte échouée');
  await emit(tx, { type: 'harvest.recorded', subjectType: 'harvest', subjectId: h.id, gardenId: scope.gardenId, actorId: actor.id, payload: { cultureId: c.id, quantityKg, unit: input.unit, seedSaving: input.seedSaving } }, eventAt);
  return { harvestId: h.id, quantityKg };
}

export async function deleteHarvest(ctx: ScopedCtx, harvestId: string) {
  const { tx, scope, actor, clock } = ctx;
  const [h] = await tx.select().from(harvest).where(and(eq(harvest.gardenId, scope.gardenId), eq(harvest.id, harvestId), isNull(harvest.deletedAt))).limit(1);
  if (!h) throw notFound();
  if (!can(scope, 'journal:delete', { isOwn: h.authorId === actor.id })) throw forbidden();
  await tx.update(harvest).set({ deletedAt: clock.now() }).where(eq(harvest.id, h.id));
  await emit(tx, { type: 'harvest.deleted', subjectType: 'harvest', subjectId: h.id, gardenId: scope.gardenId, actorId: actor.id, payload: { cultureId: h.cultureId } }, clock.now());
  return { harvestId };
}
