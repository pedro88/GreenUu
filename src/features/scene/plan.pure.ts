import { checkGeometry, type GeometryIssue, type RectGeometry } from '../zone/tree';
import type { PlanCommand } from './plan.schema';
import { DECOR_BY_CODE } from '../decor/catalog';
import { eraseCells, paintCells, resampleCells } from './terrain.pure';
import type { SceneDecor, SceneTerrain, SceneZone } from './snapshot.schema';

/*
 * Application locale (optimiste) des commandes du plan : même sémantique que le serveur, sans base. Sert au store de
 * l'éditeur (annuler / rétablir, PLN-05) et au rejeu des commandes non confirmées après un `CONFLICT` (PLN-03).
 */

export type ZoneTypeInfo = { id: string; code: string; label: string; canHostCultures: boolean; hasInteriorDefault: boolean };
export type EditorScene = { tileSizeCm: number; zones: SceneZone[]; terrain: SceneTerrain[]; decor: SceneDecor[] };
export type LocalIssue = GeometryIssue | 'unknown_zone' | 'unknown_decor';

function siblingsOf(scene: EditorScene, parentId: string | null, selfId: string | null): RectGeometry[] {
  return scene.zones.filter((z) => z.parentId === parentId && z.id !== selfId && z.geometry).map((z) => z.geometry as RectGeometry); // as: filtré sur geometry non nulle
}

function parentGeometry(scene: EditorScene, parentId: string | null): RectGeometry | null {
  const p = parentId ? scene.zones.find((z) => z.id === parentId) : null;
  // Les enfants d'une zone « avec intérieur » sont dessinés dans sa scène intérieure : pas de contenance (RG-ZON-05).
  return p && !p.hasInterior ? p.geometry : null;
}

/** RG-ZON-05 pour une commande, contre l'état local ; null si elle est applicable. */
export function validateLocal(scene: EditorScene, cmd: PlanCommand): LocalIssue | null {
  if (cmd.op === 'createZone') {
    if (cmd.parentId && !scene.zones.some((z) => z.id === cmd.parentId)) return 'unknown_zone';
    return checkGeometry(cmd.geometry, parentGeometry(scene, cmd.parentId), siblingsOf(scene, cmd.parentId, null));
  }
  if (cmd.op === 'resizeZone' || cmd.op === 'moveZone') {
    const z = scene.zones.find((x) => x.id === cmd.zoneId);
    if (!z) return 'unknown_zone';
    const issue = checkGeometry(cmd.geometry, parentGeometry(scene, z.parentId), siblingsOf(scene, z.parentId, z.id));
    if (issue) return issue;
    // Les enfants placés dans la même scène doivent rester contenus.
    const children = scene.zones.filter((c) => c.parentId === z.id && c.geometry && !z.hasInterior);
    return children.some((c) => c.geometry && checkGeometry(c.geometry, cmd.geometry, []) !== null) ? 'outside_parent' : null;
  }
  if (cmd.op === 'archiveZone') return scene.zones.some((z) => z.id === cmd.zoneId) ? null : 'unknown_zone';
  if (cmd.op === 'moveDecor' || cmd.op === 'removeDecor') return scene.decor.some((d) => d.id === cmd.decorId) ? null : 'unknown_decor';
  return null;
}

/** Sous-arbre d'une zone (elle comprise), pour l'archivage local (RG-ZON-06). */
function subtree(scene: EditorScene, id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const z of scene.zones) if (z.parentId && out.has(z.parentId) && !out.has(z.id)) { out.add(z.id); grew = true; }
  }
  return out;
}

export function applyLocal(scene: EditorScene, cmd: PlanCommand, types: Map<string, ZoneTypeInfo>): EditorScene {
  switch (cmd.op) {
    case 'createZone': {
      const type = types.get(cmd.zoneTypeId);
      const parent = cmd.parentId ? scene.zones.find((z) => z.id === cmd.parentId) : undefined;
      const zone: SceneZone = {
        id: cmd.clientId, name: cmd.name, typeCode: type?.code ?? 'plot', parentId: cmd.parentId, depth: parent ? parent.depth + 1 : 0, geometry: cmd.geometry,
        hasInterior: type?.hasInteriorDefault ?? false, canHostCultures: type?.canHostCultures ?? true, label: parent ? `${cmd.name}, ${parent.name}` : cmd.name,
      };
      return { ...scene, zones: [...scene.zones, zone] };
    }
    case 'resizeZone':
    case 'moveZone':
      return { ...scene, zones: scene.zones.map((z) => (z.id === cmd.zoneId ? { ...z, geometry: cmd.geometry } : z)) };
    case 'archiveZone': {
      const gone = subtree(scene, cmd.zoneId);
      return { ...scene, zones: scene.zones.filter((z) => !gone.has(z.id)) };
    }
    case 'paintTerrain':
      return { ...scene, terrain: paintCells(scene.terrain, cmd.cells, cmd.kind) };
    case 'eraseTerrain':
      return { ...scene, terrain: eraseCells(scene.terrain, cmd.cells) };
    case 'setScale':
      return { ...scene, tileSizeCm: cmd.tileSizeCm, terrain: resampleCells(scene.terrain, scene.tileSizeCm, cmd.tileSizeCm) };
    case 'placeDecor': {
      const item = DECOR_BY_CODE.get(cmd.itemCode);
      const d: SceneDecor = { id: cmd.clientId, itemCode: cmd.itemCode, spriteKey: item?.spriteKey ?? cmd.itemCode, w: item?.w ?? 1, h: item?.h ?? 1, x: cmd.x, y: cmd.y, label: cmd.label, practiceCode: item?.practice ?? null, practiceDeclared: false };
      return { ...scene, decor: [...scene.decor, d] };
    }
    case 'moveDecor':
      return { ...scene, decor: scene.decor.map((d) => (d.id === cmd.decorId ? { ...d, x: cmd.x, y: cmd.y } : d)) };
    case 'removeDecor':
      return { ...scene, decor: scene.decor.filter((d) => d.id !== cmd.decorId) };
  }
}

export function applyAll(scene: EditorScene, cmds: PlanCommand[], types: Map<string, ZoneTypeInfo>): EditorScene {
  return cmds.reduce((s, c) => applyLocal(s, c, types), scene);
}

/**
 * Après un `CONFLICT` (PLN-03) : rejoue les commandes non confirmées sur l'instantané rechargé. Celles qui ne sont plus
 * applicables (zone archivée entre-temps, chevauchement avec une zone créée par l'autre client…) sont écartées et signalées.
 */
export function replay(scene: EditorScene, cmds: PlanCommand[], types: Map<string, ZoneTypeInfo>) {
  const kept: PlanCommand[] = [];
  const conflicts: { command: PlanCommand; issue: LocalIssue }[] = [];
  let state = scene;
  for (const cmd of cmds) {
    const issue = validateLocal(state, cmd);
    if (issue) {
      conflicts.push({ command: cmd, issue });
      continue;
    }
    state = applyLocal(state, cmd, types);
    kept.push(cmd);
  }
  return { kept, conflicts, scene: state };
}
