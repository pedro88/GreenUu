import type { OrgType, Skill } from '@/lib/enums';

/** Barème V1 (SPEC §8.2) : montants et plafonds par jour local de l'utilisateur. Toute modification passe par la spec. */
export const RULES_VERSION = 1;

export const BAREME = {
  'stage.sown_planted': { amount: 10, dailyCap: 10 },
  'stage.other': { amount: 3, dailyCap: 20 },
  'journal.observation': { amount: 5, dailyCap: 10 },
  'journal.problem': { amount: 8, dailyCap: 5 },
  'journal.photo': { amount: 3, dailyCap: 10 },
  'harvest.recorded': { amount: 8, dailyCap: 10 },
  'result.complete': { amount: 40, dailyCap: null },
  'result.partial': { amount: 15, dailyCap: null },
  'result.documented_bonus': { amount: 10, dailyCap: null },
  'ticket.completed': { amount: 5, dailyCap: 15 },
  'ticket.collective_help': { amount: 3, dailyCap: 10 },
  'guide.first_published': { amount: 30, dailyCap: 1 },
  'guide.applied_by_other': { amount: 5, dailyCap: 10 },
  'guide.forked_by_other': { amount: 5, dailyCap: 5 },
  'tip.useful_vote': { amount: 2, dailyCap: 30 },
  'variety.approved': { amount: 15, dailyCap: null },
  'quest.daily': { amount: 5, dailyCap: 3 },
  'quest.weekly': { amount: 15, dailyCap: null },
  'quest.seasonal': { amount: 30, dailyCap: null },
} as const satisfies Record<string, { amount: number; dailyCap: number | null }>;

export type XpCode = keyof typeof BAREME;

/** RG-XP-04 : au plus 40 XP de votes par tip ; au-delà de 5 votes de membres d'un jardin commun, plus d'XP. */
export const TIP_TOTAL_CAP = 40;
export const TIP_MATE_VOTES_CAP = 5;
/** RG-XP-07 : au-delà de 30 événements générateurs en 10 minutes, les suivants sont plafonnés. */
export const BURST_EVENTS = 30;
export const BURST_WINDOW_MS = 10 * 60_000;
export const GUIDE_MIN_WORDS = 300;
const COLLECTIVE_ORGS: OrgType[] = ['collective', 'association', 'educational'];

/** Événement de domaine enrichi du contexte nécessaire au barème (espèce, environnement, éligibilité…). */
export type XpEvent = {
  id: string;
  type: string;
  actorId: string | null;
  gardenId: string | null;
  subjectId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  ctx: {
    speciesSkill?: Skill | null;
    underCover?: boolean;
    compostZone?: boolean;
    ownSavedSeeds?: boolean;
    orgType?: OrgType | null;
    textLength?: number;
    observationDays?: number;
    seasonId?: string | null;
    cultureId?: string | null;
    /** Destinataire du gain quand ce n'est pas l'acteur (auteur du tip ou du guide, proposant de la variété). */
    recipientId?: string | null;
    /** Acteur éligible au sens de RG-XP-04 (e-mail vérifié, compte de plus de 7 jours, et pas le destinataire). */
    actorEligible?: boolean;
    /** Votant membre d'un jardin commun avec l'auteur du tip. */
    voterIsGardenMate?: boolean;
    /** L'auteur du guide est membre du jardin où il est appliqué. */
    authorIsMember?: boolean;
  };
};

export type Candidate = {
  code: XpCode;
  recipientId: string;
  key: string;
  amount: number;
  skills: [Skill | null, Skill | null];
  subjectId: string;
  cultureId: string | null;
  gardenId: string | null;
  /** Clé de plafond particulière (par tip, par auteur…), en plus du plafond quotidien du code. */
  tipId?: string;
  mateVote?: boolean;
};

/** Compétences d'un gain de culture : domaine de l'espèce, puis « sous abri » ou « semences » (§8.4). */
function cultureSkills(e: XpEvent, seeds: boolean): [Skill | null, Skill | null] {
  if (e.ctx.compostZone) return ['compost', null];
  const secondary: Skill | null = seeds ? 'seeds' : e.ctx.underCover ? 'greenhouse' : null;
  return [e.ctx.speciesSkill ?? null, secondary];
}

