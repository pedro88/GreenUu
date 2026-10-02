import type { Mail } from '../mail/templates';

/** Files pg-boss et leurs charges utiles (SPEC §3.6). */
export type JobPayloads = {
  'mail.send': Mail;
  /** Rafraîchit `shared_result_fact` (anti-rebond de 5 min après un bilan ou un changement de partage). */
  'reco.refresh-facts': Record<string, never>;
  /** Produit l'archive d'un export RGPD (§11.4). */
  'privacy.export': { exportId: string };
};

export type JobName = keyof JobPayloads;

export const QUEUES: readonly JobName[] = ['mail.send', 'reco.refresh-facts', 'privacy.export'];

/** Options pg-boss utiles : clé d'unicité (anti-rebond) et délai de démarrage en secondes. */
export type EnqueueOptions = { singletonKey?: string; startAfter?: number };

export interface JobQueue {
  enqueue<N extends JobName>(name: N, data: JobPayloads[N], opts?: EnqueueOptions): Promise<void>;
}
