import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { DomainError, validation } from '@/lib/errors';
import type { ServiceCtx } from '@/server/action-core';
import type { Executor } from '@/server/db/client';
import { avatarItem, avatarItemPalette, palette, userAvatar } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { unlockFactsOf } from '../progression/unlock';
import { isUnlocked, type UnlockFacts } from '../progression/unlock.pure';
import { canonicalJson, checkConfig, defaultAvatar, normalizeConfig, type AvatarConfigV1, type CatalogView } from './config.pure';

/* Avatar (SPEC §10) : catalogue avec déblocages, lecture des avatars, enregistrement revalidé côté serveur. */

export type AvatarView = { userId: string; config: AvatarConfigV1; configHash: string };

export const configHash = (c: AvatarConfigV1) => createHash('sha256').update(canonicalJson(normalizeConfig(c))).digest('hex');

/** Catalogue tel qu'il est en base, avec l'état de déblocage pour cet utilisateur (§10.4, AVT-08). */
export async function avatarCatalog(tx: Executor, facts: UnlockFacts) {
  const items = await tx.select().from(avatarItem).orderBy(avatarItem.layer, avatarItem.sortOrder).limit(500);
  const palettes = await tx.select({ id: palette.id, code: palette.code, slot: palette.slotKind, ramp: palette.ramp }).from(palette).orderBy(palette.sortOrder).limit(500);
  const links = items.length ? await tx.select().from(avatarItemPalette).where(inArray(avatarItemPalette.avatarItemId, items.map((i) => i.id))) : [];
  const codeOf = new Map(palettes.map((p) => [p.id, p.code]));
  return {
    items: items.map((i) => {
      const allowed = links.filter((l) => l.avatarItemId === i.id).map((l) => codeOf.get(l.paletteId)).filter((c): c is string => !!c);
      return {
        code: i.code, layer: i.layer, spriteKey: i.spriteKey, slots: i.paletteSlots, condition: i.unlockCondition,
        unlocked: i.defaultUnlocked || isUnlocked(i.unlockCondition, facts),
        // Palettes autorisées par emplacement : celles de la table de liaison, du bon type d'emplacement.
        allowed: i.paletteSlots.map((slot) => allowed.filter((code) => palettes.find((p) => p.code === code)?.slot === slot)),
      };
    }),
    palettes: palettes.map((p) => ({ code: p.code, slot: p.slot, ramp: p.ramp })),
  };
}

export type AvatarCatalog = Awaited<ReturnType<typeof avatarCatalog>>;

function viewOf(c: AvatarCatalog): CatalogView {
  return {
    items: new Map(c.items.map((i) => [i.code, { layer: i.layer, slots: i.slots, unlocked: i.unlocked, allowed: i.allowed.map((a) => new Set(a)) }])),
    palettes: new Map(c.palettes.map((p) => [p.code, p.slot])),
  };
}

/** Avatars de plusieurs utilisateurs ; à défaut d'enregistrement, l'avatar par défaut déterministe (§10.3). */
export async function avatarsOf(tx: Executor, userIds: string[]): Promise<Map<string, AvatarView>> {
  const ids = [...new Set(userIds)];
  const rows = ids.length ? await tx.select({ userId: userAvatar.userId, config: userAvatar.config, configHash: userAvatar.configHash }).from(userAvatar).where(inArray(userAvatar.userId, ids)) : [];
  const out = new Map(rows.map((r) => [r.userId, r]));
  for (const id of ids) {
    if (out.has(id)) continue;
    const config = normalizeConfig(defaultAvatar(id));
    out.set(id, { userId: id, config, configHash: configHash(config) });
  }
  return out;
}

export async function avatarOf(tx: Executor, userId: string): Promise<AvatarView> {
  const a = (await avatarsOf(tx, [userId])).get(userId);
  if (!a) throw new Error('avatar');
  return a;
}

/** Avatar attribué à l'inscription (AVT-09) : déterministe, éléments débloqués par défaut. */
export async function assignDefaultAvatar(tx: Executor, userId: string) {
  const config = normalizeConfig(defaultAvatar(userId));
  await tx.insert(userAvatar).values({ userId, config, configHash: configHash(config), configVersion: 0 }).onConflictDoNothing();
}

/**
 * Enregistrement (§10.3) : toute la configuration est revalidée contre la base (calques, palettes autorisées,
 * déblocage au moment de l'enregistrement). Un élément verrouillé → `LOCKED_ITEM`, et rien n'est enregistré.
 */
export async function saveAvatar(ctx: ServiceCtx, raw: unknown): Promise<AvatarView> {
  const { tx, actor } = ctx;
  const [prev] = await tx.select().from(userAvatar).where(eq(userAvatar.userId, actor.id)).for('update').limit(1);
  const catalog = await avatarCatalog(tx, await unlockFactsOf(tx, actor.id));
  const r = checkConfig(raw, viewOf(catalog), prev?.config ?? null);
  if (!r.ok && r.code === 'VALIDATION') throw validation(r.fields);
  if (!r.ok) throw new DomainError('LOCKED_ITEM', 'lockedItem', { items: r.items });
  const hash = configHash(r.config);
  const now = ctx.clock.now();
  await tx.insert(userAvatar).values({ userId: actor.id, config: r.config, configHash: hash, configVersion: 1 })
    .onConflictDoUpdate({ target: userAvatar.userId, set: { config: r.config, configHash: hash, configVersion: (prev?.configVersion ?? 0) + 1, updatedAt: now } });
  if (prev?.configHash !== hash) await emit(tx, { type: 'avatar.updated', subjectType: 'user', subjectId: actor.id, gardenId: null, actorId: actor.id, payload: { configHash: hash } }, now);
  return { userId: actor.id, config: r.config, configHash: hash };
}

/** Données de l'éditeur : catalogue avec déblocages et avatar enregistré. */
export async function avatarEditorData(tx: Executor, userId: string) {
  const [catalog, avatar] = await Promise.all([unlockFactsOf(tx, userId).then((f) => avatarCatalog(tx, f)), avatarOf(tx, userId)]);
  return { catalog, avatar };
}
