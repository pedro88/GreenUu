import { describe, expect, it } from 'vitest';
import '../../src/features/culture/actions';
import '../../src/features/plant/actions';
import { actionRegistry, shouldRevalidate } from '../../src/server/action-core';

/** Actions de pure lecture : elles ne doivent jamais revalider les pages (audit M3). */
const READ_ACTIONS = ['plant.search', 'plant.gardenVarieties', 'culture.preview'];

describe('revalidation après action', () => {
  it('les actions de lecture ne revalident pas ; les mutations, si', () => {
    for (const name of READ_ACTIONS) {
      const def = actionRegistry.get(name);
      expect(def, name).toBeDefined();
      if (def) expect(shouldRevalidate(def, true), name).toBe(false);
    }
    const create = actionRegistry.get('culture.create');
    if (!create) throw new Error('culture.create');
    expect(shouldRevalidate(create, true)).toBe(true);
    expect(shouldRevalidate(create, false)).toBe(false);
  });
});
