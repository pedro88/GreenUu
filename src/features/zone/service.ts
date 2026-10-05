import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DomainError, forbidden, validation } from '@/lib/errors';
import type { ScopedCtx } from '@/server/action-core';
import { can, type Scope } from '@/server/authz/scope';
import { effectiveRestriction, zoneAllows, zoneGrantsEdit } from '@/server/authz/zone-access';
import type { Executor } from '@/server/db/client';
import { culture, cultureStage, garden, gardenEnvironment, gardenGroup, zone, zoneGroupPermission, zoneType } from '@/server/db/schema';
import { localDate } from '@/lib/dates';
import { emit } from '@/server/events/emit';
import { planChanged } from '../scene/history';
import { ROW_TYPE } from '../scene/rows.pure';
import * as repo from './repo';
import type { ZoneCreateInput, ZoneUpdateInput } from './schema';
import {
  buildTree,
  checkGeometry,
  childPath,
  depthOf,
  effectiveEnvironment,
  effectiveSurface,
  MAX_ZONE_DEPTH,
  subtreeHeight,
  wouldCreateCycle,
  type Environment,
  type RectGeometry,
} from './tree';

type ZonePermission = 'zone:create' | 'zone:update' | 'zone:archive';

/**
 * Autorisation d'une action sur la zone `targetChain` (racine → zone) :
 * rôle (avec réglage plan_edit_min_role) OU restriction `edit` accordée à un groupe de l'utilisateur,
 * puis respect des restrictions de zone (SPEC §5.3).
 */
async function assertZoneEdit(tx: Executor, scope: Scope, permission: ZonePermission, chainIds: string[]) {
  if (scope.archived) throw forbidden('gardenArchived');
  const restriction = effectiveRestriction(await repo.restrictionChain(tx, scope, chainIds));
  const byRole = can(scope, permission);
  const byGroup = scope.role === 'member' && zoneGrantsEdit(scope.groupIds, restriction);
  if (!(byRole || byGroup)) throw forbidden();
  if (!zoneAllows(scope.role, scope.groupIds, restriction, 'edit')) throw forbidden('zoneRestricted');
}

/**
 * Droit de « cultiver » une zone (cultures, journal, récoltes) : permission de rôle, puis restriction
 * de zone de niveau `contribute` au moins (SPEC §5.3). Renvoie la zone.
 */
export async function assertZoneContribute(tx: Executor, scope: Scope, permission: 'culture:create' | 'culture:update' | 'culture:delete' | 'journal:create' | 'ticket:create' | 'guide:apply' | 'result:submit', zoneId: string, facts?: { isOwn?: boolean }) {
  if (scope.archived) throw forbidden('gardenArchived');
  const z = await repo.findZone(tx, scope, zoneId);
  if (!can(scope, permission, facts)) throw forbidden();
  const restriction = effectiveRestriction(await repo.restrictionChain(tx, scope, chainOf(z)));
  if (!zoneAllows(scope.role, scope.groupIds, restriction, 'contribute')) throw forbidden('zoneRestricted');
  return z;
}

/** Sans lever d'erreur : la zone (ou son ancêtre restreint) laisse-t-elle contribuer ce membre (§5.3) ? */
export async function zoneContributable(tx: Executor, scope: Scope, zoneId: string): Promise<boolean> {
  const z = await repo.findZone(tx, scope, zoneId);
  return zoneAllows(scope.role, scope.groupIds, effectiveRestriction(await repo.restrictionChain(tx, scope, chainOf(z))), 'contribute');
}

export function chainOf(z: { id: string; path: string }): string[] {
  return [...(z.path ? z.path.split('/') : []), z.id];
}

async function assertGeometry(tx: Executor, scope: Scope, geometry: RectGeometry | null, parent: repo.ZoneRow | null, selfId: string | null, typeCode: string | null) {
  // Un rang n'a pas de géométrie propre : il découpe sa planche (rows.pure), sans contrainte de place.
  if (!geometry || typeCode === ROW_TYPE) return;
  const siblings = await repo.siblingGeometries(tx, scope, parent?.id ?? null, selfId);
  // Un enfant d'une zone « avec intérieur » est dessiné dans la scène intérieure : pas de contrainte de contenance.
  const parentGeom = parent && !parent.hasInterior ? parent.geometry : null;
  const issue = checkGeometry(geometry, parentGeom, siblings);
  if (issue) throw validation({ geometry: [issue] });
}

