import { z } from 'zod';
import { FITTED_LAYERS, HEAD_LAYERS, type AvatarLayer } from '@/lib/enums';
import { BASE_GABARIT } from './catalog';

/*
 * Contrat des sprites d'avatar avec les variantes de silhouette (SPEC §10.1, demande à la session sprites
 * `DEMANDE-SPRITES-AVATAR.md`) :
 * - un calque ajusté au corps (haut, bas, tablier, chaussures, objet tenu) peut exister par gabarit,
 *   `avatar/<clé>@<gabarit>-<direction>-<pose>.png` ; à défaut, la variante de base est utilisée ;
 * - les calques portés par la tête sont dessinés pour le gabarit de base et décalés selon le gabarit du corps,
 *   d'après la table `avatar/gabarits.json` (décalage par direction et pose, ou `*` par défaut).
 */

export const gabaritsSchema = z.object({
  v: z.literal(1),
  gabarits: z.record(z.string(), z.record(z.string(), z.tuple([z.number().int(), z.number().int()]))),
});
export type GabaritTable = z.infer<typeof gabaritsSchema>;

const FITTED: ReadonlySet<AvatarLayer> = new Set(FITTED_LAYERS);
const HEAD: ReadonlySet<AvatarLayer> = new Set(HEAD_LAYERS);
const isFitted = (l: AvatarLayer) => FITTED.has(l);
const isHead = (l: AvatarLayer) => HEAD.has(l);

/** Noms de frames à essayer, dans l'ordre : variante du gabarit (calques ajustés), pose demandée, puis à l'arrêt. */
export function frameCandidates(o: { layer: AvatarLayer; spriteKey: string; gabarit: string; dir: string; pose: string; available: ReadonlySet<string> }): string[] {
  const keys = isFitted(o.layer) && o.gabarit !== BASE_GABARIT && o.available.has(`${o.spriteKey}@${o.gabarit}`) ? [`${o.spriteKey}@${o.gabarit}`, o.spriteKey] : [o.spriteKey];
  return keys.flatMap((k) => [`avatar/${k}-${o.dir}-${o.pose}.png`, ...(o.pose === 'arret' ? [] : [`avatar/${k}-${o.dir}-arret.png`])]);
}

/** Décalage (dx, dy) en pixels HD d'un calque de tête pour ce gabarit ; nul pour le gabarit de base ou les autres calques. */
export function headOffset(table: GabaritTable | null, layer: AvatarLayer, gabarit: string, dir: string, pose: string): [number, number] {
  if (!isHead(layer) || gabarit === BASE_GABARIT || !table) return [0, 0];
  const g = table.gabarits[gabarit];
  return g?.[`${dir}-${pose}`] ?? g?.[`${dir}-arret`] ?? g?.['*'] ?? [0, 0];
}
