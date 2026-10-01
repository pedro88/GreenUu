/**
 * Matrice des permissions d'un jardin — miroir exact de SPEC.md §5.2.
 * Toute modification ici doit d'abord être faite dans la spec (test AUTHZ-04).
 */

export const ROLES = ['owner', 'admin', 'member', 'observer'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { observer: 0, member: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * - `true` / `false` : autorisé / refusé sans condition
 * - `own` : seulement sur ses propres éléments
 * - `own_or_assigned` : auteur ou assigné (directement ou via un groupe)
 * - `own_or_assigned_or_unassigned` : idem, ou ticket sans assignation
 * - `setting:plan` / `setting:decor` : dépend du rôle minimal réglé sur le jardin
 */
export type Rule =
  | boolean
  | 'own'
  | 'own_or_assigned'
  | 'own_or_assigned_or_unassigned'
  | 'setting:plan'
  | 'setting:decor';

type Row = { owner: Rule; admin: Rule; member: Rule; observer: Rule; zoneRestricted?: true };

const all: Row = { owner: true, admin: true, member: true, observer: true };
const adminUp: Row = { owner: true, admin: true, member: false, observer: false };
const ownerOnly: Row = { owner: true, admin: false, member: false, observer: false };
const memberUp: Row = { owner: true, admin: true, member: true, observer: false };

export const PERMISSIONS = {
  'garden:read': all,
  'garden:update': adminUp,
  'garden:read_location': adminUp,
  'garden:share_results': ownerOnly,
  'garden:archive': ownerOnly,
  'garden:delete': ownerOnly,
  'garden:transfer': ownerOnly,
  'member:invite': adminUp,
  'member:change_role': adminUp,
  'member:remove': adminUp,
  'member:leave': { owner: false, admin: true, member: true, observer: true },
  'group:manage': adminUp,
  'zone:create': { owner: true, admin: true, member: 'setting:plan', observer: false, zoneRestricted: true },
  'zone:update': { owner: true, admin: true, member: 'setting:plan', observer: false, zoneRestricted: true },
  'zone:archive': { owner: true, admin: true, member: 'setting:plan', observer: false, zoneRestricted: true },
  'zone:restrict': adminUp,
  'plan:edit': { owner: true, admin: true, member: 'setting:plan', observer: false },
  'decor:place': { owner: true, admin: true, member: 'setting:decor', observer: false },
  'culture:create': { ...memberUp, zoneRestricted: true },
  'culture:update': { ...memberUp, zoneRestricted: true },
  'culture:delete': { owner: true, admin: true, member: 'own', observer: false, zoneRestricted: true },
  'journal:create': { ...memberUp, zoneRestricted: true },
  'journal:update': { owner: true, admin: true, member: 'own', observer: false },
  'journal:delete': { owner: true, admin: true, member: 'own', observer: false },
  'result:submit': { ...memberUp, zoneRestricted: true },
  'ticket:create': { ...memberUp, zoneRestricted: true },
  'ticket:update': { owner: true, admin: true, member: 'own_or_assigned', observer: false },
  'ticket:assign': memberUp,
  'ticket:transition': {
    owner: true,
    admin: true,
    member: 'own_or_assigned_or_unassigned',
    observer: false,
  },
  'ticket:delete': { owner: true, admin: true, member: 'own', observer: false },
  'ticket:comment': memberUp,
  'checklist:toggle': memberUp,
  'guide:create_private': memberUp,
  'guide:apply': { ...memberUp, zoneRestricted: true },
  'goal:manage': adminUp,
  'leaderboard:toggle': adminUp,
  'garden:export': adminUp,
} as const satisfies Record<string, Row>;

export type Permission = keyof typeof PERMISSIONS;

export type GardenSettings = { planEditMinRole: Role; decorMinRole: Role };

/** Faits sur la ressource visée, fournis par le service quand la règle en dépend. */
export type ResourceFacts = {
  isOwn?: boolean;
  isAssigned?: boolean;
  isUnassigned?: boolean;
};

export function ruleFor(permission: Permission, role: Role): Rule {
  return PERMISSIONS[permission][role];
}

export function isZoneRestricted(permission: Permission): boolean {
  const row: Row = PERMISSIONS[permission];
  return row.zoneRestricted === true;
}

/** Évalue une règle de la matrice. Les restrictions de zone sont traitées à part (zone-access.ts). */
export function evaluate(
  permission: Permission,
  role: Role,
  settings: GardenSettings,
  facts: ResourceFacts = {},
): boolean {
  const rule = ruleFor(permission, role);
  switch (rule) {
    case true:
    case false:
      return rule;
    case 'own':
      return facts.isOwn === true;
    case 'own_or_assigned':
      return facts.isOwn === true || facts.isAssigned === true;
    case 'own_or_assigned_or_unassigned':
      return facts.isOwn === true || facts.isAssigned === true || facts.isUnassigned === true;
    case 'setting:plan':
      return roleAtLeast(role, settings.planEditMinRole);
    case 'setting:decor':
      return roleAtLeast(role, settings.decorMinRole);
  }
}

/** Rôles qu'un acteur peut attribuer par invitation ou changement de rôle (SPEC §5.2). */
export function assignableRoles(actor: Role): readonly Role[] {
  if (actor === 'owner') return ['admin', 'member', 'observer'];
  if (actor === 'admin') return ['member', 'observer'];
  return [];
}

/** Un acteur peut-il agir (changer le rôle, retirer) sur un membre ayant `target` ? */
export function canManageMember(actor: Role, target: Role): boolean {
  if (target === 'owner') return false;
  if (actor === 'owner') return true;
  if (actor === 'admin') return target === 'member' || target === 'observer';
  return false;
}

/** Valeur par défaut de `plan_edit_min_role` selon le type d'organisation (SPEC §5.2). */
export function defaultPlanEditMinRole(orgType: string): Role {
  return orgType === 'individual' || orgType === 'family' ? 'member' : 'admin';
}
