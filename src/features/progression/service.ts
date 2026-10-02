import { and, asc, desc, eq, gte, inArray, isNull, like, ne, sql } from 'drizzle-orm';
import { localDate } from '@/lib/dates';
import type { Environment, OrgType, Skill } from '@/lib/enums';
import type { Executor } from '@/server/db/client';
import {
  culture, cultureResult, domainEvent, garden, gardenMember, guide, journalEntry, species, ticket, user, userProfile, variety, xpFlag, xpLedgerEntry, userProgress,
} from '@/server/db/schema';
import type { EmittedEvent } from '@/server/events/emit';
import { applyRules, type Candidate, candidatesFor, type LedgerDraft, project, reversalsFor, RULES_VERSION, type XpEvent, type XpHistory, BURST_WINDOW_MS } from './rules.pure';

/* Moteur d'XP (SPEC §8) : enrichissement des événements, historique, journal, projection. */

const UNDER_COVER: Environment[] = ['greenhouse', 'tunnel', 'indoor'];
const DAY = 86_400_000;
const REVERSIBLE: Record<string, 'culture' | 'subject'> = {
  'culture.deleted': 'culture', 'journal.entry_deleted': 'subject', 'harvest.deleted': 'subject', 'ticket.deleted': 'subject',
};

/** Contexte « culture » d'un gain : domaine de l'espèce, environnement effectif sous abri, composteur, semences maison. */
async function cultureContext(tx: Executor, cultureId: string | null, zoneId: string | null): Promise<Partial<XpEvent['ctx']>> {
  const [c] = cultureId ? await tx.select({ id: culture.id, zoneId: culture.zoneId, seasonId: culture.seasonId, seedSource: culture.seedSource, skill: species.skillDomain })
    .from(culture).innerJoin(species, eq(species.id, culture.speciesId)).where(eq(culture.id, cultureId)).limit(1) : [];
  const zId = c?.zoneId ?? zoneId;
  if (!zId) return { cultureId: c?.id ?? null, speciesSkill: c?.skill ?? null };
  const rows = await tx.execute<{ env: Environment | null; code: string }>(sql`
    select coalesce(z.environment,
      (select a.environment from zone a where a.garden_id = z.garden_id and a.environment is not null and a.id::text = any (string_to_array(z.path, '/')) order by a.depth desc limit 1),
      (select ge.environment from garden_environment ge where ge.garden_id = z.garden_id order by ge.position limit 1)) as env, t.code
    from zone z join zone_type t on t.id = z.zone_type_id where z.id = ${zId}`);
  const z = [...rows][0];
  return {
    cultureId: c?.id ?? null, seasonId: c?.seasonId ?? null, speciesSkill: c?.skill ?? null, compostZone: z?.code === 'compost',
    underCover: z?.env ? UNDER_COVER.includes(z.env) : false, ownSavedSeeds: c?.seedSource === 'own_saved',
  };
}

/** RG-XP-04 : e-mail vérifié et compte de plus de 7 jours au moment de l'action. */
async function eligible(tx: Executor, userId: string | null, at: Date) {
  if (!userId) return false;
  const [u] = await tx.select({ verified: user.emailVerified, createdAt: user.createdAt }).from(user).where(eq(user.id, userId)).limit(1);
  return !!u && u.verified && at.getTime() - u.createdAt.getTime() > 7 * DAY;
}

async function shareGarden(tx: Executor, a: string, b: string) {
  const rows = await tx.execute<{ n: number }>(sql`select count(*)::int as n from garden_member m1 join garden_member m2 on m2.garden_id = m1.garden_id
    where m1.user_id = ${a} and m2.user_id = ${b} and m1.left_at is null and m2.left_at is null`);
  return ([...rows][0]?.n ?? 0) > 0;
}