function sceneFor(parent: repo.ZoneRow | null): string | null {
  if (!parent) return null;
  return parent.hasInterior ? parent.id : parent.sceneZoneId;
}

/** RG-ZON-01 à 05 : création d'une zone (racine ou enfant). */
export async function createZone(ctx: ScopedCtx, input: ZoneCreateInput) {
  const { tx, scope, actor, clock } = ctx;
  const parent = input.parentId ? await repo.findZone(tx, scope, input.parentId) : null;
  if (parent?.archivedAt) throw validation({ parentId: ['parentArchived'] });
  await assertZoneEdit(tx, scope, 'zone:create', parent ? chainOf(parent) : []);
  const type = await repo.findUsableZoneType(tx, scope, input.zoneTypeId);
  const path = childPath(parent);
  if (depthOf(path) >= MAX_ZONE_DEPTH) throw validation({ parentId: ['maxDepth'] });
  await assertGeometry(tx, scope, input.geometry, parent, null, type.code);
  const [z] = await tx
    .insert(zone)
    .values({
      gardenId: scope.gardenId,
      parentId: parent?.id ?? null,
      zoneTypeId: type.id,
      name: input.name,
      path,
      depth: depthOf(path),
      environment: input.environment ?? (parent ? null : type.defaultEnvironment),
      lengthCm: input.lengthCm ?? null,
      widthCm: input.widthCm ?? null,
      surfaceM2Manual: input.surfaceM2Manual ?? null,
      geometry: input.geometry,
      sceneZoneId: sceneFor(parent),
      hasInterior: input.hasInterior || type.hasInteriorDefault,
      notes: input.notes ?? null,
    })
    .returning({ id: zone.id, depth: zone.depth });
  if (!z) throw new Error('Insertion de la zone échouée');
  await emit(tx, { type: 'zone.created', subjectType: 'zone', subjectId: z.id, gardenId: scope.gardenId, actorId: actor.id, payload: { zoneTypeCode: type.code, depth: z.depth } }, clock.now());
  await planChanged(tx, scope.gardenId, clock.now());
  return { zoneId: z.id };
}

export async function updateZone(ctx: ScopedCtx, input: ZoneUpdateInput) {
  const { tx, scope, actor, clock } = ctx;
  const current = await repo.findZone(tx, scope, input.zoneId);
  await assertZoneEdit(tx, scope, 'zone:update', chainOf(current));
  const type = await repo.findUsableZoneType(tx, scope, input.zoneTypeId);
  const parent = current.parentId ? await repo.findZone(tx, scope, current.parentId) : null;
  await assertGeometry(tx, scope, input.geometry, parent, current.id, type.code);
  await tx
    .update(zone)
    .set({
      name: input.name,
      zoneTypeId: type.id,
      environment: input.environment,
      lengthCm: input.lengthCm ?? null,
      widthCm: input.widthCm ?? null,
      surfaceM2Manual: input.surfaceM2Manual ?? null,
      geometry: input.geometry,
      hasInterior: input.hasInterior,
      notes: input.notes ?? null,
    })
    .where(and(eq(zone.gardenId, scope.gardenId), eq(zone.id, current.id)));
  await emit(tx, { type: 'zone.updated', subjectType: 'zone', subjectId: current.id, gardenId: scope.gardenId, actorId: actor.id, payload: { fields: Object.keys(input) } }, clock.now());
  await planChanged(tx, scope.gardenId, clock.now());
  return { zoneId: current.id };
}

/**
 * Éditeur de plan (§9.7) : redimensionner ou déplacer une zone sur le plan. Mêmes invariants que le formulaire
 * (RG-ZON-05), plus la contenance des enfants dessinés dans la même scène.
 */
