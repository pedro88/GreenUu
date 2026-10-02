import { describe, expect, it } from 'vitest';
import { createCulture, listCultures } from '../../src/features/culture/service';
import { createJournalEntry, readAttachment, uploadPhoto } from '../../src/features/journal/service';
import { moderateVariety, proposeVariety, searchPlants, varietiesForGarden } from '../../src/features/plant/service';
import { loadScope } from '../../src/server/authz/scope';
import { addMember, makeGarden, makeZone, speciesRefId, varietyRefId } from './fixtures';
import { memoryStorage, tinyJpegWithExif } from './files';
import { ctxFor, inTx, makeUser, scopedCtx } from './helpers';

describe('référentiel végétal', () => {
  it('[PLT-01] « tomatte » et « cœur de boeuf » trouvent la tomate et la variété', () =>
    inTx(async (tx) => {
      const u = await makeUser(tx);
      const a = await searchPlants(tx, u.id, 'tomatte');
      expect(a[0]).toMatchObject({ kind: 'species', name: 'Tomate' });
      const b = await searchPlants(tx, u.id, 'cœur de boeuf');
      expect(b[0]).toMatchObject({ kind: 'variety', name: 'Cœur de bœuf', speciesName: 'Tomate' });
    }));

  it('[PLT-02] une variété proposée est en attente, utilisable dans le jardin du proposant seulement', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const hugo = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const other = await makeGarden(tx, hugo, { name: 'Autre' });
      const { varietyId } = await proposeVariety(ctxFor(tx, alice), { speciesId: speciesRefId('tomate'), gardenId, name: 'Tomate de Marmande locale', origin: 'local' });
      expect((await varietiesForGarden(tx, speciesRefId('tomate'), gardenId)).find((v) => v.id === varietyId)?.status).toBe('pending');
      expect((await varietiesForGarden(tx, speciesRefId('tomate'), other)).some((v) => v.id === varietyId)).toBe(false);
      expect((await searchPlants(tx, hugo.id, 'marmande locale')).some((h) => h.id === varietyId)).toBe(false);
    }));

  it('[PLT-03] la fusion d\'une variété en attente repointe les cultures', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const modo = { ...(await makeUser(tx)), platformRole: 'moderator' as const };
      const gardenId = await makeGarden(tx, alice);
      const zoneId = await makeZone(tx, alice, gardenId, 'P');
      const zone2 = await makeZone(tx, alice, gardenId, 'Q');
      const { varietyId } = await proposeVariety(ctxFor(tx, alice), { speciesId: speciesRefId('tomate'), gardenId, name: 'Coeur de boeuf bis', origin: 'local' });
      const ctx = await scopedCtx(tx, alice, gardenId);
      for (const z of [zoneId, zone2]) {
        await createCulture(ctx, { gardenId, zoneId: z, speciesId: speciesRefId('tomate'), varietyId, method: 'bought_plants', anchorDate: '2026-05-15', seedSource: 'unknown', plannedDates: {}, acknowledgeRotation: false });
      }
      const target = varietyRefId('tomate', 'Cœur de bœuf');
      await moderateVariety(ctxFor(tx, modo), { varietyId, decision: 'merge', targetId: target });
      const cultures = await listCultures(tx, ctx.scope, {});
      expect(cultures.map((c) => c.label)).toEqual(['Tomate Cœur de bœuf', 'Tomate Cœur de bœuf']);
      await expect(moderateVariety(ctxFor(tx, alice), { varietyId: target, decision: 'reject' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it('[PLT-04] une variété refusée est introuvable depuis un autre jardin', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const hugo = await makeUser(tx);
      const modo = { ...(await makeUser(tx)), platformRole: 'moderator' as const };
      const gardenId = await makeGarden(tx, alice);
      await makeGarden(tx, hugo, { name: 'Autre' });
      const { varietyId } = await proposeVariety(ctxFor(tx, alice), { speciesId: speciesRefId('carotte'), gardenId, name: 'Carotte violette du grenier', origin: 'peasant' });
      await moderateVariety(ctxFor(tx, modo), { varietyId, decision: 'reject' });
      expect((await searchPlants(tx, hugo.id, 'violette du grenier')).some((h) => h.id === varietyId)).toBe(false);
      expect((await searchPlants(tx, alice.id, 'violette du grenier')).some((h) => h.id === varietyId)).toBe(true);
    }));
});

describe('journal et photos', () => {
  it('[JRN-04] une entrée « ravageur » sans problème du catalogue est refusée', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const zoneId = await makeZone(tx, alice, gardenId, 'P');
      const ctx = await scopedCtx(tx, alice, gardenId);
      await expect(createJournalEntry(ctx, { gardenId, zoneId, kind: 'pest', severity: 2, attachmentIds: [] })).rejects.toMatchObject({ fieldErrors: { problemCode: ['required'] } });
      await expect(createJournalEntry(ctx, { gardenId, zoneId, kind: 'pest', problemCode: 'aphids', attachmentIds: [] })).rejects.toMatchObject({ fieldErrors: { severity: ['required'] } });
      await expect(createJournalEntry(ctx, { gardenId, zoneId, kind: 'pest', problemCode: 'aphids', severity: 2, attachmentIds: [] })).resolves.toMatchObject({ entryId: expect.any(String) });
    }));

  it('[JRN-03] un fichier non image renommé en .jpg est refusé', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const scope = await loadScope(tx, alice.id, gardenId);
      if (!scope) throw new Error('scope');
      const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      await expect(uploadPhoto(tx, scope, alice.id, exe, memoryStorage())).rejects.toMatchObject({ fieldErrors: { file: ['notAnImage'] } });
    }));

  it('[JRN-02] côté serveur, les métadonnées EXIF (GPS) sont retirées du JPEG stocké', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const scope = await loadScope(tx, alice.id, gardenId);
      if (!scope) throw new Error('scope');
      const files = memoryStorage();
      const res = await uploadPhoto(tx, scope, alice.id, tinyJpegWithExif(), files);
      expect(res).toMatchObject({ width: 2, height: 2 });
      const stored = [...files.files.values()][0] ?? new Uint8Array();
      expect(Buffer.from(stored).includes(Buffer.from('Exif'))).toBe(false);
      expect(Buffer.from(stored).includes(Buffer.from('GPS'))).toBe(false);
    }));

  it('[AUTHZ-08] une photo n\'est servie qu\'aux membres du jardin', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const hugo = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, bob, 'observer');
      const scope = await loadScope(tx, alice.id, gardenId);
      if (!scope) throw new Error('scope');
      const files = memoryStorage();
      const { attachmentId } = await uploadPhoto(tx, scope, alice.id, tinyJpegWithExif(), files);
      const read = (userId: string) => readAttachment(tx, (g) => loadScope(tx, userId, g), attachmentId, files);
      expect(await read(hugo.id)).toBeNull();
      expect((await read(bob.id))?.mime).toBe('image/jpeg');
    }));
});
