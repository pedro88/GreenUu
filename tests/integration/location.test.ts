import { describe, expect, it } from 'vitest';
import '../../src/features/location/actions';
import { searchCommunes } from '../../src/features/location/service';
import { actionRegistry, runAction, type ActionDeps } from '../../src/server/action-core';
import { fixedClock } from '../../src/server/clock';
import type { Tx } from '../../src/server/db/client';
import { inTx, makeUser, NOW, recordingQueue } from './helpers';

const deps = (tx: Tx): ActionDeps => ({ db: tx, clock: fixedClock(NOW), appUrl: 'http://localhost:3000', jobs: () => recordingQueue() });

describe('base de communes (§12.10, Q-24)', () => {
  it('[LOC-02] Saint-Étienne est trouvée sans accents, en majuscules avec tiret, ou par code postal ; 10 suggestions au plus, les plus peuplées d\'abord', () =>
    inTx(async (tx) => {
      for (const q of ['saint etienne', 'SAINT-ÉTIENNE', '42000']) {
        const hits = await searchCommunes(tx, q);
        expect(hits[0], q).toMatchObject({ name: 'Saint-Étienne', countryCode: 'FR', postalCode: '42000', timezone: 'Europe/Paris' });
        expect(hits.length, q).toBeLessThanOrEqual(10);
      }
      // Une localité aux nombreux codes postaux n'apparaît qu'une fois ; la plus peuplée passe devant.
      const lux = await searchCommunes(tx, 'luxembourg');
      expect(lux.filter((h) => h.name === 'Luxembourg' && h.countryCode === 'LU')).toHaveLength(1);
      const liege = await searchCommunes(tx, 'liege');
      expect(liege[0]).toMatchObject({ name: 'Liège', postalCode: '4000', countryCode: 'BE', timezone: 'Europe/Brussels' });
      expect(liege[0]?.lat).toBeCloseTo(50.63, 1);
      expect(liege[0]?.elevationM).toEqual(expect.any(Number));
    }));

  it('[LOC-03] sans session : UNAUTHENTICATED ; moins de 2 caractères : aucun résultat', () =>
    inTx(async (tx) => {
      const def = actionRegistry.get('commune.search');
      if (!def) throw new Error('commune.search');
      expect(await runAction(def, null, { q: 'liege' }, deps(tx))).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
      const alice = await makeUser(tx);
      expect(await runAction(def, alice, { q: 'l' }, deps(tx))).toEqual({ ok: true, data: [] });
      expect(await runAction(def, alice, { q: ' - ' }, deps(tx))).toEqual({ ok: true, data: [] });
      expect(await runAction(def, alice, { q: 'namur' }, deps(tx))).toMatchObject({ ok: true, data: [expect.objectContaining({ name: 'Namur' })] });
    }));
});
