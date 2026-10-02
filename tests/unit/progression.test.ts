import { describe, expect, it } from 'vitest';
import { evaluate, rotationStreak } from '@/features/progression/achievements.pure';
import { astronomicalSeason, pickDaily, seasonalTemplates, type TaskCandidate } from '@/features/progression/quests.pure';
import { applyRules, candidatesFor, emptyHistory, levelOf, project, reversalsFor, score, type XpEvent } from '@/features/progression/rules.pure';

const AT = new Date('2026-06-17T10:00:00Z');
const ev = (type: string, payload: Record<string, unknown> = {}, ctx: XpEvent['ctx'] = {}, over: Partial<XpEvent> = {}): XpEvent => ({
  id: `e-${Math.random()}`, type, actorId: 'alice', gardenId: 'g1', subjectId: `s-${Math.random().toString(36).slice(2)}`, occurredAt: AT, payload, ctx: { speciesSkill: 'vegetable', ...ctx }, ...over,
});

describe('barème (§8.2)', () => {
  const cases: [string, XpEvent, string, number, [string | null, string | null]][] = [
    ['stage.sown_planted', ev('culture.stage_recorded', { stage: 'planting', actualOn: '2026-06-17' }), 'stage.sown_planted', 10, ['vegetable', null]],
    ['stage.other', ev('culture.stage_recorded', { stage: 'flowering', actualOn: '2026-06-17' }), 'stage.other', 3, ['vegetable', null]],
    ['journal.observation', ev('journal.entry_created', { kind: 'note', hasPhoto: false, structured: false }, { textLength: 25 }), 'journal.observation', 5, ['vegetable', null]],
    ['journal.problem', ev('journal.entry_created', { kind: 'disease', hasPhoto: false, structured: true }), 'journal.problem', 8, ['vegetable', null]],
    ['journal.photo', ev('journal.entry_created', { kind: 'photo', hasPhoto: true, structured: false }), 'journal.photo', 3, ['vegetable', null]],
    ['harvest.recorded', ev('harvest.recorded', { seedSaving: true }), 'harvest.recorded', 8, ['vegetable', 'seeds']],
    ['result.complete', ev('result.submitted', { completeness: 100 }, { cultureId: 'c', seasonId: 's' }), 'result.complete', 40, ['vegetable', null]],
    ['result.partial', ev('result.submitted', { completeness: 60 }, { cultureId: 'c', seasonId: 's' }), 'result.partial', 15, ['vegetable', null]],
    ['ticket.completed', ev('ticket.completed', { firstTime: true, createdBy: 'alice', assignedToGroup: false }, { speciesSkill: null, compostZone: true }), 'ticket.completed', 5, ['compost', null]],
    ['guide.first_published', ev('guide.published', { firstPublication: true, visibility: 'public', words: 320 }), 'guide.first_published', 30, ['vegetable', null]],
    ['guide.applied_by_other', ev('guide.applied', { cultureId: 'c' }, { recipientId: 'bob', actorEligible: true, authorIsMember: false }), 'guide.applied_by_other', 5, ['vegetable', null]],
    ['guide.forked_by_other', ev('guide.forked', { visibility: 'public' }, { recipientId: 'bob', actorEligible: true }), 'guide.forked_by_other', 5, ['vegetable', null]],
    ['tip.useful_vote', ev('tip.voted', { value: 1, previous: 0 }, { recipientId: 'bob', actorEligible: true, speciesSkill: null }), 'tip.useful_vote', 2, [null, null]],
    ['variety.approved', ev('variety.approved', {}, { recipientId: 'bob' }), 'variety.approved', 15, ['vegetable', null]],
  ];
  it.each(cases)('[XP-01] %s : code, montant et compétences conformes', (_name, e, code, amount, skills) => {
    const [d] = score(e, emptyHistory(), '2026-06-17');
    expect(d).toMatchObject({ code, amount, reason: 'award', skills });
  });

  it('[XP-01] bonus collectif et bilan documenté', () => {
    const t = score(ev('ticket.completed', { firstTime: true, createdBy: 'bruno', assignedToGroup: false }, { orgType: 'collective' }), emptyHistory(), '2026-06-17');
    expect(t.map((d) => [d.code, d.amount])).toEqual([['ticket.completed', 5], ['ticket.collective_help', 3]]);
    const r = score(ev('result.submitted', { completeness: 100 }, { cultureId: 'c', seasonId: 's', observationDays: 3 }), emptyHistory(), '2026-06-17');
    expect(r.map((d) => [d.code, d.amount])).toEqual([['result.complete', 40], ['result.documented_bonus', 10]]);
  });

  it('[XP-16] créer un jardin, une zone, un ticket, commenter ou changer d\'avatar ne rapporte rien', () => {
    for (const type of ['garden.created', 'zone.created', 'ticket.created', 'comment.created', 'avatar.updated']) expect(candidatesFor(ev(type))).toEqual([]);
  });
});

