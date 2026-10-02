/*
 * Recoloration par palette (SPEC §10.2). Les calques sont dessinés avec des niveaux de gris réservés : 4 niveaux par
 * emplacement de couleur, du plus clair au plus sombre, et deux plages distinctes pour les emplacements principal et
 * secondaire. Chaque pixel gris réservé prend la couleur de même rang dans la rampe ; les autres pixels (contour,
 * couleurs fixes) et les pixels transparents sont laissés tels quels. Pas de PixiJS : Canvas 2D et vignettes.
 */

/** Niveaux réservés par emplacement (valeur commune R = G = B), du plus clair au plus sombre. */
export const RESERVED_GREYS: readonly (readonly [number, number, number, number])[] = [
  [224, 168, 112, 64],
  [200, 144, 88, 40],
];

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Table niveau de gris → couleur, pour les rampes données (une par emplacement, `null` = emplacement non recoloré). */
export function lookupTable(ramps: readonly (readonly string[] | null)[]): Map<number, Rgb> {
  const table = new Map<number, Rgb>();
  ramps.forEach((ramp, slot) => {
    const greys = RESERVED_GREYS[slot];
    if (!ramp || !greys) return;
    greys.forEach((g, i) => {
      const c = ramp[i];
      if (c) table.set(g, hexToRgb(c));
    });
  });
  return table;
}

/** Recolore en place des pixels RGBA (`ImageData.data`). */
export function recolorPixels(data: Uint8ClampedArray, ramps: readonly (readonly string[] | null)[]): Uint8ClampedArray {
  const table = lookupTable(ramps);
  if (!table.size) return data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] ?? 0;
    if (r !== data[i + 1] || r !== data[i + 2]) continue;
    const c = table.get(r);
    if (!c) continue;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  }
  return data;
}
