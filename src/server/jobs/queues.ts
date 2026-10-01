import type { Mail } from '../mail/templates';

/** Files pg-boss et leurs charges utiles (SPEC §3.6). */
export type JobPayloads = {
  'mail.send': Mail;
};

export type JobName = keyof JobPayloads;

export const QUEUES: readonly JobName[] = ['mail.send'];

export interface JobQueue {
  enqueue<N extends JobName>(name: N, data: JobPayloads[N]): Promise<void>;
}