describe('anti-abus (§8.3)', () => {
  const harvest = (at: Date) => ev('harvest.recorded', {}, {}, { occurredAt: at });

  it('[XP-03] la 11e récolte du jour est enregistrée à 0 XP (cap_reached)', () => {
    const h = emptyHistory();
    const drafts = Array.from({ length: 11 }, (_, i) => score(harvest(new Date(AT.getTime() + i * 3_600_000)), h, '2026-06-17')).flat();
    expect(drafts.slice(0, 10).every((d) => d.amount === 8)).toBe(true);
    expect(drafts[10]).toMatchObject({ amount: 0, reason: 'cap_reached' });
  });

  it('[XP-04] plafond atteint à 23 h 50 : la récolte de 0 h 05 le lendemain rapporte à nouveau 8 XP', () => {
    const h = emptyHistory();
    for (let i = 0; i < 10; i += 1) score(harvest(new Date(AT.getTime() + i * 3_600_000)), h, '2026-06-17');
    expect(score(harvest(new Date('2026-06-17T21:50:00Z')), h, '2026-06-17')[0]?.amount).toBe(0);
    expect(score(harvest(new Date('2026-06-17T22:05:00Z')), h, '2026-06-18')[0]?.amount).toBe(8);
  });

  it('[XP-05] [XP-06] supprimer une entrée avec photo annule 5 et 3 ; la restaurer ne redonne rien', () => {
    const h = emptyHistory();
    const e = ev('journal.entry_created', { kind: 'note', hasPhoto: true, structured: false }, { textLength: 40 });
    const gains = score(e, h, '2026-06-17');
    expect(gains.map((g) => g.amount)).toEqual([5, 3]);
    const rev = reversalsFor(gains.map((g, i) => ({ id: `l${i}`, amount: g.amount, reversed: false })));
    expect(rev.map((r) => r.amount)).toEqual([-5, -3]);
    expect(project([...gains.map((g) => ({ amount: g.amount, skillPrimary: null, skillSecondary: null })), ...rev.map((r) => ({ amount: r.amount, skillPrimary: null, skillSecondary: null }))]).total).toBe(0);
    expect(score({ ...e, id: 'restored' }, h, '2026-06-17')).toEqual([]);
  });

  it('[XP-07] un ticket rouvert puis refermé, par une autre personne, ne rapporte rien de plus', () => {
    const h = emptyHistory();
    const first = ev('ticket.completed', { firstTime: true, createdBy: 'alice' }, {}, { subjectId: 't1' });
    expect(score(first, h, '2026-06-17')).toHaveLength(1);
    expect(score({ ...first, id: 'x', actorId: 'bob', payload: { firstTime: false } }, h, '2026-06-17')).toEqual([]);
    // Même si l'événement se présentait comme une première fois, la clé `ticket.completed:{ticketId}` est consommée.
    expect(score({ ...first, id: 'y', actorId: 'bob' }, h, '2026-06-17')).toEqual([]);
  });

  it('[XP-08] 16 occurrences récurrentes terminées le même jour : la 16e est plafonnée', () => {
    const h = emptyHistory();
    const drafts = Array.from({ length: 16 }, (_, i) => score(ev('ticket.completed', { firstTime: true, createdBy: 'alice' }, {}, { subjectId: `occ${i}`, occurredAt: new Date(AT.getTime() + i * 3_600_000) }), h, '2026-06-17')).flat();
    expect(drafts.filter((d) => d.amount === 5)).toHaveLength(15);
    expect(drafts[15]).toMatchObject({ reason: 'cap_reached', amount: 0 });
  });

  it('[XP-09] un vote « utile » éligible rapporte 2 XP à l\'auteur ; le retirer l\'annule', () => {
    const [g] = score(ev('tip.voted', { value: 1, previous: 0 }, { recipientId: 'alice', actorEligible: true }, { actorId: 'bob', subjectId: 'tip1' }), emptyHistory(), '2026-06-17');
    expect(g).toMatchObject({ recipientId: 'alice', amount: 2 });
    expect(reversalsFor([{ id: 'g', amount: 2, reversed: false }])).toEqual([{ reversesEntryId: 'g', amount: -2, key: 'reversal:g' }]);
    expect(score(ev('tip.voted', { value: 1, previous: 0 }, { recipientId: 'alice', actorEligible: false }, { actorId: 'neuf' }), emptyHistory(), '2026-06-17')).toEqual([]);
  });

  it('[XP-10] 8 membres du même jardin votent « utile » : 5 comptent pour l\'XP (10 XP)', () => {
    const h = emptyHistory();
    const drafts = Array.from({ length: 8 }, (_, i) => score(ev('tip.voted', { value: 1, previous: 0 }, { recipientId: 'alice', actorEligible: true, voterIsGardenMate: true }, { actorId: `m${i}`, subjectId: 'tip1', occurredAt: new Date(AT.getTime() + i * 600_000) }), h, '2026-06-17')).flat();
    expect(drafts).toHaveLength(8);
    expect(drafts.reduce((a, d) => a + d.amount, 0)).toBe(10);
  });

  it('[XP-11] bilan à 60 % (+15) puis complété : +25, jamais plus de 40 ; +10 si documenté', () => {
    const h = emptyHistory();
    const ctx = { cultureId: 'c1', seasonId: 's1' };
    expect(score(ev('result.submitted', { completeness: 60 }, ctx), h, '2026-06-17').map((d) => d.amount)).toEqual([15]);
    expect(score(ev('result.updated', { completeness: 100 }, { ...ctx, observationDays: 3 }), h, '2026-06-17', 15).map((d) => [d.code, d.amount])).toEqual([['result.complete', 25], ['result.documented_bonus', 10]]);
    expect(score(ev('result.updated', { completeness: 100 }, ctx), h, '2026-06-17', 40)).toEqual([]);
  });

  it('[XP-12] une observation antidatée de 10 jours compte dans le plafond du jour de saisie', () => {
    const h = emptyHistory();
    for (let i = 0; i < 10; i += 1) score(ev('journal.entry_created', { kind: 'note', structured: true, observedAt: '2026-06-07' }, {}, { occurredAt: new Date(AT.getTime() + i * 3_600_000) }), h, '2026-06-17');
    expect(score(ev('journal.entry_created', { kind: 'note', structured: true, observedAt: '2026-06-07' }), h, '2026-06-17')[0]).toMatchObject({ amount: 0, reason: 'cap_reached' });
  });

  it('[XP-13] 35 événements en 10 minutes : à partir du 31e, 0 XP et signalement', () => {
    const h = emptyHistory();
    const drafts = Array.from({ length: 35 }, (_, i) => score(ev('culture.stage_recorded', { stage: 'flowering', actualOn: '2026-06-17' }, {}, { subjectId: `c${i}`, occurredAt: new Date(AT.getTime() + i * 10_000) }), h, '2026-06-17')).flat();
    expect(drafts.slice(0, 20).every((d) => d.amount === 3)).toBe(true);
    expect(drafts.slice(30).every((d) => d.amount === 0 && d.flagged === true)).toBe(true);
    expect(drafts[29]?.flagged).toBeUndefined();
  });

  it('applyRules ignore une clé déjà consommée', () => {
    const h = emptyHistory();
    const [c] = candidatesFor(ev('harvest.recorded', {}, {}, { subjectId: 'h1' }));
    if (!c) throw new Error('candidat');
    expect(applyRules([c, c], h, AT, '2026-06-17')).toHaveLength(1);
  });
});

