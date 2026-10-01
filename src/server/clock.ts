import { env } from './env';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(at: Date | string): Clock {
  const t = typeof at === 'string' ? new Date(at) : at;
  return { now: () => new Date(t.getTime()) };
}

/** Horloge de l'application : figée si APP_NOW est défini (tests), sinon système. */
export function appClock(): Clock {
  const fixed = env().APP_NOW;
  return fixed ? fixedClock(fixed) : systemClock;
}
