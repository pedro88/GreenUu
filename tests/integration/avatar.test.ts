import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createProfile } from '../../src/features/account/service';
import { defaultAvatar, normalizeConfig, type AvatarConfigV1 } from '../../src/features/avatar/config.pure';
import { avatarCatalog, avatarOf, configHash, saveAvatar } from '../../src/features/avatar/service';
import { unlockFactsOf } from '../../src/features/progression/unlock';
import { user, userAchievement, userAvatar } from '../../src/server/db/schema';
import { ctxFor, inTx, makeUser, NOW } from './helpers';

const withLayer = (c: AvatarConfigV1, layer: keyof AvatarConfigV1['layers'], item: string | null, palettes: string[] = []): AvatarConfigV1 =>
  ({ v: 1, layers: { ...c.layers, [layer]: { item, palettes } } });

describe('avatar (§10)', () => {
  it('[AVT-08] le catalogue n\'est filtré par aucun genre et propose au moins 12 teintes de peau', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const c = await avatarCatalog(tx, await unlockFactsOf(tx, alice.id));
      expect(c.palettes.filter((p) => p.slot === 'skin').length).toBeGreaterThanOrEqual(12);
      // Aucun attribut de genre, ni dans le catalogue ni dans les codes ; une seule silhouette de corps, neutre.
      expect(JSON.stringify(c)).not.toMatch(/gender|genre|\b(male|female|homme|femme)\b/i);
      expect(c.items.filter((i) => i.layer === 'body')).toHaveLength(1);
      // Le corps accepte toutes les teintes de peau.
      expect(c.items.find((i) => i.code === 'body')?.allowed[0]?.length).toBe(c.palettes.filter((p) => p.slot === 'skin').length);
    }));

  it('[AVT-03] une palette non autorisée pour un élément est refusée en VALIDATION, rien n\'est enregistré', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const ctx = ctxFor(tx, alice);
      const before = await avatarOf(tx, alice.id);
      // L'arrosoir accepte acier, terre cuite et caoutchouc vert ; la paille, du même type d'emplacement, n'est pas autorisée.
      await expect(saveAvatar(ctx, withLayer(before.config, 'held_item', 'held_watering_can', ['straw']))).rejects.toMatchObject({ code: 'VALIDATION' });
      // Une palette d'un autre type d'emplacement non plus.
      await expect(saveAvatar(ctx, withLayer(before.config, 'body', 'body', ['hair_black']))).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await tx.select().from(userAvatar).where(eq(userAvatar.userId, alice.id))).toHaveLength(0);
    }));

  it('un élément verrouillé donne LOCKED_ITEM et laisse la configuration précédente ; débloqué, il est accepté', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const ctx = ctxFor(tx, alice);
      const saved = await saveAvatar(ctx, withLayer((await avatarOf(tx, alice.id)).config, 'hair_front', 'hair_long', ['hair_copper']));
      const straw = withLayer(saved.config, 'headwear', 'hat_straw', ['straw']);
      await expect(saveAvatar(ctx, straw)).rejects.toMatchObject({ code: 'LOCKED_ITEM' });
      expect((await avatarOf(tx, alice.id)).configHash).toBe(saved.configHash);
      // Succès « Semencier » obtenu : le chapeau de paille est débloqué au moment de l'enregistrement.
      await tx.insert(userAchievement).values({ userId: alice.id, achievementCode: 'seed_saver', earnedAt: NOW });
      const after = await saveAvatar(ctx, straw);
      expect(after.configHash).not.toBe(saved.configHash);
      expect(after.config.layers.headwear).toEqual({ item: 'hat_straw', palettes: ['straw'] });
    }));

  it('l\'inscription attribue l\'avatar par défaut déterministe ; un enregistrement change le config_hash', () =>
    inTx(async (tx) => {
      const [u] = await tx.insert(user).values({ name: 'nina', email: `nina-${Date.now()}@test.local`, emailVerified: true }).returning();
      if (!u) throw new Error('user');
      await createProfile(tx, { userId: u.id, pseudo: `nina${Date.now().toString(36)}`, timezone: 'Europe/Paris', now: NOW });
      const [row] = await tx.select().from(userAvatar).where(eq(userAvatar.userId, u.id));
      expect(row?.config).toEqual(normalizeConfig(defaultAvatar(u.id)));
      expect(row?.configHash).toBe(configHash(defaultAvatar(u.id)));
      const actor = { id: u.id, email: u.email, name: u.name, emailVerified: true, platformRole: 'user' as const, timezone: 'Europe/Paris' };
      const next = await saveAvatar(ctxFor(tx, actor), withLayer(row?.config ?? defaultAvatar(u.id), 'hair_front', 'hair_curly', ['hair_teal']));
      expect(next.configHash).not.toBe(row?.configHash);
      const [again] = await tx.select().from(userAvatar).where(eq(userAvatar.userId, u.id));
      expect(again?.configVersion).toBe(1);
    }));
});
