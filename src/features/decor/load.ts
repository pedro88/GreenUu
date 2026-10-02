import { seedId } from '@/lib/uuid5';
import type { Executor } from '@/server/db/client';
import { decorItem, practice } from '@/server/db/schema';
import { DECOR_ITEMS } from './catalog';

export const decorItemRefId = (code: string) => seedId(`decor_item:${code}`);

/** Charge ou met à jour le catalogue de déco (idempotent, identifiants stables). */
export async function loadDecorCatalog(tx: Executor): Promise<void> {
  const practices = new Map((await tx.select({ id: practice.id, code: practice.code }).from(practice)).map((p) => [p.code, p.id]));
  for (const [i, d] of DECOR_ITEMS.entries()) {
    const practiceId = d.practice ? practices.get(d.practice) : undefined;
    if (d.practice && !practiceId) throw new Error(`pratique inconnue : ${d.practice}`);
    const values = { code: d.code, spriteKey: d.spriteKey, widthTiles: d.w, heightTiles: d.h, practiceId: practiceId ?? null, unlockCondition: d.unlock, sortOrder: i };
    await tx.insert(decorItem).values({ id: decorItemRefId(d.code), ...values }).onConflictDoUpdate({ target: decorItem.id, set: values });
  }
}
