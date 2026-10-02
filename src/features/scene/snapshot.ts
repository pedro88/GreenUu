import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { localDate } from '@/lib/dates';
import { notFound } from '@/lib/errors';
import type { Scope } from '@/server/authz/scope';
import { can } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import {
  botanicalFamily, culture, cultureStage, garden, gardenMember, groupMember, journalEntry, species, terrainElement, ticket, ticketAssignee, userProfile, variety, zone, zoneType,
} from '@/server/db/schema';
import type { RectGeometry } from '../zone/tree';
import { sceneDecor } from '../decor/service';
import { ambientFilter } from './ambient.pure';
import { sceneAvatars } from './avatars';
import { layoutInRect, sceneBounds } from './grid.pure';
import { orderStates, visualPhase, type VisualState } from './phase.pure';
import { sceneSnapshotSchema, type SceneCulture, type SceneSnapshot, type SceneZone } from './snapshot.schema';
import { familyKey } from '@/game/manifest';

/* Instantané de scène (SPEC §9.1) : tout ce que le moteur affiche, calculé côté serveur et validé par Zod. */

const OPEN = ['todo', 'in_progress', 'blocked'] as const;
const DAY = 86_400_000;
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export async function sceneSnapshot(tx: Executor, scope: Scope, opts: { userId: string; sceneZoneId: string | null; now: Date }): Promise<SceneSnapshot> {
  const [g] = await tx.select({ name: garden.name, orgType: garden.orgType, tileSizeCm: garden.tileSizeCm, planVersion: garden.planVersion, lat: garden.lat, lng: garden.lng, timezone: garden.timezone })
    .from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  if (!g) throw notFound();
  const today = localDate(opts.now, g.timezone);

  const allZones = await tx.select({
    id: zone.id, name: zone.name, parentId: zone.parentId, path: zone.path, depth: zone.depth, geometry: zone.geometry, sceneZoneId: zone.sceneZoneId,
    hasInterior: zone.hasInterior, typeCode: zoneType.code, canHostCultures: zoneType.canHostCultures,
  }).from(zone).innerJoin(zoneType, eq(zoneType.id, zone.zoneTypeId))
    .where(and(eq(zone.gardenId, scope.gardenId), isNull(zone.archivedAt))).orderBy(zone.depth, zone.sortOrder, zone.name).limit(2000);
  const byId = new Map(allZones.map((z) => [z.id, z]));

  // Scène intérieure : la zone doit exister et avoir un intérieur ; le fil d'Ariane remonte les scènes englobantes.
  const breadcrumb: SceneSnapshot['breadcrumb'] = [{ zoneId: null, name: g.name }];
  if (opts.sceneZoneId) {
    const host = byId.get(opts.sceneZoneId);
    if (!host?.hasInterior) throw notFound();
    const chain: { zoneId: string; name: string }[] = [];
    for (let z: typeof host | undefined = host; z; z = z.sceneZoneId ? byId.get(z.sceneZoneId) : undefined) chain.unshift({ zoneId: z.id, name: z.name });
    breadcrumb.push(...chain);
  }
  const inScene = allZones.filter((z) => z.sceneZoneId === opts.sceneZoneId);
  const zones: SceneZone[] = inScene.map((z) => {
    const parent = z.parentId ? byId.get(z.parentId) : undefined;
    return { id: z.id, name: z.name, typeCode: z.typeCode, parentId: z.parentId, depth: z.depth, geometry: z.geometry, hasInterior: z.hasInterior, canHostCultures: z.canHostCultures,
      label: parent ? `${z.name}, ${parent.name}` : z.name };
  });

  const terrain = await tx.select({ id: terrainElement.id, kind: terrainElement.kind, geometry: terrainElement.geometry }).from(terrainElement)
    .where(and(eq(terrainElement.gardenId, scope.gardenId), opts.sceneZoneId ? eq(terrainElement.sceneZoneId, opts.sceneZoneId) : isNull(terrainElement.sceneZoneId))).limit(2000);

  const cultures = await scenesCultures(tx, scope, { zoneIds: inScene.map((z) => z.id), today, userId: opts.userId, byId, south: g.lat < 0 });
  const [prof] = await tx.select({ reducedMotion: userProfile.reducedMotion }).from(userProfile).where(eq(userProfile.userId, opts.userId)).limit(1);
  const decor = await sceneDecor(tx, scope.gardenId, opts.sceneZoneId);
  const avatars = await sceneAvatars(tx, { gardenId: scope.gardenId, orgType: g.orgType, sceneZoneId: opts.sceneZoneId, now: opts.now, byId });
  const rects = [...zones.flatMap((z) => (z.geometry ? [z.geometry] : [])), ...terrain.map((t) => t.geometry)];
  const ambient = ambientFilter(opts.now, g);

  return sceneSnapshotSchema.parse({
    gardenId: scope.gardenId, gardenName: g.name, sceneZoneId: opts.sceneZoneId, breadcrumb, planVersion: g.planVersion, tileSizeCm: g.tileSizeCm,
    bounds: sceneBounds(rects, g.tileSizeCm), zones, terrain, cultures, decor, avatars,
    ambient: { period: ambient.period, season: ambient.season, tint: ambient.tint, alpha: ambient.alpha },
    viewer: {
      canEditPlan: can(scope, 'plan:edit') && !scope.archived, canPlaceDecor: can(scope, 'decor:place') && !scope.archived,
      canDeclarePractice: can(scope, 'garden:update') && !scope.archived, reducedMotion: prof?.reducedMotion ?? false,
    },
  });
}