/** Événement de domaine → entrée du barème, avec le contexte lu en base (§8.2). */
export async function enrich(tx: Executor, e: EmittedEvent): Promise<XpEvent> {
  const base: XpEvent = { id: e.id, type: e.type, actorId: e.actorId, gardenId: e.gardenId, subjectId: e.subjectId, occurredAt: e.occurredAt, payload: e.payload, ctx: {} };
  const p = e.payload;
  switch (e.type) {
    case 'culture.stage_recorded':
      return { ...base, ctx: await cultureContext(tx, e.subjectId, null) };
    case 'journal.entry_created': {
      const [j] = await tx.select({ cultureId: journalEntry.cultureId, zoneId: journalEntry.zoneId }).from(journalEntry).where(eq(journalEntry.id, e.subjectId)).limit(1);
      return { ...base, ctx: { ...(await cultureContext(tx, j?.cultureId ?? null, j?.zoneId ?? null)), textLength: Number(p.textLength ?? 0) } };
    }
    case 'harvest.recorded':
      return { ...base, ctx: await cultureContext(tx, typeof p.cultureId === 'string' ? p.cultureId : null, null) };
    case 'result.submitted':
    case 'result.updated': {
      const [r] = await tx.select({ cultureId: cultureResult.cultureId, seasonId: cultureResult.seasonId }).from(cultureResult).where(eq(cultureResult.id, e.subjectId)).limit(1);
      const ctx = await cultureContext(tx, r?.cultureId ?? null, null);
      const days = r ? await tx.select({ n: sql<number>`count(distinct (${journalEntry.observedAt})::date)::int` }).from(journalEntry)
        .where(and(eq(journalEntry.cultureId, r.cultureId), isNull(journalEntry.deletedAt), ne(journalEntry.kind, 'weather'))) : [];
      return { ...base, ctx: { ...ctx, seasonId: r?.seasonId ?? null, observationDays: days[0]?.n ?? 0 } };
    }
    case 'ticket.completed': {
      const [t] = await tx.select({ cultureId: ticket.cultureId, zoneId: ticket.zoneId, orgType: garden.orgType }).from(ticket).innerJoin(garden, eq(garden.id, ticket.gardenId)).where(eq(ticket.id, e.subjectId)).limit(1);
      return { ...base, ctx: { ...(await cultureContext(tx, t?.cultureId ?? null, t?.zoneId ?? null)), orgType: (t?.orgType ?? null) as OrgType | null } }; // as: valeur de l'enum ORG_TYPES
    }
    case 'guide.published': {
      const [g] = await tx.select({ skill: species.skillDomain }).from(guide).innerJoin(species, eq(species.id, guide.speciesId)).where(eq(guide.id, e.subjectId)).limit(1);
      return { ...base, ctx: { speciesSkill: g?.skill ?? null } };
    }
    case 'guide.applied':
    case 'guide.forked': {
      const author = String(e.type === 'guide.applied' ? p.authorId : p.fromAuthorId);
      const [g] = await tx.select({ skill: species.skillDomain }).from(guide).innerJoin(species, eq(species.id, guide.speciesId)).where(eq(guide.id, e.subjectId)).limit(1);
      const member = e.type === 'guide.applied' && e.gardenId
        ? (await tx.select({ id: gardenMember.id }).from(gardenMember).where(and(eq(gardenMember.gardenId, e.gardenId), eq(gardenMember.userId, author), isNull(gardenMember.leftAt))).limit(1)).length > 0 : false;
      return { ...base, ctx: { speciesSkill: g?.skill ?? null, recipientId: author, actorEligible: await eligible(tx, e.actorId, e.occurredAt), authorIsMember: member } };
    }
    case 'tip.voted': {
      const author = String(p.authorId);
      return { ...base, ctx: { recipientId: author, actorEligible: await eligible(tx, e.actorId, e.occurredAt), voterIsGardenMate: e.actorId ? await shareGarden(tx, e.actorId, author) : false } };
    }
    case 'variety.approved': {
      const [v] = await tx.select({ skill: species.skillDomain }).from(variety).innerJoin(species, eq(species.id, variety.speciesId)).where(eq(variety.id, e.subjectId)).limit(1);
      return { ...base, ctx: { speciesSkill: v?.skill ?? null, recipientId: typeof p.proposedBy === 'string' ? p.proposedBy : null } };
    }
    default:
      return base;
  }
}