describe('niveaux et compétences (§8.4)', () => {
  it('[LVL-01] 0, 99, 100, 299, 300, 4 500 → 1, 1, 2, 2, 3, 10', () => {
    expect([0, 99, 100, 299, 300, 4500].map(levelOf)).toEqual([1, 1, 2, 2, 3, 10]);
  });

  it('[LVL-02] un recalcul qui ramène l\'XP au niveau 4 laisse le niveau affiché à 5', () => {
    expect(project([{ amount: 650, skillPrimary: null, skillSecondary: null }], 5)).toMatchObject({ total: 650, level: 5 });
    expect(levelOf(650)).toBe(4);
  });

  it('[LVL-03] une récolte de tomate en serre : vegetable et greenhouse +8 chacune, total +8', () => {
    const [d] = score(ev('harvest.recorded', { seedSaving: false }, { speciesSkill: 'vegetable', underCover: true }), emptyHistory(), '2026-06-17');
    const p = project([{ amount: d?.amount ?? 0, skillPrimary: d?.skills[0] ?? null, skillSecondary: d?.skills[1] ?? null }]);
    expect(p.total).toBe(8);
    expect(p.skills).toEqual({ vegetable: 8, greenhouse: 8 });
  });
});

describe('succès et quêtes', () => {
  const summary = { emergences: 0, harvests: 0, distinctVarieties: 7, zoneSeasons: [], seedSaver: false, documentedSeason: false, guidesPublished: 0, usefulVotes: 0, collectiveTickets: 0, activeSeasons: 0 };

  it('[ACH-03] 3 saisons consécutives avec un override : non obtenu ; sans override : obtenu', () => {
    const withOverride = [{ zoneId: 'z', year: 2024, override: false }, { zoneId: 'z', year: 2025, override: true }, { zoneId: 'z', year: 2026, override: false }];
    expect(rotationStreak(withOverride)).toBeLessThan(3);
    expect(rotationStreak(withOverride.map((r) => ({ ...r, override: false })))).toBe(3);
    expect(evaluate({ ...summary, zoneSeasons: withOverride.map((r) => ({ ...r, override: false })) }).find((a) => a.code === 'rotation_3_years')?.earned).toBe(true);
  });

  it('[ACH-05] l\'avancement des succès verrouillés est borné (« 7 / 10 »)', () => {
    expect(evaluate(summary).find((a) => a.code === 'ten_varieties')).toEqual({ code: 'ten_varieties', current: 7, target: 10, earned: false });
  });

  const task = (id: string, dueOn: string, priority: TaskCandidate['priority']): TaskCandidate => ({ ticketId: id, gardenId: 'g', title: id, titleKey: null, titleParams: null, dueOn, priority });
  it('[QST-01] 5 tâches dont 2 en retard : 3 quêtes, en commençant par les retards', () => {
    const picked = pickDaily([task('a', '2026-06-17', 'urgent'), task('late1', '2026-06-15', 'low'), task('b', '2026-06-17', 'normal'), task('late2', '2026-06-16', 'normal'), task('c', '2026-06-17', 'high')], '2026-06-17');
    expect(picked.map((t) => t.ticketId)).toEqual(['late2', 'late1', 'a']);
  });

  it('[QST-04] un jardin de l\'hémisphère sud en mars reçoit les modèles d\'automne', () => {
    expect(astronomicalSeason('2026-03-25', true)).toBe('autumn');
    expect(astronomicalSeason('2026-03-25', false)).toBe('spring');
    expect(seasonalTemplates('autumn', { beds: true, cultures: true }).map((t) => t.code)).toEqual(['autumn_beds']);
  });

  it('[QST-05] sans tâche ni étape à venir : aucune quête quotidienne ni hebdomadaire ; pas de modèle sans zone concernée', () => {
    expect(pickDaily([], '2026-06-17')).toEqual([]);
    expect(seasonalTemplates('autumn', { beds: false, cultures: false })).toEqual([]);
  });
});
