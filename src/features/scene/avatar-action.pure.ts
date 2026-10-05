/*
 * Action visuelle d'un avatar (SPEC §9.5, LIV-08) : l'avatar rejoue sa dernière action réelle, d'après le dernier
 * événement de domaine qu'il a produit sur une zone du jardin. Rien n'est inventé : au-delà de 24 h, pas d'action.
 * Sans import d'alias : la liste des actions est aussi lue par `pnpm assets:sync` (atlas à copier).
 */

/** Actions que la vue jardin sait jouer ; chacune a son atlas `avatar-action-<action>.json`. */
export const SCENE_ACTIONS = ['arroser', 'semer', 'planter', 'recolter', 'observer', 'photo', 'content', 'becher', 'porter'] as const;
export type SceneAction = (typeof SCENE_ACTIONS)[number];
/** Atlas d'action copiés par `assets:sync` : les actions rejouées, plus la conversation des rencontres (LIV-02). */
export const SYNCED_ACTIONS = [...SCENE_ACTIONS, 'papoter'] as const;

/** Fenêtre de l'action rejouée. */
export const ACTION_WINDOW_MS = 24 * 3_600_000;

export type ActionSource = {
  type: string;
  /** Entrée de journal : type et intervention. */
  journalKind?: string | null;
  intervention?: string | null;
  hasPhoto?: boolean;
  /** Étape enregistrée (`culture.stage_recorded`). */
  stage?: string | null;
  /** Méthode de la culture créée. */
  method?: string | null;
  /** Étiquette d'action du ticket terminé. */
  actionTag?: string | null;
};

const BY_TAG: Record<string, SceneAction> = { watering: 'arroser', sowing: 'semer', planting: 'planter', harvest: 'recolter', weeding: 'becher' };
const BY_INTERVENTION: Record<string, SceneAction> = { watering: 'arroser', weeding: 'becher', mulching: 'becher', transplant: 'planter' };
const BY_STAGE: Record<string, SceneAction> = { sowing: 'semer', planting: 'planter', transplanting: 'planter', harvest_start: 'recolter', harvest_end: 'recolter' };

export function actionOf(e: ActionSource): SceneAction {
  switch (e.type) {
    case 'harvest.recorded':
      return 'recolter';
    case 'journal.entry_created':
      if (e.journalKind === 'intervention') return BY_INTERVENTION[e.intervention ?? ''] ?? 'porter';
      if (e.journalKind === 'photo' || e.hasPhoto) return 'photo';
      return 'observer';
    case 'culture.stage_recorded':
      return BY_STAGE[e.stage ?? ''] ?? 'observer';
    case 'culture.created':
      return e.method === 'direct_sowing' || e.method === 'tray_sowing' ? 'semer' : 'planter';
    case 'ticket.completed':
      return BY_TAG[e.actionTag ?? ''] ?? 'content';
    default:
      return 'porter';
  }
}

/** Action rejouée : seulement si l'événement a moins de 24 h (LIV-08). */
export function replayedAction(e: ActionSource & { occurredAt: Date }, now: Date): SceneAction | null {
  const age = now.getTime() - e.occurredAt.getTime();
  return age >= 0 && age < ACTION_WINDOW_MS ? actionOf(e) : null;
}