export async function setZoneGeometry(ctx: ScopedCtx, zoneId: string, geometry: RectGeometry) {
  const { tx, scope, actor, clock } = ctx;
  const current = await repo.findZone(tx, scope, zoneId);
  if (current.archivedAt) throw validation({ zoneId: ['zoneArchived'] });
  await assertZoneEdit(tx, scope, 'zone:update', chainOf(current));
  const parent = current.parentId ? await repo.findZone(tx, scope, current.parentId) : null;
  await assertGeometry(tx, scope, geometry, parent, current.id, await repo.zoneTypeCode(tx, current.zoneTypeId));
  if (!current.hasInterior) {
    const children = await repo.siblingGeometries(tx, scope, current.id, null);
    if (children.some((c) => checkGeometry(c, geometry, []) !== null)) throw validation({ geometry: ['outside_parent'] });
  }
  await tx.update(zone).set({ geometry }).where(and(eq(zone.gardenId, scope.gardenId), eq(zone.id, current.id)));
  await emit(tx, { type: 'zone.updated', subjectType: 'zone', subjectId: current.id, gardenId: scope.gardenId, actorId: actor.id, payload: { fields: ['geometry'] } }, clock.now());
  await planChanged(tx, scope.gardenId, clock.now());
  return { zoneId: current.id };
}

/** RG-ZON-01 : déplacement sous un autre parent (ou à la racine), sans cycle ni dépassement de profondeur. */
export async function moveZone(ctx: ScopedCtx, input: { zoneId: string; parentId: string | null }) {
  const { tx, scope, actor, clock } = ctx;
  const current = await repo.findZone(tx, scope, input.zoneId);
  await assertZoneEdit(tx, scope, 'zone:update', chainOf(current));
  const parent = input.parentId ? await repo.findZone(tx, scope, input.parentId) : null;
  if (parent) {
    if (wouldCreateCycle(current.id, parent)) throw validation({ parentId: ['cycle'] });
    if (parent.archivedAt) throw validation({ parentId: ['parentArchived'] });
    await assertZoneEdit(tx, scope, 'zone:create', chainOf(parent));
  }
  const descendants = await repo.findDescendants(tx, scope, current);
  const newPath = childPath(parent);
  if (depthOf(newPath) + subtreeHeight(current, descendants) >= MAX_ZONE_DEPTH) throw validation({ parentId: ['maxDepth'] });
  const oldPrefix = childPath(current);
  const newPrefix = newPath ? `${newPath}/${current.id}` : current.id;
  await tx.update(zone).set({ parentId: parent?.id ?? null, path: newPath, depth: depthOf(newPath), sceneZoneId: sceneFor(parent), geometry: null })
    .where(and(eq(zone.gardenId, scope.gardenId), eq(zone.id, current.id)));
  if (descendants.length > 0) {
    // Réécriture des chemins du sous-arbre : on remplace le préfixe de l'ancien chemin.
    await tx.update(zone)
      .set({
        path: sql`${newPrefix} || substr(${zone.path}, ${oldPrefix.length + 1})`,
        depth: sql`${zone.depth} + ${depthOf(newPath) - current.depth}`,
      })
      .where(and(eq(zone.gardenId, scope.gardenId), inArray(zone.id, descendants.map((d) => d.id))));
  }
  await emit(tx, { type: 'zone.moved', subjectType: 'zone', subjectId: current.id, gardenId: scope.gardenId, actorId: actor.id, payload: { fromParentId: current.parentId, toParentId: parent?.id ?? null } }, clock.now());
  await planChanged(tx, scope.gardenId, clock.now());
  return { zoneId: current.id };
}

