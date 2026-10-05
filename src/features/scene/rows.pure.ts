import type { RectGeometry } from '@/features/zone/tree';
import { plantableRect, type Rect } from './fill.pure';

/*
 * Rangs d'une planche (demande de l'utilisateur du 2026-10-05) : les zones de type `row` rattachées à une zone placée la
 * découpent en bandes égales, parallèles à son grand côté, une par rang. La géométrie enregistrée d'un rang n'est pas
 * lue : avec 1, 2, 3 ou 10 rangs, la planche montre 1, 2, 3 ou 10 sillons, et les cultures d'un rang s'alignent sur le
 * sien. Fonctions pures, partagées par l'instantané, l'histoire du jardin, le moteur et l'éditeur.
 */

export { ROW_ZONE_TYPE as ROW_TYPE } from '@/lib/enums';
import { ROW_ZONE_TYPE as ROW_TYPE } from '@/lib/enums';

type RowZone = { id: string; name: string; typeCode: string; parentId: string | null; geometry: Rect | null };

/**
 * Bande de chaque rang, en centimètres de la scène. Un rang rangé sous un autre rang (dessiné par-dessus) compte pour
 * la même zone hôte. Ordre des rangs : leur nom, chiffres compris (« Rang 2 » avant « Rang 10 »).
 */
export function rowStrips(zones: RowZone[], tileCm: number): Map<string, Rect> {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const hostOf = (z: RowZone): RowZone | null => {
    let p = z.parentId ? byId.get(z.parentId) : undefined;
    for (let n = 0; p && p.typeCode === ROW_TYPE && n < 50; n += 1) p = p.parentId ? byId.get(p.parentId) : undefined;
    return p?.geometry && p.typeCode !== ROW_TYPE ? p : null;
  };
  const groups = new Map<string, { host: RowZone; rows: RowZone[] }>();
  for (const z of zones) {
    if (z.typeCode !== ROW_TYPE) continue;
    const host = hostOf(z);
    if (!host) continue;
    const g = groups.get(host.id) ?? { host, rows: [] };
    g.rows.push(z);
    groups.set(host.id, g);
  }
  const out = new Map<string, Rect>();
  for (const { host, rows } of groups.values()) {
    if (!host.geometry) continue;
    const r = plantableRect(host.geometry, host.typeCode, tileCm);
    const horizontal = r.w >= r.h;
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }) || a.id.localeCompare(b.id));
    const k = sorted.length;
    sorted.forEach((z, i) => {
      const from = Math.round(((horizontal ? r.h : r.w) * i) / k);
      const to = Math.round(((horizontal ? r.h : r.w) * (i + 1)) / k);
      out.set(z.id, horizontal ? { x: r.x, y: r.y + from, w: r.w, h: Math.max(1, to - from) } : { x: r.x + from, y: r.y, w: Math.max(1, to - from), h: r.h });
    });
  }
  return out;
}

/** Les zones, avec la bande de chaque rang à la place de sa géométrie enregistrée (affichage et sélection). */
export function withRowGeometry<T extends RowZone & { geometry: RectGeometry | null }>(zones: T[], tileCm: number): T[] {
  const strips = rowStrips(zones, tileCm);
  if (!strips.size) return zones;
  return zones.map((z) => {
    const s = strips.get(z.id);
    return s ? { ...z, geometry: { v: 1, kind: 'rect', ...s } } : z;
  });
}

/** Rectangle où poser les plants d'une zone ancre : la bande d'un rang, sinon sa surface plantable. */
export function anchorRect(z: { id: string; typeCode?: string; geometry: Rect | null }, strips: Map<string, Rect>, tileCm: number): Rect | null {
  return strips.get(z.id) ?? (z.geometry ? plantableRect(z.geometry, z.typeCode, tileCm) : null);
}
