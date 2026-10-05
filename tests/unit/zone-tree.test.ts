import { describe, expect, it } from 'vitest';
import { effectiveRestriction, zoneAllows, zoneGrantsEdit } from '@/server/authz/zone-access';
import { buildTree, checkGeometry, childPath, depthOf, effectiveEnvironment, effectiveSurface, subtreeHeight, wouldCreateCycle } from '@/features/zone/tree';
import { rect } from '../geometry';


describe('arbre des zones', () => {
  it('[ZON-01] chemins et profondeurs', () => {
    expect(childPath(null)).toBe('');
    expect(childPath({ id: 'a', path: '' })).toBe('a');
    expect(childPath({ id: 'b', path: 'a' })).toBe('a/b');
    expect(depthOf('a/b')).toBe(2);
  });

  it('[ZON-02] détecte un cycle (parent = descendant ou soi-même)', () => {
    expect(wouldCreateCycle('a', { id: 'c', path: 'a/b' })).toBe(true);
    expect(wouldCreateCycle('a', { id: 'a', path: '' })).toBe(true);
    expect(wouldCreateCycle('a', { id: 'x', path: 'y' })).toBe(false);
  });

  it('[ZON-03] hauteur de sous-arbre pour le contrôle de profondeur', () => {
    expect(subtreeHeight({ id: 'a', path: '' }, [])).toBe(0);
    expect(subtreeHeight({ id: 'a', path: '' }, [{ path: 'a' }, { path: 'a/b' }])).toBe(2);
  });

  it('[ZON-05] environnement effectif hérité du parent', () => {
    expect(effectiveEnvironment({ environment: null }, [{ environment: 'open_air' }, { environment: 'greenhouse' }], ['open_air'])).toBe('greenhouse');
    expect(effectiveEnvironment({ environment: 'indoor' }, [{ environment: 'greenhouse' }], ['open_air'])).toBe('indoor');
    expect(effectiveEnvironment({ environment: null }, [{ environment: null }], ['tunnel', 'open_air'])).toBe('tunnel');
  });

  it('[ZON-06] surface : 250 × 120 cm → 3,00 m², source plan', () => {
    expect(effectiveSurface({ geometry: rect(0, 0, 250, 120), surfaceM2Manual: 9, lengthCm: null, widthCm: null })).toEqual({ m2: 3, source: 'plan' });
    expect(effectiveSurface({ geometry: null, surfaceM2Manual: 4.5, lengthCm: 100, widthCm: 100 })).toEqual({ m2: 4.5, source: 'manual' });
    expect(effectiveSurface({ geometry: null, surfaceM2Manual: null, lengthCm: 300, widthCm: 120 })).toEqual({ m2: 3.6, source: 'dimensions' });
    expect(effectiveSurface({ geometry: null, surfaceM2Manual: null, lengthCm: null, widthCm: null })).toEqual({ m2: null, source: 'unknown' });
  });

  it('[ZON-11] refuse le chevauchement de zones sœurs et le débordement du parent', () => {
    const parent = rect(0, 0, 1000, 1000);
    expect(checkGeometry(rect(100, 100, 200, 200), parent, [rect(250, 250, 100, 100)])).toBe('overlaps_sibling');
    expect(checkGeometry(rect(100, 100, 200, 200), parent, [rect(300, 100, 100, 100)])).toBeNull(); // bord partagé
    expect(checkGeometry(rect(900, 900, 200, 200), parent, [])).toBe('outside_parent');
  });

  it('construit un arbre trié', () => {
    const tree = buildTree([
      { id: 'b', parentId: null, sortOrder: 0, name: 'B' },
      { id: 'a', parentId: null, sortOrder: 0, name: 'A' },
      { id: 'c', parentId: 'a', sortOrder: 0, name: 'C' },
    ]);
    expect(tree.map((n) => n.id)).toEqual(['a', 'b']);
    expect(tree[0]?.children.map((n) => n.id)).toEqual(['c']);
  });
});

describe('restrictions de zone par groupe (§5.3)', () => {
  it('[AUTHZ-06] la restriction la plus proche s\'hérite', () => {
    expect(effectiveRestriction([[{ groupId: 'g', level: 'contribute' }], []])).toEqual([{ groupId: 'g', level: 'contribute' }]);
    expect(effectiveRestriction([[], []])).toBeNull();
  });

  it('[AUTHZ-05] un membre hors groupe est refusé ; owner et admin ne sont jamais restreints', () => {
    const r = [{ groupId: 'g', level: 'contribute' as const }];
    expect(zoneAllows('member', [], r, 'contribute')).toBe(false);
    expect(zoneAllows('member', ['g'], r, 'contribute')).toBe(true);
    expect(zoneAllows('member', ['g'], r, 'edit')).toBe(false);
    expect(zoneAllows('admin', [], r, 'edit')).toBe(true);
    expect(zoneGrantsEdit(['g'], [{ groupId: 'g', level: 'edit' }])).toBe(true);
  });
});
