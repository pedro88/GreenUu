import { describe, expect, it } from 'vitest';
import { computeCalendar, guideSlug, lineDiff } from '@/features/guide/rules.pure';
import { guideCreateSchema } from '@/features/guide/schema';
import { contextDistance, excluded, koppenDistance, RECO_WEIGHTS_V1 } from '@/features/reco/context.pure';
import { feedScore, normalizeTags, wilsonLowerBound } from '@/features/tip/rules.pure';
import { tipCreateSchema } from '@/features/tip/schema';

describe('tips', () => {
  it('[TIP-02] un tip de 501 caractères ou sans tag est refusé (VALIDATION)', () => {
    expect(tipCreateSchema.safeParse({ body: 'x'.repeat(501), tags: ['hiver'] }).success).toBe(false);
    expect(tipCreateSchema.safeParse({ body: 'Un voile d’hivernage sur la mâche.', tags: [] }).success).toBe(false);
    expect(tipCreateSchema.safeParse({ body: 'Un voile d’hivernage sur la mâche.', tags: ['  #', ''] }).success).toBe(false);
    expect(tipCreateSchema.safeParse({ body: 'Court', tags: ['hiver'] }).success).toBe(false);
    expect(tipCreateSchema.safeParse({ body: 'x'.repeat(500), tags: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(true);
    expect(tipCreateSchema.safeParse({ body: 'x'.repeat(20), tags: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false);
  });

  it('[TIP-01] les tags sont normalisés en slugs, sans doublon', () => {
    expect(normalizeTags(['#Légumes d’hiver', 'légumes-d-hiver', 'Hiver', ' hiver '])).toEqual(['legumes-d-hiver', 'hiver']);
  });

  it('[TIP-05] à score de Wilson égal, le tip au contexte proche passe devant', () => {
    const garden = { koppen: 'Cfb', environment: 'open_air' as const, geohash4: 'u0hq' };
    const near = contextDistance(garden, { koppen: 'Cfb', environment: 'open_air', geohash4: 'u0hq' });
    const far = contextDistance(garden, { koppen: 'BWh', environment: 'greenhouse', geohash4: 'evjk' });
    expect(near).toBeLessThan(far);
    expect(feedScore(10, 2, near)).toBeGreaterThan(feedScore(10, 2, far));
    // Wilson pénalise le faible nombre de votes : 1/1 vaut moins que 40/50.
    expect(wilsonLowerBound(1, 0)).toBeLessThan(wilsonLowerBound(40, 10));
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });
});

describe('distance de contexte (§7.2)', () => {
  it('[RCO-01] contextes identiques, Cfb contre Dfb, plein air contre hydroponie', () => {
    const a = { koppen: 'Cfb', environment: 'open_air' as const, altitudeM: 100, geohash4: 'u0hq', hardinessZone: '8a', soilType: 'loam', soilPh: 6.5, practices: ['organic'] };
    expect(contextDistance(a, a)).toBe(0);
    expect(koppenDistance('Cfb', 'Dfb')).toBe(1);
    expect(contextDistance(a, { ...a, koppen: 'Dfb' })).toBeCloseTo(RECO_WEIGHTS_V1.koppen, 6);
    expect(excluded(a, { ...a, environment: 'hydroponic' })).toBe(true);
    expect(excluded(a, { ...a, environment: 'greenhouse' })).toBe(false);
  });
});

describe('guides', () => {
  it('[GUI-08] calendrier type : étapes depuis l\'ancre, tâches relatives à une étape avec délai de visibilité', () => {
    const { stages, tasks } = computeCalendar({
      v: 1, anchor: 'sowing',
      stages: [{ stage: 'transplanting', offsetDays: 45 }, { stage: 'planting', offsetDays: 60 }],
      tasks: [{ title: 'Tuteurer', type: 'task', relativeTo: 'planting', offsetDays: 7 }, { title: 'Sans date', type: 'task', relativeTo: 'flowering', offsetDays: 0 }],
    }, '2026-03-01');
    expect(stages).toEqual({ sowing: '2026-03-01', transplanting: '2026-04-15', planting: '2026-04-30' });
    expect(tasks).toEqual([expect.objectContaining({ title: 'Tuteurer', dueOn: '2026-05-07', visibleFrom: '2026-05-04' })]);
  });

  it('[GUI-06] le slug public est lisible et unique par guide', () => {
    expect(guideSlug('Réussir ses fraisiers en climat océanique', '0199a0b2-3c4d-7e5f-8a9b-0c1d2e3f4a5b')).toBe('reussir-ses-fraisiers-en-climat-oceanique-3f4a5b');
  });

  it('[GUI-02] le diff ligne à ligne distingue ajouts, suppressions et lignes inchangées', () => {
    expect(lineDiff('a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      { kind: 'same', text: 'a' }, { kind: 'removed', text: 'b' }, { kind: 'added', text: 'B' }, { kind: 'same', text: 'c' },
    ]);
  });

  it('[GUI-07] un guide privé exige un jardin, un guide public n\'en a pas', () => {
    const draft = { title: 'Tomates', bodyMd: '' };
    const base = { speciesId: '0199a0b2-3c4d-7e5f-8a9b-0c1d2e3f4a5b', draft };
    expect(guideCreateSchema.safeParse({ ...base, visibility: 'private' }).success).toBe(false);
    expect(guideCreateSchema.safeParse({ ...base, visibility: 'public', gardenId: base.speciesId }).success).toBe(false);
    expect(guideCreateSchema.safeParse({ ...base, visibility: 'public' }).success).toBe(true);
  });
});