async function timezoneOf(tx: Executor, userId: string) {
  const [p] = await tx.select({ tz: userProfile.timezone }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  return p?.tz ?? 'Europe/Paris';
}

/** Historique utile aux règles, pour les candidats d'un destinataire (requêtes bornées à ses clés, son jour, sa fenêtre). */
async function historyFor(tx: Executor, recipientId: string, cands: Candidate[], localDay: string, at: Date): Promise<XpHistory> {
  const keys = cands.map((c) => c.key);
  const used = keys.length ? await tx.select({ key: xpLedgerEntry.idempotencyKey }).from(xpLedgerEntry).where(inArray(xpLedgerEntry.idempotencyKey, keys)) : [];
  const counts = await tx.select({ code: xpLedgerEntry.actionCode, n: sql<number>`count(*)::int` }).from(xpLedgerEntry)
    .where(and(eq(xpLedgerEntry.userId, recipientId), eq(xpLedgerEntry.localDay, localDay), inArray(xpLedgerEntry.reason, ['award', 'cap_reached']))).groupBy(xpLedgerEntry.actionCode);
  const recent = await tx.select({ at: xpLedgerEntry.createdAt }).from(xpLedgerEntry)
    .where(and(eq(xpLedgerEntry.userId, recipientId), gte(xpLedgerEntry.createdAt, new Date(at.getTime() - BURST_WINDOW_MS)), inArray(xpLedgerEntry.reason, ['award', 'cap_reached'])));
  const tipTotals = new Map<string, number>();
  const tipMateVotes = new Map<string, number>();
  for (const tipId of new Set(cands.flatMap((c) => (c.tipId ? [c.tipId] : [])))) {
    const rows = await tx.select({ key: xpLedgerEntry.idempotencyKey, amount: xpLedgerEntry.amount }).from(xpLedgerEntry).where(like(xpLedgerEntry.idempotencyKey, `tip.useful_vote:${tipId}:%`));
    tipTotals.set(tipId, rows.reduce((a, r) => a + r.amount, 0));
    let mates = 0;
    for (const r of rows) {
      const voter = r.key.split(':')[2];
      if (r.amount > 0 && voter && (await shareGarden(tx, voter, recipientId))) mates += 1;
    }
    tipMateVotes.set(tipId, mates);
  }
  return {
    keys: new Set(used.map((u) => u.key)),
    dayCounts: new Map(counts.map((c) => [`${recipientId}|${c.code}|${localDay}`, c.n])),
    recent: new Map([[recipientId, recent.map((r) => r.at.getTime())]]),
    tipTotals, tipMateVotes,
  };
}

async function previousResultXp(tx: Executor, xe: XpEvent) {
  if (!xe.type.startsWith('result.')) return 0;
  const scope = `${xe.ctx.cultureId ?? ''}:${xe.ctx.seasonId ?? ''}`;
  const [r] = await tx.select({ n: sql<number>`coalesce(sum(${xpLedgerEntry.amount}), 0)::int` }).from(xpLedgerEntry)
    .where(inArray(xpLedgerEntry.idempotencyKey, [`result.partial:${scope}`, `result.complete:${scope}`]));
  return r?.n ?? 0;
}

async function insertDrafts(tx: Executor, drafts: LedgerDraft[], eventId: string | null, at: Date) {
  for (const d of drafts) {
    await tx.insert(xpLedgerEntry).values({
      userId: d.recipientId, gardenId: d.gardenId, eventId, actionCode: d.code, amount: d.amount, skillPrimary: d.skills[0], skillSecondary: d.skills[1],
      reason: d.reason, idempotencyKey: d.key, subjectId: d.subjectId, cultureId: d.cultureId, localDay: d.localDay, rulesVersion: RULES_VERSION, createdAt: at,
    }).onConflictDoNothing();
    if (d.flagged) {
      const windowStart = new Date(Math.floor(at.getTime() / BURST_WINDOW_MS) * BURST_WINDOW_MS);
      await tx.insert(xpFlag).values({ userId: d.recipientId, windowStart, events: 1 }).onConflictDoUpdate({ target: [xpFlag.userId, xpFlag.windowStart], set: { events: sql`${xpFlag.events} + 1` } });
    }
  }
}

/** RG-XP-02 / XP-09 : annulation des gains liés à un contenu supprimé, ou d'un vote retiré. */
async function reverse(tx: Executor, where: ReturnType<typeof and>, e: EmittedEvent) {
  const rows = await tx.select({ id: xpLedgerEntry.id, key: xpLedgerEntry.idempotencyKey, amount: xpLedgerEntry.amount, userId: xpLedgerEntry.userId, gardenId: xpLedgerEntry.gardenId,
    code: xpLedgerEntry.actionCode, skillPrimary: xpLedgerEntry.skillPrimary, skillSecondary: xpLedgerEntry.skillSecondary, subjectId: xpLedgerEntry.subjectId, cultureId: xpLedgerEntry.cultureId,
    reversed: sql<boolean>`exists (select 1 from xp_ledger_entry r where r.reverses_entry_id = ${xpLedgerEntry.id})` }).from(xpLedgerEntry).where(where);
  const users = new Set<string>();
  for (const r of reversalsFor(rows)) {
    const src = rows.find((x) => x.id === r.reversesEntryId);
    if (!src) continue;
    users.add(src.userId);
    await tx.insert(xpLedgerEntry).values({
      userId: src.userId, gardenId: src.gardenId, eventId: e.id, actionCode: src.code, amount: r.amount, skillPrimary: src.skillPrimary, skillSecondary: src.skillSecondary,
      reason: 'reversal', idempotencyKey: `reversal:${src.key}`, reversesEntryId: src.id, subjectId: src.subjectId, cultureId: src.cultureId,
      localDay: localDate(e.occurredAt, await timezoneOf(tx, src.userId)), rulesVersion: RULES_VERSION, createdAt: e.occurredAt,
    }).onConflictDoNothing();
  }
  return users;
}

/** Projection `user_progress` (§8.1) : recalculée depuis le journal ; le niveau ne baisse jamais (LVL-02). */
export async function refreshProgress(tx: Executor, userId: string) {
  const rows = await tx.select({ amount: xpLedgerEntry.amount, skillPrimary: xpLedgerEntry.skillPrimary, skillSecondary: xpLedgerEntry.skillSecondary }).from(xpLedgerEntry).where(eq(xpLedgerEntry.userId, userId));
  const [prev] = await tx.select({ level: userProgress.level }).from(userProgress).where(eq(userProgress.userId, userId)).limit(1);
  const p = project(rows.map((r) => ({ amount: r.amount, skillPrimary: r.skillPrimary as Skill | null, skillSecondary: r.skillSecondary as Skill | null })), prev?.level ?? 1); // as: colonnes typées par l'enum SKILL_DOMAINS
  await tx.insert(userProgress).values({ userId, totalXp: p.total, level: p.level, skills: p.skills })
    .onConflictDoUpdate({ target: userProgress.userId, set: { totalXp: p.total, level: p.level, skills: p.skills } });
  return p;
}

export type ProcessHooks = { afterXp?: (tx: Executor, userIds: Set<string>, e: EmittedEvent) => Promise<void> };
const after: NonNullable<ProcessHooks['afterXp']>[] = [];
/** Succès et quêtes s'abonnent ici, sans dépendance circulaire avec le moteur d'XP. */
export function onXpProcessed(h: NonNullable<ProcessHooks['afterXp']>) {
  if (!after.includes(h)) after.push(h);
}

/** Abonné synchrone de `emit` (§8.1) : gains, plafonds, annulations, projection des utilisateurs touchés. */
export async function processEvent(tx: Executor, e: EmittedEvent) {
  const touched = new Set<string>();
  const kind = REVERSIBLE[e.type];
  if (kind) {
    for (const u of await reverse(tx, kind === 'culture' ? eq(xpLedgerEntry.cultureId, e.subjectId) : eq(xpLedgerEntry.subjectId, e.subjectId), e)) touched.add(u);
  } else if (e.type === 'tip.voted' && Number(e.payload.previous) === 1 && Number(e.payload.value) !== 1) {
    for (const u of await reverse(tx, eq(xpLedgerEntry.idempotencyKey, `tip.useful_vote:${e.subjectId}:${e.actorId ?? ''}`), e)) touched.add(u);
  }
  const xe = await enrich(tx, e);
  const cands = candidatesFor(xe, await previousResultXp(tx, xe));
  for (const recipientId of new Set(cands.map((c) => c.recipientId))) {
    const mine = cands.filter((c) => c.recipientId === recipientId);
    const day = localDate(e.occurredAt, await timezoneOf(tx, recipientId));
    const drafts = applyRules(mine, await historyFor(tx, recipientId, mine, day, e.occurredAt), e.occurredAt, day);
    await insertDrafts(tx, drafts, e.id, e.occurredAt);
    if (drafts.length) touched.add(recipientId);
  }
  for (const u of touched) await refreshProgress(tx, u);
  if (e.actorId) touched.add(e.actorId);
  for (const h of after) await h(tx, touched, e);
}

/** XP gagnée par un utilisateur sur un contenu (réponse d'une action : « +8 XP », XP-02). */
export async function xpForSubject(tx: Executor, userId: string, subjectId: string) {
  const [r] = await tx.select({ n: sql<number>`coalesce(sum(${xpLedgerEntry.amount}), 0)::int` }).from(xpLedgerEntry)
    .where(and(eq(xpLedgerEntry.userId, userId), eq(xpLedgerEntry.subjectId, subjectId), eq(xpLedgerEntry.reason, 'award')));
  return r?.n ?? 0;
}

/** Quête terminée : gain `quest.*` plafonné (3 quotidiennes par jour), avec l'historique du moteur. */
export async function awardQuest(tx: Executor, userId: string, questId: string, kind: 'daily' | 'weekly' | 'seasonal', gardenId: string | null, at: Date) {
  const code = `quest.${kind}` as const;
  const day = localDate(at, await timezoneOf(tx, userId));
  const cand: Candidate = { code, recipientId: userId, key: `quest:${questId}`, amount: { daily: 5, weekly: 15, seasonal: 30 }[kind], skills: [null, null], subjectId: questId, cultureId: null, gardenId };
  const drafts = applyRules([cand], await historyFor(tx, userId, [cand], day, at), at, day);
  await insertDrafts(tx, drafts, null, at);
  await refreshProgress(tx, userId);
}

/* ---------- Lectures ---------- */

export async function progressOf(tx: Executor, userId: string) {
  const [p] = await tx.select().from(userProgress).where(eq(userProgress.userId, userId)).limit(1);
  return p ?? { userId, totalXp: 0, level: 1, skills: {}, recomputedAt: null };
}

/** Journal d'XP de l'utilisateur (`/app/profil/xp`), transparent : gains, plafonds et annulations. */
export async function ledgerOf(tx: Executor, userId: string, limit = 200) {
  return tx.select({ id: xpLedgerEntry.id, code: xpLedgerEntry.actionCode, amount: xpLedgerEntry.amount, reason: xpLedgerEntry.reason, createdAt: xpLedgerEntry.createdAt, gardenName: garden.name })
    .from(xpLedgerEntry).leftJoin(garden, eq(garden.id, xpLedgerEntry.gardenId)).where(eq(xpLedgerEntry.userId, userId))
    .orderBy(desc(xpLedgerEntry.createdAt), desc(xpLedgerEntry.id)).limit(limit);
}

/** `/admin/xp` : fenêtres de saisies en masse non revues (RG-XP-07). */
export async function openFlags(tx: Executor) {
  return tx.select({ id: xpFlag.id, userId: xpFlag.userId, pseudo: userProfile.pseudo, windowStart: xpFlag.windowStart, events: xpFlag.events })
    .from(xpFlag).leftJoin(userProfile, eq(userProfile.userId, xpFlag.userId)).where(isNull(xpFlag.reviewedAt)).orderBy(desc(xpFlag.windowStart)).limit(200);
}

/* ---------- Recalcul (RG-XP-08) ---------- */

export type RecomputeReport = { events: number; users: number; differences: { userId: string; key: string; expected: number; actual: number }[] };

const baseKey = (k: string) => k.split('#recompute')[0] ?? k;

/**
 * Rejoue tous les événements dans l'ordre avec le barème courant, dans une table fantôme (en mémoire), compare au
 * journal clé par clé et, si `apply`, ajoute des lignes `recompute` de correction (le journal reste append-only).
 * Un second recalcul donne un écart nul (XP-14).
 */
export async function recomputeXp(tx: Executor, opts: { userId?: string; apply: boolean; now: Date }): Promise<RecomputeReport> {
  const events = await tx.select().from(domainEvent).orderBy(asc(domainEvent.occurredAt), asc(domainEvent.id));
  const shadow = new Map<string, { draft: LedgerDraft | null; amount: number; eventId: string; reversesKey?: string; userId: string }>();
  const histories = new Map<string, XpHistory>();
  const historyOf = (u: string): XpHistory => {
    const h = histories.get(u) ?? { keys: new Set(), dayCounts: new Map(), recent: new Map(), tipTotals: new Map(), tipMateVotes: new Map() };
    histories.set(u, h);
    return h;
  };
  const tz = new Map<string, string>();
  for (const e of events) {
    const reversible = REVERSIBLE[e.type];
    const reverseWhere = (pred: (d: LedgerDraft) => boolean) => {
      for (const [k, v] of [...shadow.entries()]) {
        if (!v.draft || v.amount <= 0 || !pred(v.draft) || shadow.has(`reversal:${k}`)) continue;
        shadow.set(`reversal:${k}`, { draft: null, amount: -v.amount, eventId: e.id, reversesKey: k, userId: v.userId });
      }
    };
    if (reversible === 'culture') reverseWhere((d) => d.cultureId === e.subjectId);
    else if (reversible === 'subject') reverseWhere((d) => d.subjectId === e.subjectId);
    else if (e.type === 'tip.voted' && Number(e.payload.previous) === 1 && Number(e.payload.value) !== 1) reverseWhere((d) => d.key === `tip.useful_vote:${e.subjectId}:${e.actorId ?? ''}`);
    const xe = await enrich(tx, e);
    const scope = `${xe.ctx.cultureId ?? ''}:${xe.ctx.seasonId ?? ''}`;
    const prev = xe.type.startsWith('result.') ? [`result.partial:${scope}`, `result.complete:${scope}`].reduce((a, k) => a + (shadow.get(k)?.amount ?? 0), 0) : 0;
    for (const c of candidatesFor(xe, prev)) {
      if (!tz.has(c.recipientId)) tz.set(c.recipientId, await timezoneOf(tx, c.recipientId));
      const day = localDate(e.occurredAt, tz.get(c.recipientId) ?? 'Europe/Paris');
      for (const d of applyRules([c], historyOf(c.recipientId), e.occurredAt, day)) shadow.set(d.key, { draft: d, amount: d.amount, eventId: e.id, userId: d.recipientId });
    }
  }
  const scoped = [...shadow.entries()].filter(([, v]) => !opts.userId || v.userId === opts.userId);
  const ledger = await tx.select({ key: xpLedgerEntry.idempotencyKey, amount: xpLedgerEntry.amount, userId: xpLedgerEntry.userId }).from(xpLedgerEntry)
    .where(opts.userId ? eq(xpLedgerEntry.userId, opts.userId) : undefined);
  const actual = new Map<string, number>();
  for (const l of ledger) actual.set(baseKey(l.key), (actual.get(baseKey(l.key)) ?? 0) + l.amount);
  const differences: RecomputeReport['differences'] = [];
  for (const [k, v] of scoped) {
    const a = actual.get(k);
    if (a === undefined || a !== v.amount) differences.push({ userId: v.userId, key: k, expected: v.amount, actual: a ?? 0 });
  }
  for (const [k, a] of actual) {
    const owner = ledger.find((l) => baseKey(l.key) === k)?.userId ?? '';
    if (!shadow.has(k) && a !== 0 && !k.startsWith('quest:')) differences.push({ userId: owner, key: k, expected: 0, actual: a });
  }
  if (opts.apply && differences.length) {
    const runTag = `#recompute${opts.now.getTime()}`;
    for (const d of differences) {
      const s = shadow.get(d.key);
      const src = s?.draft;
      const reversed = s?.reversesKey ? shadow.get(s.reversesKey)?.draft : undefined;
      const model = src ?? reversed;
      const day = localDate(opts.now, tz.get(d.userId) ?? (await timezoneOf(tx, d.userId)));
      await tx.insert(xpLedgerEntry).values({
        userId: d.userId, gardenId: model?.gardenId ?? null, eventId: s?.eventId ?? null, actionCode: model?.code ?? 'recompute', amount: d.expected - d.actual,
        skillPrimary: model?.skills[0] ?? null, skillSecondary: model?.skills[1] ?? null, reason: 'recompute', idempotencyKey: `${d.key}${runTag}`,
        subjectId: model?.subjectId ?? null, cultureId: model?.cultureId ?? null, localDay: day, rulesVersion: RULES_VERSION, createdAt: opts.now,
      });
    }
    for (const u of new Set(differences.map((d) => d.userId))) {
      await refreshProgress(tx, u);
      await tx.update(userProgress).set({ recomputedAt: opts.now }).where(eq(userProgress.userId, u));
    }
  }
  return { events: events.length, users: new Set(scoped.map(([, v]) => v.userId)).size, differences };
}