type ZoneInfo = { id: string; path: string; geometry: RectGeometry | null; sceneZoneId: string | null };

/** Cultures visibles dans la scène, avec phase, états (§9.4) et position. */
async function scenesCultures(tx: Executor, scope: Scope, o: { zoneIds: string[]; today: string; userId: string; byId: Map<string, ZoneInfo>; south: boolean }): Promise<SceneCulture[]> {
  if (!o.zoneIds.length) return [];
  const rows = await tx.select({
    id: culture.id, zoneId: culture.zoneId, method: culture.method, status: culture.status, updatedAt: culture.updatedAt,
    speciesKey: species.spriteKey, varietyKey: variety.spriteKey, family: botanicalFamily.code, visualModel: species.visualModel, perennial: species.perennial,
    label: sql<string>`concat_ws(' ', ${species.commonNames}->'fr'->>0, ${variety.name})`,
  }).from(culture).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .leftJoin(variety, eq(variety.id, culture.varietyId))
    .where(and(eq(culture.gardenId, scope.gardenId), inArray(culture.zoneId, o.zoneIds), isNull(culture.deletedAt),
      or(inArray(culture.status, ['planned', 'active']), gte(culture.updatedAt, new Date(Date.parse(`${o.today}T00:00:00Z`) - 15 * DAY)))))
    .limit(1000);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const stages = await tx.select({ cultureId: cultureStage.cultureId, stage: cultureStage.stage, plannedOn: cultureStage.plannedOn, actualOn: cultureStage.actualOn })
    .from(cultureStage).where(inArray(cultureStage.cultureId, ids));
  const states = await statesOf(tx, scope, { cultures: rows.map((r) => ({ id: r.id, zoneId: r.zoneId })), today: o.today, userId: o.userId, byId: o.byId });

  const placed = new Map<string, string[]>();
  const out: (SceneCulture & { anchorZone: string | null })[] = [];
  for (const r of rows) {
    const mine = stages.filter((s) => s.cultureId === r.id);
    const endedOn = mine.find((s) => s.stage === 'end')?.actualOn ?? (r.status === 'planned' || r.status === 'active' ? null : r.updatedAt.toISOString().slice(0, 10));
    const p = visualPhase({ method: r.method, status: r.status, perennial: r.perennial, visualModel: r.visualModel, stages: mine, endedOn }, o.today, { south: o.south });
    if (!p.visible) continue;
    const s = new Set(states.get(r.id) ?? []);
    if (p.phase === 'harvest_ready' && !mine.some((x) => x.stage === 'harvest_end' && x.actualOn)) s.add('harvest_ready');
    if (p.needsConfirmation) s.add('needs_confirmation');
    // Position : la zone de la culture, ou son ancêtre le plus proche qui est placé dans cette scène.
    const z = o.byId.get(r.zoneId);
    const chain = z ? [z.id, ...(z.path ? z.path.split('/').reverse() : [])] : [];
    const anchor = chain.map((id) => o.byId.get(id)).find((a) => a?.geometry && a.sceneZoneId === z?.sceneZoneId) ?? null;
    if (anchor) placed.set(anchor.id, [...(placed.get(anchor.id) ?? []), r.id]);
    out.push({
      id: r.id, zoneId: r.zoneId, label: r.label, spriteKeys: [r.varietyKey, r.speciesKey, familyKey(r.family)].filter((k): k is string => !!k),
      phase: p.phase, progress: p.progress, states: orderStates(s), position: null, anchorZone: anchor?.id ?? null,
    });
  }
  for (const [zoneId, cultureIds] of placed) {
    const rect = o.byId.get(zoneId)?.geometry;
    if (!rect) continue;
    const pts = layoutInRect(rect, cultureIds.length);
    cultureIds.forEach((id, i) => {
      const c = out.find((x) => x.id === id);
      if (c && pts[i]) c.position = pts[i];
    });
  }
  return out.map(({ anchorZone: _anchor, ...c }) => c);
}