/** Gains candidats d'un événement (§8.2). Les événements absents du barème ne rapportent rien (XP-16). */
export function candidatesFor(e: XpEvent, previousResultXp = 0): Candidate[] {
  const p = e.payload;
  const base = { subjectId: e.subjectId, cultureId: e.ctx.cultureId ?? null, gardenId: e.gardenId };
  const actor = e.actorId;
  const mk = (code: XpCode, key: string, skills: [Skill | null, Skill | null], recipientId: string | null = actor, amount: number = BAREME[code].amount): Candidate[] =>
    (recipientId ? [{ ...base, code, key, skills, recipientId, amount }] : []);
  switch (e.type) {
    case 'culture.stage_recorded': {
      if (typeof p.actualOn !== 'string' || !p.actualOn) return [];
      const stage = String(p.stage);
      const sown = stage === 'sowing' || stage === 'planting';
      return mk(sown ? 'stage.sown_planted' : 'stage.other', `stage:${e.subjectId}:${stage}`, cultureSkills(e, sown && stage === 'sowing' && e.ctx.ownSavedSeeds === true));
    }
    case 'journal.entry_created': {
      const skills = cultureSkills(e, false);
      const out: Candidate[] = [];
      const problem = (p.kind === 'disease' || p.kind === 'pest') && p.structured === true;
      if (problem) out.push(...mk('journal.problem', `journal.problem:${e.subjectId}`, skills));
      else if ((e.ctx.textLength ?? 0) >= 20 || p.structured === true) out.push(...mk('journal.observation', `journal.observation:${e.subjectId}`, skills));
      if (p.hasPhoto === true) out.push(...mk('journal.photo', `journal.photo:${e.subjectId}`, skills));
      return out;
    }
    case 'harvest.recorded':
      return mk('harvest.recorded', `harvest:${e.subjectId}`, cultureSkills(e, p.seedSaving === true));
    case 'result.submitted':
    case 'result.updated': {
      const c = Number(p.completeness ?? 0);
      const culture = e.ctx.cultureId ?? String(p.cultureId ?? '');
      const scope = `${culture}:${e.ctx.seasonId ?? ''}`;
      const skills = cultureSkills(e, false);
      if (c >= 100) {
        // Complément jusqu'à 40 au plus par culture et par saison (XP-11).
        const complement = Math.max(0, BAREME['result.complete'].amount - previousResultXp);
        const out = mk('result.complete', `result.complete:${scope}`, skills, actor, complement);
        if ((e.ctx.observationDays ?? 0) >= 3) out.push(...mk('result.documented_bonus', `result.documented_bonus:${scope}`, skills));
        return out;
      }
      return c >= 60 ? mk('result.partial', `result.partial:${scope}`, skills) : [];
    }
    case 'ticket.completed': {
      if (p.firstTime !== true) return [];
      const skills = cultureSkills(e, false);
      const out = mk('ticket.completed', `ticket.completed:${e.subjectId}`, skills);
      const helps = p.assignedToGroup === true || (typeof p.createdBy === 'string' && p.createdBy !== actor);
      if (helps && e.ctx.orgType && COLLECTIVE_ORGS.includes(e.ctx.orgType)) out.push(...mk('ticket.collective_help', `ticket.collective_help:${e.subjectId}`, skills));
      return out;
    }
    case 'guide.published':
      return p.firstPublication === true && p.visibility !== 'private' && Number(p.words ?? 0) >= GUIDE_MIN_WORDS
        ? mk('guide.first_published', `guide.first_published:${e.subjectId}`, [e.ctx.speciesSkill ?? null, null]) : [];
    case 'guide.applied':
      return e.ctx.actorEligible && !e.ctx.authorIsMember && e.ctx.recipientId && e.ctx.recipientId !== actor
        ? mk('guide.applied_by_other', `guide.applied_by_other:${e.subjectId}:${String(p.cultureId ?? '')}`, [e.ctx.speciesSkill ?? null, null], e.ctx.recipientId) : [];
    case 'guide.forked':
      return p.visibility === 'public' && e.ctx.actorEligible && e.ctx.recipientId && e.ctx.recipientId !== actor
        ? mk('guide.forked_by_other', `guide.forked_by_other:${e.subjectId}`, [e.ctx.speciesSkill ?? null, null], e.ctx.recipientId) : [];
    case 'tip.voted': {
      if (Number(p.value) !== 1 || Number(p.previous) === 1 || !e.ctx.actorEligible || !e.ctx.recipientId || e.ctx.recipientId === actor) return [];
      return mk('tip.useful_vote', `tip.useful_vote:${e.subjectId}:${actor ?? ''}`, [null, null], e.ctx.recipientId)
        .map((c) => ({ ...c, tipId: e.subjectId, mateVote: e.ctx.voterIsGardenMate === true }));
    }
    case 'variety.approved':
      return mk('variety.approved', `variety.approved:${e.subjectId}`, [e.ctx.speciesSkill ?? null, null], e.ctx.recipientId ?? null);
    default:
      return [];
  }
}

export type LedgerDraft = Candidate & { reason: 'award' | 'cap_reached'; localDay: string; flagged?: boolean };

