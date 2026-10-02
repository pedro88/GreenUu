import { and, eq, isNull } from 'drizzle-orm';
import { addComment, createTicket } from '../src/features/ticket/commands';
import { gardenToday } from '../src/features/ticket/shared';
import { addDaysIso } from '../src/features/culture/stages.pure';
import type { Actor, ScopedCtx } from '../src/server/action-core';
import { loadScope } from '../src/server/authz/scope';
import { fixedClock } from '../src/server/clock';
import type { Tx } from '../src/server/db/client';
import { ticket, user } from '../src/server/db/schema';
import type { TicketPriority, TicketType } from '../src/lib/enums';

/** Tickets du seed (SPEC §14) : jardin collectif avec groupes, récurrences, retards ; quelques tâches familiales. */
type T = {
  title: string; type: TicketType; author: string; zone?: string; due?: number; priority?: TicketPriority; members?: string[]; groups?: string[];
  checklist?: string[]; watering?: boolean; rrule?: string; comment?: [string, string];
};

export async function seedTickets(tx: Tx, ref: Date, ids: { gardenId: (k: string) => string; zoneId: (g: string, z: string) => string; userId: (k: string) => string; memberId: (g: string, u: string) => string; groupId: (g: string, k: string) => string }) {
  const plan: Record<string, T[]> = {
    canal: [
      { title: 'Arroser la serre', type: 'maintenance', author: 'chloe', zone: 'serre', groups: ['serre'], watering: true, rrule: 'FREQ=DAILY;INTERVAL=2' },
      { title: "Réparer le récupérateur d'eau", type: 'maintenance', author: 'chloe', due: 3, priority: 'high', members: ['david', 'emma'], checklist: ['Acheter un robinet', 'Réparer le joint', 'Fixer le robinet'], comment: ['emma', "J'apporte un nouveau robinet samedi"] },
      { title: 'Tailler les framboisiers', type: 'task', author: 'bruno', zone: 'b', due: -2, priority: 'normal', members: ['david'] },
      { title: 'Semer les engrais verts', type: 'task', author: 'bruno', zone: 'b2', due: 0, groups: ['serre'] },
      { title: 'Vérifier les pucerons sur les fèves', type: 'check', author: 'chloe', zone: 'a1', due: 0, priority: 'urgent', members: ['emma'] },
      { title: 'Commander du terreau', type: 'purchase', author: 'bruno', due: 7 },
      { title: 'Désherber la parcelle Dupont', type: 'task', author: 'emma', zone: 'dupont', due: 1, groups: ['dupont'] },
      { title: 'Retourner le compost', type: 'maintenance', author: 'chloe', zone: 'compost', due: 5, rrule: 'FREQ=WEEKLY;BYDAY=SA' },
      { title: 'Récolter les courgettes', type: 'harvest', author: 'chloe', zone: 'a2', due: -1, members: ['gaelle'] },
    ],
    tilleuls: [
      { title: 'Pailler les planches pour l\'hiver', type: 'task', author: 'alice', zone: 'potager', due: 4 },
      { title: 'Nettoyer les outils', type: 'maintenance', author: 'alice', due: 0 },
    ],
  };
  for (const [gardenKey, tickets] of Object.entries(plan)) {
    const gardenId = ids.gardenId(gardenKey);
    // « Aujourd'hui » dans le fuseau du jardin, comme l'application (SPEC §3.7) — pas la date UTC.
    const today = await gardenToday(tx, gardenId, ref);
    const [existing] = await tx.select({ id: ticket.id }).from(ticket).where(and(eq(ticket.gardenId, gardenId), eq(ticket.source, 'manual'), isNull(ticket.deletedAt))).limit(1);
    if (existing) continue;
    for (const t of tickets) {
      const ctx = await ctxFor(tx, gardenId, ids.userId(t.author), ref);
      const due = addDaysIso(today, t.due ?? 0);
      const { ticketId } = await createTicket(ctx, {
        gardenId, zoneId: t.zone ? ids.zoneId(gardenKey, t.zone) : undefined, type: t.type, actionTag: t.watering ? 'watering' : undefined, title: t.title,
        priority: t.priority ?? 'normal', checklist: t.checklist ?? [], memberIds: (t.members ?? []).map((u) => ids.memberId(gardenKey, u)),
        groupIds: (t.groups ?? []).map((g) => ids.groupId(gardenKey, g)),
        ...(t.rrule ? { recurrence: { rrule: t.rrule, dtstart: addDaysIso(today, -2), skipMissed: true } } : { dueOn: due }),
      });
      if (ticketId && t.comment) await addComment(await ctxFor(tx, gardenId, ids.userId(t.comment[0]), ref), ticketId, t.comment[1]);
    }
  }
}

async function ctxFor(tx: Tx, gardenId: string, userId: string, at: Date): Promise<ScopedCtx> {
  const scope = await loadScope(tx, userId, gardenId);
  if (!scope) throw new Error(`seed : ${userId} n'est pas membre de ${gardenId}`);
  const [u] = await tx.select().from(user).where(eq(user.id, userId)).limit(1);
  const actor: Actor = { id: userId, email: u?.email ?? '', name: u?.name ?? '', emailVerified: true, platformRole: 'user', timezone: 'Europe/Brussels' };
  return { tx, scope, actor, clock: fixedClock(at), jobs: { enqueue: async () => undefined }, appUrl: '' };
}
