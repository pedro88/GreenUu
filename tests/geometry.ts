import type { RectGeometry } from '../src/features/zone/tree';

/** Rectangle de géométrie (centimètres), partagé par les tests unitaires et d'intégration. */
export const rect = (x: number, y: number, w: number, h: number): RectGeometry => ({ v: 1, kind: 'rect', x, y, w, h });
