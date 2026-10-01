import { describe, expect, it } from 'vitest';
import { effectivePractices } from '@/features/practice/effective';
import { astronomicalSeason, defaultSeasonStartMonth, seasonBounds, seasonYearOf } from '@/features/season/season.pure';

describe('pratiques effectives', () => {
  const decls = [
    { practiceCode: 'mulching', zoneId: null, seasonYear: null, excluded: false },
    { practiceCode: 'mulching', zoneId: 'z1', seasonYear: null, excluded: true },
    { practiceCode: 'organic', zoneId: null, seasonYear: null, excluded: false },
    { practiceCode: 'green_manure', zoneId: null, seasonYear: 2025, excluded: false },
  ];

  it('[GRD-07] une exclusion sur une zone vaut pour la zone et ses descendants', () => {
    expect([...effectivePractices(decls, ['z1'], 2026)].sort()).toEqual(['organic']);
    expect([...effectivePractices(decls, ['z1', 'z2'], 2026)].sort()).toEqual(['organic']);
    expect([...effectivePractices(decls, ['z3'], 2026)].sort()).toEqual(['mulching', 'organic']);
  });

  it('[GRD-08] une pratique bornée à 2025 est absente en 2026', () => {
    expect(effectivePractices(decls, [], 2025).has('green_manure')).toBe(true);
    expect(effectivePractices(decls, [], 2026).has('green_manure')).toBe(false);
  });
});

describe('saisons', () => {
  it('[SEA-01] saison commençant en juillet', () => {
    expect(seasonYearOf('2026-08-10', 7)).toBe(2026);
    expect(seasonYearOf('2027-03-01', 7)).toBe(2026);
    expect(seasonBounds(2026, 7)).toEqual({ startsOn: '2026-07-01', endsOn: '2027-06-30' });
    expect(seasonBounds(2026, 1)).toEqual({ startsOn: '2026-01-01', endsOn: '2026-12-31' });
  });

  it('hémisphère et saison astronomique', () => {
    expect(defaultSeasonStartMonth(-33)).toBe(7);
    expect(defaultSeasonStartMonth(50)).toBe(1);
    expect(astronomicalSeason('2026-10-01', 50)).toBe('autumn');
    expect(astronomicalSeason('2026-10-01', -33)).toBe('spring');
  });
});
