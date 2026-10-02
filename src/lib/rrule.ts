import * as rruleModule from 'rrule';

/**
 * Adaptateur d'import de `rrule` : sous Node (tsx, worker), le paquet est chargé en CommonJS et ses
 * exports nommés ne sont pas détectés ; Next et Vitest utilisent sa version ESM. On accepte les deux.
 */
// as: interop CommonJS / ESM — sous Node le module réel est exposé sous `default`
const lib = (rruleModule as unknown as { default?: typeof rruleModule }).default ?? rruleModule;

export const RRule = lib.RRule;
export const rrulestr = lib.rrulestr;