/** RG-ZON-06 : l'archivage s'applique à tout le sous-arbre ; l'historique est conservé. */
export async function setZoneArchived(ctx: ScopedCtx, zoneId: string, archived: boolean, opts: { finishActiveCultures?: boolean } = {}) {
  const { tx, scope, actor, clock } = ctx;
  const current = await repo.findZone(tx, scope, zoneId);
  await assertZoneEdit(tx, scope, 'zone:archive', chainOf(current));
  if (!archived && current.parentId) {
    const parent = await repo.findZone(tx, scope, current.parentId);
    if (parent.archivedAt) throw validation({ zoneId: ['parentArchived'] });
  }
  const ids = [current.id, ...(await repo.findDescendants(tx, scope, current)).map((d) => d.id)];
  if (archived) {
    // RG-ZON-06 / ZON-09 : des cultures en cours bloquent l'archivage, sauf confirmation explicite.
    const running = await tx.select({ id: culture.id, status: culture.status }).from(culture)
      .where(and(eq(culture.gardenId, scope.gardenId), inArray(culture.zoneId, ids), isNull(culture.deletedAt), inArray(culture.status, ['planned', 'active'])));
    if (running.length > 0 && !opts.finishActiveCultures) throw new DomainError('CONFLICT', 'zoneHasActiveCultures');
    const [g] = await tx.select({ timezone: garden.timezone }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
    const today = localDate(clock.now(), g?.timezone ?? 'Europe/Paris');
    for (const c of running) {
      // Une culture en cours est terminée aujourd'hui ; une culture seulement prévue est abandonnée.
      await tx.insert(cultureStage).values({ gardenId: scope.gardenId, cultureId: c.id, stage: 'end', actualOn: today, recordedBy: actor.id })
        .onConflictDoUpdate({ target: [cultureStage.cultureId, cultureStage.stage], set: { actualOn: today, recordedBy: actor.id } });
      await tx.update(culture).set({ status: c.status === 'active' ? 'finished' : 'abandoned', occupiedTo: today }).where(eq(culture.id, c.id));
    }
  }
  await tx.update(zone).set({ archivedAt: archived ? clock.now() : null })
    .where(and(eq(zone.gardenId, scope.gardenId), inArray(zone.id, ids)));
  if (archived) {
    await emit(tx, { type: 'zone.archived', subjectType: 'zone', subjectId: current.id, gardenId: scope.gardenId, actorId: actor.id, payload: { archivedIds: ids } }, clock.now());
  }
  await planChanged(tx, scope.gardenId, clock.now());
  return { zoneIds: ids };
}

/** RG-ZON-02 : type de zone personnalisé, propre au jardin. */
export async function createZoneType(ctx: ScopedCtx, input: { label: string; canHostCultures: boolean; hasInteriorDefault: boolean }) {
  const { tx, scope } = ctx;
  if (!can(scope, 'garden:update')) throw forbidden();
  const code = `custom_${slugify(input.label)}`;
  const [existing] = await tx.select({ id: zoneType.id }).from(zoneType)
    .where(and(eq(zoneType.gardenId, scope.gardenId), eq(zoneType.code, code))).limit(1);
  if (existing) throw new DomainError('CONFLICT', 'zoneTypeExists');
  const [t] = await tx.insert(zoneType)
    .values({ gardenId: scope.gardenId, code, label: input.label, canHostCultures: input.canHostCultures, hasInteriorDefault: input.hasInteriorDefault, sortOrder: 500 })
    .returning({ id: zoneType.id });
  if (!t) throw new Error('Insertion du type échouée');
  return { zoneTypeId: t.id };
}

export async function archiveZoneType(ctx: ScopedCtx, zoneTypeId: string) {
  const { tx, scope, clock } = ctx;
  if (!can(scope, 'garden:update')) throw forbidden();
  const updated = await tx.update(zoneType).set({ archivedAt: clock.now() })
    .where(and(eq(zoneType.id, zoneTypeId), eq(zoneType.gardenId, scope.gardenId), isNull(zoneType.archivedAt)))
    .returning({ id: zoneType.id });
  if (updated.length === 0) throw new DomainError('NOT_FOUND', 'zoneTypeNotFound');
  return { zoneTypeId };
}

/** §5.3 : restreint une zone à des groupes du jardin (liste vide = retire la restriction). */
export async function setZoneRestrictions(ctx: ScopedCtx, zoneId: string, restrictions: { groupId: string; level: 'edit' | 'contribute' }[]) {
  const { tx, scope } = ctx;
  if (!can(scope, 'zone:restrict')) throw forbidden();
  const current = await repo.findZone(tx, scope, zoneId);
  const groupIds = [...new Set(restrictions.map((r) => r.groupId))];
  if (groupIds.length > 0) {
    const groups = await tx.select({ id: gardenGroup.id }).from(gardenGroup)
      .where(and(eq(gardenGroup.gardenId, scope.gardenId), inArray(gardenGroup.id, groupIds), isNull(gardenGroup.archivedAt)));
    if (groups.length !== groupIds.length) throw validation({ restrictions: ['groupNotFound'] });
  }
  await tx.delete(zoneGroupPermission).where(and(eq(zoneGroupPermission.gardenId, scope.gardenId), eq(zoneGroupPermission.zoneId, current.id)));
  if (restrictions.length > 0) {
    await tx.insert(zoneGroupPermission).values(restrictions.map((r) => ({ gardenId: scope.gardenId, zoneId: current.id, groupId: r.groupId, level: r.level })));
  }
  return { zoneId: current.id };
}

/* ---------- Lectures ---------- */

async function gardenEnvironments(tx: Executor, gardenId: string): Promise<Environment[]> {
  const rows = await tx.select({ e: gardenEnvironment.environment }).from(gardenEnvironment)
    .where(eq(gardenEnvironment.gardenId, gardenId)).orderBy(gardenEnvironment.position);
  return rows.map((r) => r.e);
}

/** Arbre des zones avec environnement et surface effectifs (vue `/zones`). */
export async function zoneTree(tx: Executor, scope: Scope, opts: { includeArchived: boolean }) {
  const rows = await repo.listZones(tx, scope, opts);
  const envs = await gardenEnvironments(tx, scope.gardenId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const enriched = rows.map((r) => {
    const ancestors = (r.path ? r.path.split('/') : []).flatMap((id) => byId.get(id) ?? []);
    return {
      ...r,
      effectiveEnvironment: effectiveEnvironment(r, ancestors, envs),
      surface: effectiveSurface(r),
      archived: r.archivedAt !== null,
    };
  });
  return buildTree(enriched);
}

export type ZoneTreeNode = Awaited<ReturnType<typeof zoneTree>>[number];

/** Détail d'une zone : ancêtres, enfants, valeurs effectives, restrictions (vue `/zones/[zoneId]`). */
export async function zoneDetail(tx: Executor, scope: Scope, zoneId: string) {
  const z = await repo.findZone(tx, scope, zoneId);
  const [type] = await tx.select().from(zoneType).where(eq(zoneType.id, z.zoneTypeId)).limit(1);
  const ancestors = await repo.findAncestors(tx, scope, z);
  const children = (await repo.listZones(tx, scope, { includeArchived: true })).filter((c) => c.parentId === z.id);
  const envs = await gardenEnvironments(tx, scope.gardenId);
  const chain = await repo.restrictionChain(tx, scope, chainOf(z));
  const own = chain[chain.length - 1] ?? [];
  const effective = effectiveRestriction(chain);
  return {
    zone: z,
    type: type ?? null,
    ancestors,
    children,
    effectiveEnvironment: effectiveEnvironment(z, ancestors, envs),
    environmentInherited: z.environment === null,
    surface: effectiveSurface(z),
    ownRestrictions: own,
    effectiveRestrictions: effective,
    restrictionInherited: own.length === 0 && effective !== null,
    canEdit: await canEditZone(tx, scope, chainOf(z)),
  };
}

async function canEditZone(tx: Executor, scope: Scope, chainIds: string[]): Promise<boolean> {
  try {
    await assertZoneEdit(tx, scope, 'zone:update', chainIds);
    return true;
  } catch {
    return false;
  }
}

/** L'utilisateur peut-il créer une zone racine (bouton « Nouvelle zone ») ? */
export function canCreateRootZone(scope: Scope): boolean {
  return can(scope, 'zone:create');
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'type';
}

/** Liste plate des zones actives (sélecteurs de parent, déplacement). */
export function listZoneRows(tx: Executor, scope: Scope) {
  return repo.listZones(tx, scope, { includeArchived: false });
}

/** Zones actives pouvant accueillir des cultures (sélecteurs), avec indentation par profondeur. */
export async function cultivableZones(tx: Executor, scope: Scope) {
  const rows = await repo.listZones(tx, scope, { includeArchived: false });
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null) => {
    for (const r of (byParent.get(parent) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'))) {
      if (r.canHostCultures) out.push({ id: r.id, label: `${'— '.repeat(r.depth)}${r.name}` });
      walk(r.id);
    }
  };
  walk(null);
  return out;
}