/** Ce que le journal sait déjà, pour l'utilisateur concerné (lu en base par le service, fourni ici en clair). */
export type XpHistory = {
  keys: Set<string>;
  /** `${userId}|${code}|${jour}` → nombre de lignes (gains et plafonnés) du jour. */
  dayCounts: Map<string, number>;
  /** Instants des événements générateurs récents par utilisateur (fenêtre de 10 min). */
  recent: Map<string, number[]>;
  /** XP de votes déjà versée par tip, et votes de membres de jardins communs déjà comptés. */
  tipTotals: Map<string, number>;
  tipMateVotes: Map<string, number>;
};

export const emptyHistory = (): XpHistory => ({ keys: new Set(), dayCounts: new Map(), recent: new Map(), tipTotals: new Map(), tipMateVotes: new Map() });

/**
 * RG-XP-01, 04, 05, 07 : idempotence, plafonds du jour local (au jour de saisie, RG-XP-06), plafonds des tips, saisies
 * en masse. Les candidats sont traités dans l'ordre ; l'historique est mis à jour au fil de l'eau.
 */
export function applyRules(candidates: Candidate[], h: XpHistory, at: Date, localDay: string): LedgerDraft[] {
  const out: LedgerDraft[] = [];
  for (const c of candidates) {
    if (h.keys.has(c.key) || c.amount === 0) continue;
    h.keys.add(c.key);
    const dayKey = `${c.recipientId}|${c.code}|${localDay}`;
    const count = h.dayCounts.get(dayKey) ?? 0;
    h.dayCounts.set(dayKey, count + 1);
    const recent = (h.recent.get(c.recipientId) ?? []).filter((t) => at.getTime() - t < BURST_WINDOW_MS);
    recent.push(at.getTime());
    h.recent.set(c.recipientId, recent);
    const cap = BAREME[c.code].dailyCap;
    let capped = cap !== null && count >= cap;
    if (c.tipId) {
      const total = h.tipTotals.get(c.tipId) ?? 0;
      const mates = h.tipMateVotes.get(c.tipId) ?? 0;
      if (total + c.amount > TIP_TOTAL_CAP || (c.mateVote && mates >= TIP_MATE_VOTES_CAP)) capped = true;
      if (!capped) {
        h.tipTotals.set(c.tipId, total + c.amount);
        if (c.mateVote) h.tipMateVotes.set(c.tipId, mates + 1);
      }
    }
    const burst = recent.length > BURST_EVENTS;
    out.push({ ...c, amount: capped || burst ? 0 : c.amount, reason: capped || burst ? 'cap_reached' : 'award', localDay, ...(burst ? { flagged: true } : {}) });
  }
  return out;
}

/** `score(event, history)` (§8.1) : barème puis règles anti-abus. */
export function score(e: XpEvent, h: XpHistory, localDay: string, previousResultXp = 0): LedgerDraft[] {
  return applyRules(candidatesFor(e, previousResultXp), h, e.occurredAt, localDay);
}

/** RG-XP-02 : une annulation par gain positif encore actif, de montant opposé. */
export function reversalsFor(entries: { id: string; amount: number; reversed: boolean }[]) {
  return entries.filter((e) => e.amount > 0 && !e.reversed).map((e) => ({ reversesEntryId: e.id, amount: -e.amount, key: `reversal:${e.id}` }));
}

/** Niveau (§8.4) : seuil(L) = 50 × L × (L − 1). */
export function levelOf(total: number): number {
  let l = 1;
  while (50 * (l + 1) * l <= total) l += 1;
  return l;
}

/** Niveau de compétence : seuil_c(L) = 25 × L × (L − 1). */
export function skillLevelOf(total: number): number {
  let l = 1;
  while (25 * (l + 1) * l <= total) l += 1;
  return l;
}

/** Niveau d'un jardin (§8.7) : seuils des niveaux individuels multipliés par 5. */
export const gardenLevelOf = (xp: number) => levelOf(Math.floor(xp / 5));
export const gardenNextLevelAt = (level: number) => nextLevelAt(level) * 5;

/** XP restante jusqu'au niveau suivant (affichage du profil). */
export const nextLevelAt = (level: number) => 50 * (level + 1) * level;

/** Projection : total, compétences (chaque gain les alimente du même montant, sans doubler le total), niveau max historique. */
export function project(entries: { amount: number; skillPrimary: Skill | null; skillSecondary: Skill | null }[], previousLevel = 1) {
  const skills: Partial<Record<Skill, number>> = {};
  let total = 0;
  for (const e of entries) {
    total += e.amount;
    for (const s of [e.skillPrimary, e.skillSecondary]) if (s) skills[s] = (skills[s] ?? 0) + e.amount;
  }
  return { total, skills, level: Math.max(previousLevel, levelOf(total)) };
}
