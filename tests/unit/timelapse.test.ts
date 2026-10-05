import { describe, expect, it } from 'vitest';
import type { PlanSnapshotV1 } from '@/features/scene/history.schema';
import { frameDates, MAX_FRAMES, sceneAt, type HistoryData } from '@/features/scene/timelapse.pure';

/* Histoire du jardin (SPEC §12.11) : images calculées à partir des instantanés et des étapes réelles. */

const PLANCHE = '00000000-0000-4000-8000-000000000001';
const TOMATES = '00000000-0000-4000-8000-000000000002';
const plan = (zones: PlanSnapshotV1['zones']): PlanSnapshotV1 => ({ v: 1, tileSizeCm: 50, zones, terrain: [], objects: [] });
const planche = { id: PLANCHE, name: 'Planche 1', typeCode: 'bed', parentId: null, sceneZoneId: null, geometry: { v: 1 as const, kind: 'rect' as const, x: 0, y: 0, w: 200, h: 100 }, archivedAt: null };
const data: HistoryData = {
  gardenId: '00000000-0000-4000-8000-000000000009', gardenName: 'Jardin', south: false, today: '2026-10-14', reducedMotion: false,
  snapshots: [{ takenOn: '2026-03-20', payload: plan([]) }, { takenOn: '2026-04-01', payload: plan([planche]) }],
  current: plan([planche]),
  cultures: [{
    id: TOMATES, zoneId: PLANCHE, label: 'Tomate', spriteKeys: ['tomate'], method: 'direct_sowing', perennial: false, visualModel: 'fruit',
    stages: [
      { stage: 'sowing', plannedOn: '2026-04-10', actualOn: '2026-04-10' }, { stage: 'emergence', plannedOn: '2026-04-20', actualOn: '2026-04-22' },
      { stage: 'flowering', plannedOn: '2026-06-15', actualOn: '2026-06-20' }, { stage: 'fruiting', plannedOn: '2026-07-01', actualOn: '2026-07-05' },
      { stage: 'harvest_start', plannedOn: '2026-08-01', actualOn: '2026-08-03' },
    ],
    facts: { plantCount: 6, areaM2: null, spacingPlantCm: 50, spacingRowCm: 80, density: null, densityUnit: null },
  }],
};
const bounds = { w: 1000, h: 600 };

describe('histoire du jardin', () => {
  it('[TLP-02] la planche apparaît en avril, les tomates passent de graine à récolte dans l\'ordre réel', () => {
    expect(sceneAt(data, '2026-03-25', { bounds, reducedMotion: false }).scene.zones).toEqual([]);
    const order = ['seed', 'sprout', 'growing', 'flowering', 'fruiting', 'harvest_ready'];
    let last = -1;
    for (const date of frameDates('2026-04-01', '2026-09-30', 'week')) {
      const { scene, reconstructed } = sceneAt(data, date, { bounds, reducedMotion: false });
      expect(reconstructed).toBe(false);
      expect(scene.zones.map((z) => z.id)).toEqual([PLANCHE]);
      const tomates = scene.cultures.find((c) => c.id === TOMATES);
      if (date < '2026-04-10') { expect(tomates).toBeUndefined(); continue; }
      const i = order.indexOf(tomates?.phase ?? '');
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
      // La planche est remplie de plants (environ un par tuile).
      expect(tomates?.plants.drawn).toBe(8);
    }
    expect(last).toBe(order.indexOf('harvest_ready'));
    // Avant le premier instantané : le plan actuel, signalé.
    expect(sceneAt(data, '2026-03-01', { bounds, reducedMotion: false }).reconstructed).toBe(true);
    expect(sceneAt(data, '2026-08-15', { bounds, reducedMotion: false }).scene.ambient.season).toBe('summer');
  });

  it('[TLP-07] une image par semaine, par jour ou par mois ; au plus 160 images et 3 ans', () => {
    expect(frameDates('2026-01-01', '2026-01-29', 'week')).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']);
    expect(frameDates('2026-01-31', '2026-04-30', 'month')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    const days = frameDates('2026-01-01', '2026-12-31', 'day');
    expect(days).toHaveLength(MAX_FRAMES);
    expect(days.at(-1)).toBe('2026-12-31');
    expect(frameDates('2015-01-01', '2026-10-14', 'month')[0]).toBe('2023-10-14');
  });
});
