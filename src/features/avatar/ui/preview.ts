import type { AvatarConfigV1 } from '../config.pure';
import { WALK, type Direction, type Pose } from '../compose';

/*
 * Planification de l'aperçu de l'éditeur (SPEC §10.4) : aucun rendu quand rien ne bouge (NFR-04, §9.1). À l'arrêt,
 * l'aperçu est redessiné seulement quand le brouillon ou la direction changent ; en marche, un minuteur fait défiler
 * les 4 frames de marche à environ 6 i/s.
 */

export const WALK_FRAME_MS = 160;

type State = { draft: AvatarConfigV1; dir: Direction };
type Timers = { setInterval: (fn: () => void, ms: number) => unknown; clearInterval: (id: unknown) => void };

export function startPreview(o: {
  getState: () => State;
  subscribe: (fn: () => void) => () => void;
  draw: (draft: AvatarConfigV1, dir: Direction, pose: Pose) => void;
  walking: boolean;
  timers?: Timers;
}): () => void {
  const timers: Timers = o.timers ?? { setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (id) => window.clearInterval(id as number) }; // as: identifiant rendu par window.setInterval
  let frame = 0;
  const pose = (): Pose => (o.walking ? WALK[frame] ?? 'arret' : 'arret');
  const render = () => { const s = o.getState(); o.draw(s.draft, s.dir, pose()); };
  render();
  const unsubscribe = o.subscribe(render);
  const id = o.walking ? timers.setInterval(() => { frame = (frame + 1) % WALK.length; render(); }, WALK_FRAME_MS) : null;
  return () => {
    unsubscribe();
    if (id !== null) timers.clearInterval(id);
  };
}
