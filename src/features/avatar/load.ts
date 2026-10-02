import { and, eq, notInArray } from 'drizzle-orm';
import { seedId } from '@/lib/uuid5';
import type { Executor } from '@/server/db/client';
import { avatarItem, avatarItemPalette, palette } from '@/server/db/schema';
import { AVATAR_ITEMS, allowedPalettes, PALETTES } from './catalog';

export const avatarItemRefId = (code: string) => seedId(`avatar_item:${code}`);
export const paletteRefId = (code: string) => seedId(`palette:${code}`);

/** Charge ou met à jour le catalogue d'avatar (idempotent, identifiants stables), palettes autorisées comprises. */
export async function loadAvatarCatalog(tx: Executor): Promise<void> {
  for (const [i, p] of PALETTES.entries()) {
    const values = { code: p.code, slotKind: p.slot, ramp: [...p.ramp], sortOrder: i };
    await tx.insert(palette).values({ id: paletteRefId(p.code), ...values }).onConflictDoUpdate({ target: palette.id, set: values });
  }
  for (const [i, it] of AVATAR_ITEMS.entries()) {
    const values = { code: it.code, layer: it.layer, spriteKey: it.spriteKey, paletteSlots: it.slots, unlockCondition: it.unlock, defaultUnlocked: it.unlock.kind === 'none', sortOrder: i };
    await tx.insert(avatarItem).values({ id: avatarItemRefId(it.code), ...values }).onConflictDoUpdate({ target: avatarItem.id, set: values });
    const allowed = [...new Set(it.slots.flatMap((_, k) => allowedPalettes(it, k).map((p) => paletteRefId(p.code))))];
    if (allowed.length) {
      await tx.insert(avatarItemPalette).values(allowed.map((paletteId) => ({ avatarItemId: avatarItemRefId(it.code), paletteId }))).onConflictDoNothing();
      await tx.delete(avatarItemPalette).where(and(eq(avatarItemPalette.avatarItemId, avatarItemRefId(it.code)), notInArray(avatarItemPalette.paletteId, allowed)));
    }
  }
}
