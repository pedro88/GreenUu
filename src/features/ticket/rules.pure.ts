import { RRule, rrulestr } from '@/lib/rrule';
import type { Stage, TicketPriority, TicketStatus } from '@/lib/enums';

/** Règles pures du ticketing (RG-TCK-02, 06, 07, 10, 14). */

const OPEN: readonly TicketStatus[] = ['todo', 'in_progress', 'blocked'];
export const isOpen = (s: TicketStatus) => OPEN.includes(s);

/** Transitions autorisées (RG-TCK-02). `skipped` est réservé au système (occurrences manquées). */
export function canTransition(from: TicketStatus, to: TicketStatus, opts: { system?: boolean } = {}): boolean {
  if (from === to) return false;
  if (to === 'skipped') return opts.system === true && isOpen(from);
  if (isOpen(from) && (isOpen(to) || to === 'done' || to === 'cancelled')) return true;
  if ((from === 'done' || from === 'cancelled' || from === 'skipped') && to === 'todo') return true;
  return false;
}

const ALLOWED_KEYS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'COUNT', 'UNTIL']);
const ALLOWED_FREQ = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

/** Sous-ensemble RRULE accepté (RG-TCK-07, RCR-06). Renvoie la règle normalisée ou null. */
export function validateRrule(rule: string): string | null {
  const body = rule.trim().replace(/^RRULE:/i, '');
  if (!body) return null;
  const parts = body.split(';').map((p) => p.split('='));
  const keys = new Set<string>();
  for (const [k, v] of parts) {
    if (!k || v === undefined || v === '' || !ALLOWED_KEYS.has(k.toUpperCase()) || keys.has(k.toUpperCase())) return null;
    keys.add(k.toUpperCase());
  }
  const freq = parts.find(([k]) => k?.toUpperCase() === 'FREQ')?.[1]?.toUpperCase();
  if (!freq || !ALLOWED_FREQ.has(freq)) return null;
  const interval = parts.find(([k]) => k?.toUpperCase() === 'INTERVAL')?.[1];
  if (interval !== undefined && !(Number(interval) >= 1 && Number(interval) <= 366)) return null;
  try {
    rrulestr(`RRULE:${body.toUpperCase()}`);
  } catch {
    return null;
  }
  return body.toUpperCase();
}

const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
};
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** Occurrences (dates ISO) d'une série entre `from` et `to` inclus. Dates « flottantes » en UTC. */
export function occurrencesBetween(rule: string, dtstart: string, until: string | null, from: string, to: string): string[] {
  const options = RRule.parseString(rule);
  const r = new RRule({ ...options, dtstart: utc(dtstart), ...(until ? { until: new Date(utc(until).getTime() + 86_399_000) } : {}) });
  return r.between(utc(from), new Date(utc(to).getTime() + 86_399_000), true).map(isoOf);
}

const PRIORITY_RANK: Record<TicketPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Tri de « mes tâches du jour » : retard d'abord, puis priorité, puis échéance (RG-TCK-06). */
export function compareTodayTasks(today: string) {
  return (a: { dueOn: string | null; priority: TicketPriority }, b: { dueOn: string | null; priority: TicketPriority }) => {
    const lateA = a.dueOn !== null && a.dueOn < today ? 0 : 1;
    const lateB = b.dueOn !== null && b.dueOn < today ? 0 : 1;
    return lateA - lateB || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999');
  };
}

/** Pseudos mentionnés (`@pseudo`) dans un commentaire (RG-TCK-14). */
export function parseMentions(body: string): string[] {
  return [...new Set([...body.matchAll(/(?:^|[^\w@])@([a-z0-9_-]{3,24})\b/gi)].map((m) => (m[1] ?? '').toLowerCase()))];
}

/** Tickets d'étape (RG-TCK-10) : étapes concernées et délai d'affichage avant échéance. */
export const STAGE_TICKET_LEAD_DAYS: Partial<Record<Stage, number>> = {
  sowing: 3, transplanting: 3, planting: 3, harvest_start: 0, end: 0,
};
export const stageCreatesTicket = (s: Stage) => STAGE_TICKET_LEAD_DAYS[s] !== undefined;
