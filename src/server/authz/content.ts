import type { GuideVisibility } from '@/lib/enums';

/** Gardes des contenus hors jardin (SPEC §3.3 point 6, §5.2 « Permissions hors jardin »). Fonctions pures. */

export type Viewer = { id: string; platformRole: 'user' | 'moderator' | 'admin' } | null;

export type GuideFacts = {
  authorId: string;
  visibility: GuideVisibility;
  /** Au moins une version publiée. */
  published: boolean;
  hidden: boolean;
  deleted: boolean;
  /** Le lecteur est membre actif du jardin du guide privé. */
  viewerIsGardenMember: boolean;
};

export const isModerator = (v: Viewer) => v?.platformRole === 'moderator' || v?.platformRole === 'admin';

/**
 * Lecture d'un guide : brouillon jamais publié → auteur seul ; masqué par la modération → auteur et modération ;
 * privé → membres actifs du jardin (un rôle plateforme ne donne aucun accès aux données privées) ; sinon tout le monde.
 */
export function canReadGuide(v: Viewer, g: GuideFacts): boolean {
  if (g.deleted) return false;
  const isAuthor = v !== null && v.id === g.authorId;
  if (g.hidden) return isAuthor || (isModerator(v) && g.visibility !== 'private');
  if (!g.published) return isAuthor;
  if (g.visibility === 'private') return isAuthor || g.viewerIsGardenMember;
  return true;
}

/** Listé et recherchable (RG-GUI-03) : public, publié, ni masqué ni supprimé. */
export function isListedGuide(g: Pick<GuideFacts, 'visibility' | 'published' | 'hidden' | 'deleted'>): boolean {
  return g.visibility === 'public' && g.published && !g.hidden && !g.deleted;
}

export function canEditGuide(v: Viewer, g: Pick<GuideFacts, 'authorId' | 'deleted'>): boolean {
  return v !== null && v.id === g.authorId && !g.deleted;
}

/** Fork : toute personne connectée qui peut lire une version publiée. */
export function canForkGuide(v: Viewer, g: GuideFacts): boolean {
  return v !== null && g.published && canReadGuide(v, g);
}
