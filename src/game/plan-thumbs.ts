/*
 * Vignettes de l'éditeur de plan (SPEC §9.7, VOC-01) : la tuile ou l'objet réel de chaque type, copiés en fichiers
 * individuels par `pnpm assets:sync` dans `public/sprites/plan/` (`tuiles/chemin-1` → `tuiles-chemin-1.png`). Sans
 * import d'alias : ce module est aussi lu par le script de synchronisation.
 */

/** Type de case peinte → frame de sa vignette. */
export const CELL_THUMBS = {
  path: 'tuiles/chemin-1', gravel_path: 'tuiles/gravier-1', water: 'tuiles/eau-f1', bare_soil: 'tuiles/terre-nue-1', mulch: 'tuiles/paillage-paille-1',
  stepping_stones: 'tuiles/dalles-1', hedge: 'structures/haie-h', fence: 'structures/cloture-h',
} as const;

/** Type de zone (code) → frame de sa vignette ; les types personnalisés ont une vignette générique. */
export const ZONE_THUMBS: Record<string, string> = {
  bed: 'structures/planche-centre', row: 'tuiles/terre-2', square_bed: 'structures/carre-1x1', container: 'structures/bac-1x1', pot: 'structures/pot',
  greenhouse: 'structures/serre', tunnel: 'structures/tunnel-nantais', bench: 'structures/table-centre', nursery: 'tuiles/terre-nue-1',
  seed_tray: 'structures/plaque-alveolee-vide', cell: 'structures/godets-vide', compost: 'structures/composteur-plein', orchard: 'cultures/pommier-4-feuillage',
  fruit_hedge: 'tuiles/paillage-brf-1', flower_bed: 'tuiles/paillage-paille-1', meadow: 'tuiles/herbe-3', path: 'tuiles/gravier-2', plot: 'tuiles/terre-nue-2',
};
export const GENERIC_ZONE_THUMB = 'tuiles/terre-1';

/** Aménagements ponctuels posés comme des objets (catalogue de déco, `fixture`). */
export const FIXTURE_THUMBS = ['structures/robinet', 'structures/recuperateur-eau', 'cultures/pommier-4-feuillage', 'structures/portail-ferme'];

export const planThumbUrl = (frame: string) => `/sprites/plan/${frame.replace('/', '-')}.png`;
export const ALL_PLAN_THUMBS: readonly string[] = [...new Set([...Object.values(CELL_THUMBS), ...Object.values(ZONE_THUMBS), GENERIC_ZONE_THUMB, ...FIXTURE_THUMBS])];
