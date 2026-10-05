import type { VisualPhase } from '@/features/scene/phase.pure';
import type { Season } from '@/features/scene/tiles.pure';

/* Couleurs du moteur : fond d'herbe, et assets de substitution quand l'atlas manque (palette des maquettes). */

/** Fond d'herbe de la scène extérieure, par saison (tons relevés sur les tuiles d'herbe livrées, adoucis). */
export const GRASS_COLORS: Record<Season, number> = { spring: 0x8fbb5c, summer: 0x86b257, autumn: 0x9caa58, winter: 0xb9c7ae };
/** Opacité des tuiles d'herbe sur la teinte de fond : la texture reste visible, le contraste baisse. */
export const GRASS_TEXTURE_ALPHA = 0.5;
export const INDOOR_FLOOR = 0xe9e4da;

export const ZONE_COLORS: Record<string, number> = {
  bed: 0x8b5a3c, row: 0x9a6a48, square_bed: 0x7a4e33, container: 0x7a4e33, pot: 0xb4683f, greenhouse: 0xcfe3e8, tunnel: 0xdfeae0, bench: 0xa77b52,
  nursery: 0xc9a979, seed_tray: 0x6b4a33, cell: 0x6b4a33, compost: 0x5b4636, orchard: 0x7fae5a, fruit_hedge: 0x5f8f43, flower_bed: 0xd9b05b,
  meadow: 0x8fbf63, path: 0xc8b48c, plot: 0xb08a60,
};
export const TERRAIN_COLORS: Record<string, number> = {
  path: 0xc6a879, gravel_path: 0xb9b2a4, stepping_stones: 0xa9a39a, water: 0x4f8fc0, bare_soil: 0x9a6a48, mulch: 0xd9b05b, hedge: 0x3f6b35, fence: 0x7a5a3a,
};
export const PHASE_SIZE: Record<VisualPhase, number> = { seed: 6, sprout: 10, growing: 16, flowering: 20, fruiting: 22, harvest_ready: 24, seed_set: 20, dormant: 12, finished: 10 };
export const PHASE_COLOR: Record<VisualPhase, number> = {
  seed: 0x8b5a3c, sprout: 0x9fcf6a, growing: 0x6f9a4f, flowering: 0xe58fb5, fruiting: 0xd4573b, harvest_ready: 0xf2c14e, seed_set: 0xb08a60, dormant: 0x8a7a6a, finished: 0x9a8f80,
};
/** Sillon d'un rang : creux sombre et crête claire, sur la terre de la planche. */
export const FURROW = { groove: 0x4a2f1f, grooveAlpha: 0.55, ridge: 0xd8b07e, ridgeAlpha: 0.4 };
export const STATE_COLORS: Record<string, number> = {
  overdue_ticket: 0xd4573b, thirsty: 0x4f8fc0, disease: 0x8a5fa8, pest: 0x7a8a2a, harvest_ready: 0xf2c14e, needs_confirmation: 0xffffff, assigned_to_me: 0x2e1f22,
};
export const OUTLINE = 0x2e222f;
export const HIGHLIGHT = 0xf2c14e;
