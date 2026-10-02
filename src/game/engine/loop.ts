/*
 * Rendu à la demande (SPEC §9.1) : rien ne tourne tant que rien ne change. Un rendu est demandé quand un store change,
 * quand la caméra bouge ou au redimensionnement. Les animations ambiantes font tourner la boucle à 30 i/s au plus,
 * seulement sans « animations réduites », onglet visible, et s'arrêtent après 20 s sans interaction.
 * Le renderer et l'ordonnanceur sont injectés : le moteur se teste sans navigateur ni WebGL (MAP-08).
 */

export type Renderer = { render: (elapsedMs: number) => void };
export type FrameScheduler = { request: (cb: (now: number) => void) => number; cancel: (id: number) => void; now: () => number };

export const AMBIENT_MAX_FPS = 30;
export const AMBIENT_IDLE_STOP_MS = 20_000;

export class RenderLoop {
  /** Nombre de rendus effectués : observable par les tests et par `data-renders` en e2e. */
  renders = 0;
  private frame: number | null = null;
  private ambient = false;
  private lastFrameAt = 0;
  private lastInteractionAt: number;
  private visible = true;
  private listeners = new Set<(running: boolean) => void>();

  constructor(private renderer: Renderer, private scheduler: FrameScheduler, private opts: { reducedMotion: boolean }) {
    this.lastInteractionAt = scheduler.now();
  }

  /** La boucle d'animation tourne-t-elle (`data-ticker` = running / stopped) ? */
  get running(): boolean {
    return this.ambient;
  }

  onRunningChange(cb: (running: boolean) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Un rendu unique, au prochain frame ; plusieurs demandes dans le même frame n'en font qu'un. */
  requestRender() {
    if (this.frame !== null) return;
    this.frame = this.scheduler.request((now) => this.step(now));
  }

  /** Geste de l'utilisateur : relance les animations ambiantes si elles sont permises. */
  noteInteraction() {
    this.lastInteractionAt = this.scheduler.now();
    if (!this.ambient) this.setAmbient(this.ambientAllowed());
    this.requestRender();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.setAmbient(visible && this.ambientAllowed());
  }

  setReducedMotion(reduced: boolean) {
    this.opts.reducedMotion = reduced;
    this.setAmbient(this.ambientAllowed());
  }

  destroy() {
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null;
    this.setAmbient(false);
    this.listeners.clear();
  }

  private ambientAllowed() {
    return !this.opts.reducedMotion && this.visible && this.scheduler.now() - this.lastInteractionAt < AMBIENT_IDLE_STOP_MS;
  }

  private setAmbient(on: boolean) {
    if (on === this.ambient) return;
    this.ambient = on;
    for (const l of this.listeners) l(on);
    if (on) this.requestRender();
  }

  private step(now: number) {
    this.frame = null;
    if (this.ambient && !this.ambientAllowed()) this.setAmbient(false);
    if (this.ambient && now - this.lastFrameAt < 1000 / AMBIENT_MAX_FPS) {
      // Trop tôt pour un nouveau frame d'animation : on attend le suivant sans rendre.
      this.frame = this.scheduler.request((t) => this.step(t));
      return;
    }
    const elapsed = this.lastFrameAt ? now - this.lastFrameAt : 0;
    this.lastFrameAt = now;
    this.renders += 1;
    this.renderer.render(elapsed);
    if (this.ambient) this.frame = this.scheduler.request((t) => this.step(t));
  }
}

/** Ordonnanceur du navigateur (requestAnimationFrame). */
export const browserScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
};
