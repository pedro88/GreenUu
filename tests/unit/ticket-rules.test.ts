import { describe, expect, it } from 'vitest';
import { canTransition, compareTodayTasks, occurrencesBetween, parseMentions, validateRrule } from '@/features/ticket/rules.pure';
import { signPayload, verifyPayload } from '@/lib/tokens';

describe('règles du ticketing', () => {
  it('[TCK-07] `skipped` ne se pose pas à la main', () => {
    expect(canTransition('todo', 'skipped')).toBe(false);
    expect(canTransition('todo', 'skipped', { system: true })).toBe(true);
    expect(canTransition('todo', 'done')).toBe(true);
    expect(canTransition('done', 'todo')).toBe(true);
    expect(canTransition('done', 'in_progress')).toBe(false);
    expect(canTransition('blocked', 'in_progress')).toBe(true);
  });

  // Bascules de l'heure d'été à Bruxelles en 2026 : dimanche 29 mars et dimanche 25 octobre (calculées).
  it('[RCR-01] aux changements d\'heure, une occurrence quotidienne garde sa date : ni doublon ni trou', () => {
    expect(occurrencesBetween('FREQ=DAILY', '2026-10-23', null, '2026-10-23', '2026-10-27')).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect(occurrencesBetween('FREQ=DAILY', '2026-03-27', null, '2026-03-27', '2026-03-31')).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
    expect(occurrencesBetween('FREQ=WEEKLY;BYDAY=SU', '2026-03-01', '2026-11-01', '2026-03-22', '2026-04-05')).toEqual(['2026-03-22', '2026-03-29', '2026-04-05']);
    expect(occurrencesBetween('FREQ=WEEKLY;BYDAY=SU', '2026-03-01', '2026-11-01', '2026-10-18', '2026-11-01')).toEqual(['2026-10-18', '2026-10-25', '2026-11-01']);
  });

  it('[RCR-01] tous les 2 jours en juillet : 01, 03 … 15/07, rien en juin ni en août', () => {
    const rule = validateRrule('FREQ=DAILY;INTERVAL=2;BYMONTH=7') ?? '';
    expect(occurrencesBetween(rule, '2026-07-01', null, '2026-07-01', '2026-07-15')).toEqual(
      ['2026-07-01', '2026-07-03', '2026-07-05', '2026-07-07', '2026-07-09', '2026-07-11', '2026-07-13', '2026-07-15'],
    );
    const year = occurrencesBetween(rule, '2026-07-01', null, '2026-06-01', '2026-08-31');
    expect(year.every((d) => d.startsWith('2026-07'))).toBe(true);
  });

  it('[RCR-06] une règle hors du sous-ensemble autorisé est refusée', () => {
    expect(validateRrule('FREQ=HOURLY')).toBeNull();
    expect(validateRrule('FREQ=DAILY;BYHOUR=8')).toBeNull();
    expect(validateRrule('FREQ=DAILY;INTERVAL=0')).toBeNull();
    expect(validateRrule('FREQ=WEEKLY;BYDAY=MO,TH')).toBe('FREQ=WEEKLY;BYDAY=MO,TH');
  });

  it('[TCK-08] tri des tâches du jour : retard, priorité, échéance', () => {
    const rows = [
      { id: 'a', dueOn: '2026-06-15', priority: 'urgent' as const },
      { id: 'b', dueOn: '2026-06-10', priority: 'low' as const },
      { id: 'c', dueOn: '2026-06-15', priority: 'normal' as const },
      { id: 'd', dueOn: '2026-06-12', priority: 'high' as const },
    ];
    expect([...rows].sort(compareTodayTasks('2026-06-15')).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('[TCK-13] mentions : pseudos extraits, adresses e-mail ignorées', () => {
    expect(parseMentions('Merci @marie et @inconnu ! écris à a@b.fr')).toEqual(['marie', 'inconnu']);
  });

  it('[NTF-04] jeton de désinscription signé et infalsifiable', () => {
    const t = signPayload('user-1:assigned', 'secret-secret');
    expect(verifyPayload(t, 'secret-secret')).toBe('user-1:assigned');
    expect(verifyPayload(t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), 'secret-secret')).toBeNull();
    expect(verifyPayload(t, 'autre-secret')).toBeNull();
  });
});
