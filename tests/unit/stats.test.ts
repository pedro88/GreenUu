import { describe, expect, it } from 'vitest';
import { seasonLabel, statsCsv, successRates, trend, yields, type HarvestRow } from '@/features/stats/stats.pure';

const row = (o: Partial<HarvestRow>): HarvestRow => ({
  speciesId: 'tomate', speciesName: 'Tomate', zoneId: 'p1', zoneName: 'Planche 1', areaM2: 4, harvestedOn: '2026-08-01', quantity: 1, unit: 'kg', quantityKg: 1, ...o,
});

describe('statistiques pluriannuelles (§12.10)', () => {
  it('[STAT-02] g et kg (et pièces au poids connu) sont sommés en kg ; bottes, litres et pièces sans poids sont comptés à part', () => {
    const y = yields([
      row({ quantity: 500, unit: 'g', quantityKg: 0.5 }),
      row({ quantity: 2, unit: 'kg', quantityKg: 2 }),
      row({ quantity: 6, unit: 'unit', quantityKg: 1.2 }), // poids moyen connu, converti à l'enregistrement
      row({ quantity: 12, unit: 'bunch', quantityKg: null }),
      row({ quantity: 3, unit: 'unit', quantityKg: null }),
      row({ quantity: 1.5, unit: 'l', quantityKg: null }),
    ], 1);
    const c = y.bySpecies[0]?.perSeason.get(2026);
    expect(c).toEqual({ kg: 3.7, harvests: 6, other: { bunch: 12, unit: 3, l: 1.5 } });
  });

  it('[STAT-03] kg/m² pour une zone qui a une surface ; kg seulement sans surface', () => {
    const y = yields([row({ quantityKg: 10 }), row({ zoneId: 'bac', zoneName: 'Bac', areaM2: null, quantityKg: 3 })], 1);
    expect(y.byZone.find((z) => z.id === 'p1')?.perSeason.get(2026)).toMatchObject({ kg: 10, kgPerM2: 2.5 });
    expect(y.byZone.find((z) => z.id === 'bac')?.perSeason.get(2026)).toMatchObject({ kg: 3, kgPerM2: null });
  });

  it('[STAT-04] saison commencée en septembre : le 15 août 2026 compte pour 2025-2026, le 15 septembre pour 2026-2027', () => {
    const y = yields([row({ harvestedOn: '2026-08-15' }), row({ harvestedOn: '2026-09-15', quantityKg: 2 })], 9);
    expect(y.seasons).toEqual([2025, 2026]);
    expect(y.bySpecies[0]?.perSeason.get(2025)?.kg).toBe(1);
    expect(y.bySpecies[0]?.perSeason.get(2026)?.kg).toBe(2);
    expect(seasonLabel(2025, 9)).toBe('2025-2026');
    expect(seasonLabel(2026, 1)).toBe('2026');
  });

  it('[STAT-05] une vivace sur 3 saisons : chaque saison reçoit ses propres récoltes, la culture n\'est jamais comptée en entier', () => {
    const fraise = (d: string, kg: number) => row({ speciesId: 'fraisier', speciesName: 'Fraisier', harvestedOn: d, quantityKg: kg });
    const y = yields([fraise('2024-06-10', 1), fraise('2025-06-10', 2), fraise('2025-06-20', 1), fraise('2026-06-10', 4)], 1);
    const s = y.bySpecies[0];
    expect([2024, 2025, 2026].map((x) => s?.perSeason.get(x)?.kg)).toEqual([1, 3, 4]);
    expect(trend(s?.perSeason.get(2026)?.kg, s?.perSeason.get(2025)?.kg)).toBe(33);
    expect(trend(4, undefined)).toBeNull();
  });

  it('réussites : terminées sur l\'ensemble des cultures closes ; les cultures en cours n\'entrent pas', () => {
    const r = successRates([
      { speciesId: 't', speciesName: 'Tomate', seasonYear: 2025, status: 'finished' },
      { speciesId: 't', speciesName: 'Tomate', seasonYear: 2025, status: 'finished' },
      { speciesId: 't', speciesName: 'Tomate', seasonYear: 2025, status: 'failed' },
      { speciesId: 't', speciesName: 'Tomate', seasonYear: 2025, status: 'abandoned' },
      { speciesId: 't', speciesName: 'Tomate', seasonYear: 2025, status: 'active' },
    ]);
    expect(r[0]?.perSeason.get(2025)).toEqual({ finished: 2, failed: 1, abandoned: 1, rate: 50 });
  });

  it('export CSV : séparateur ; et virgule décimale, champs échappés', () => {
    const csv = statsCsv([row({ speciesName: 'Tomate « cœur ; de bœuf »', quantityKg: 1.25 })], 1);
    expect(csv.split('\n')[0]).toBe('saison;espece;zone;kg;kg_m2;recoltes;autres_unites');
    expect(csv.split('\n')[1]).toBe('2026;"Tomate « cœur ; de bœuf »";Planche 1;1,25;0,31;1;');
  });

  it('export CSV : un nom qui commence par = + - @ reste du texte (pas de formule)', () => {
    const lines = statsCsv([
      row({ zoneId: 'z1', zoneName: '=HYPERLINK("https://exemple.test";"Planche")' }),
      row({ zoneId: 'z2', zoneName: '+1+1' }),
      row({ zoneId: 'z3', zoneName: '-2' }),
      row({ zoneId: 'z4', zoneName: '@SUM(A1)' }),
    ], 1).trim().split('\n').slice(1);
    // Aucune cellule ne commence par un caractère de formule, guillemets d'encadrement compris.
    for (const l of lines) for (const cell of l.split(';')) expect(cell.replace(/^"/, ''), cell).not.toMatch(/^[=+\-@]/);
    expect(lines.some((l) => l.includes(`"'=HYPERLINK(""https://exemple.test"";""Planche"")"`))).toBe(true);
    expect(lines.some((l) => l.includes(";'+1+1;"))).toBe(true);
  });
});