/** États visuels calculés côté serveur (§9.4) : tickets en retard, arrosage échu, problèmes, assignations. */
async function statesOf(tx: Executor, scope: Scope, o: { cultures: { id: string; zoneId: string }[]; today: string; userId: string; byId: Map<string, ZoneInfo> }) {
  const out = new Map<string, Set<VisualState>>();
  const add = (id: string, s: VisualState) => out.set(id, (out.get(id) ?? new Set()).add(s));
  const cultureIds = o.cultures.map((c) => c.id);
  const zoneIds = [...new Set(o.cultures.flatMap((c) => {
    const z = o.byId.get(c.zoneId);
    return z ? [z.id, ...(z.path ? z.path.split('/') : [])] : [];
  }))];
  const open = await tx.select({ id: ticket.id, cultureId: ticket.cultureId, zoneId: ticket.zoneId, dueOn: ticket.dueOn, actionTag: ticket.actionTag, type: ticket.type })
    .from(ticket).where(and(eq(ticket.gardenId, scope.gardenId), inArray(ticket.status, [...OPEN]), isNull(ticket.deletedAt),
      or(inArray(ticket.cultureId, cultureIds), zoneIds.length ? inArray(ticket.zoneId, zoneIds) : sql`false`))).limit(5000);
  const mine = open.length ? new Set((await tx.selectDistinct({ id: ticketAssignee.ticketId }).from(ticketAssignee)
    .leftJoin(groupMember, eq(groupMember.groupId, ticketAssignee.groupId))
    .innerJoin(gardenMember, or(eq(gardenMember.id, ticketAssignee.memberId), eq(gardenMember.id, groupMember.memberId)))
    .where(and(inArray(ticketAssignee.ticketId, open.map((t) => t.id)), eq(gardenMember.userId, o.userId), isNull(gardenMember.leftAt)))).map((r) => r.id)) : new Set<string>();
  for (const c of o.cultures) {
    const z = o.byId.get(c.zoneId);
    const chain = new Set(z ? [z.id, ...(z.path ? z.path.split('/') : [])] : []);
    for (const t of open) {
      const onCulture = t.cultureId === c.id;
      if (onCulture && t.dueOn && t.dueOn < o.today) add(c.id, 'overdue_ticket');
      // RG-JRN-04 : arrosage échu sur la culture, sa zone ou un ancêtre.
      if (t.actionTag === 'watering' && t.dueOn && t.dueOn <= o.today && (onCulture || (t.zoneId !== null && chain.has(t.zoneId)))) add(c.id, 'thirsty');
      if (onCulture && t.type === 'problem') add(c.id, 'disease');
      if (onCulture && mine.has(t.id)) add(c.id, 'assigned_to_me');
    }
  }
  const since = new Date(Date.parse(`${shiftDay(o.today, -30)}T00:00:00Z`));
  const problems = await tx.select({ cultureId: journalEntry.cultureId, kind: journalEntry.kind }).from(journalEntry)
    .where(and(eq(journalEntry.gardenId, scope.gardenId), inArray(journalEntry.cultureId, cultureIds), inArray(journalEntry.kind, ['disease', 'pest']),
      eq(journalEntry.resolved, false), isNull(journalEntry.deletedAt), gte(journalEntry.observedAt, since)));
  for (const p of problems) if (p.cultureId) add(p.cultureId, p.kind === 'pest' ? 'pest' : 'disease');
  return new Map([...out].map(([k, v]) => [k, [...v]]));
}
