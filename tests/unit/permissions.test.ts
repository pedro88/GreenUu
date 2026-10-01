import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assignableRoles, canManageMember, defaultPlanEditMinRole, evaluate, isZoneRestricted, PERMISSIONS, ROLES, ruleFor, type Permission, type Rule } from '@/server/authz/permissions';

/** Lit la matrice §5.2 de SPEC.md : la spec est la source de vérité. */
function specMatrix(): Map<string, string[]> {
  const spec = readFileSync('SPEC.md', 'utf8');
  const start = spec.indexOf('### 5.2 Matrice des permissions');
  const end = spec.indexOf('Réglages qui modulent la matrice', start);
  const rows = new Map<string, string[]>();
  for (const line of spec.slice(start, end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const keys = cells[1]?.match(/`[a-z_]+:[a-z_]+`/g);
    if (!keys) continue;
    for (const k of keys) rows.set(k.replaceAll('`', ''), cells.slice(3, 7));
  }
  return rows;
}

function cellFor(rule: Rule, restricted: boolean): string {
  const base = rule === true ? '✅' : rule === false ? '❌' : rule === 'own' ? 'propre' : rule === 'own_or_assigned' ? 'propre ou assigné'
    : rule === 'own_or_assigned_or_unassigned' ? 'propre ou assigné, ou ticket non assigné' : rule === 'setting:plan' ? '⚙️' : '✅ (⚙️)';
  return restricted ? `${base} 🔒` : base;
}

describe('matrice des permissions', () => {
  it('[AUTHZ-04] correspond exactement à SPEC.md §5.2 (une ligne par case)', () => {
    const spec = specMatrix();
    expect([...spec.keys()].sort()).toEqual(Object.keys(PERMISSIONS).sort());
    for (const [key, cells] of spec) {
      const permission = key as Permission; // as: clé vérifiée juste au-dessus contre Object.keys(PERMISSIONS)
      ROLES.forEach((role, i) => {
        const restricted = isZoneRestricted(permission) && role === 'member';
        expect(`${key}/${role}: ${cellFor(ruleFor(permission, role), restricted)}`).toBe(`${key}/${role}: ${cells[i]}`);
      });
    }
  });

  it('[AUTHZ-04] évalue les règles « propre », « assigné » et les réglages', () => {
    const settings = { planEditMinRole: 'admin' as const, decorMinRole: 'member' as const };
    expect(evaluate('culture:delete', 'member', settings, { isOwn: false })).toBe(false);
    expect(evaluate('culture:delete', 'member', settings, { isOwn: true })).toBe(true);
    expect(evaluate('ticket:transition', 'member', settings, { isUnassigned: true })).toBe(true);
    expect(evaluate('zone:create', 'member', settings)).toBe(false);
    expect(evaluate('zone:create', 'member', { ...settings, planEditMinRole: 'member' })).toBe(true);
    expect(evaluate('garden:read', 'observer', settings)).toBe(true);
  });

  it('[INV-07] un admin ne peut attribuer que membre / observateur', () => {
    expect(assignableRoles('owner')).toEqual(['admin', 'member', 'observer']);
    expect(assignableRoles('admin')).toEqual(['member', 'observer']);
    expect(assignableRoles('member')).toEqual([]);
  });

  it('[MBR-04] un admin ne gère ni un autre admin ni l\'owner', () => {
    expect(canManageMember('admin', 'admin')).toBe(false);
    expect(canManageMember('admin', 'owner')).toBe(false);
    expect(canManageMember('admin', 'member')).toBe(true);
    expect(canManageMember('owner', 'admin')).toBe(true);
  });

  it('[AUTHZ-10] plan_edit_min_role par défaut selon le type de jardin', () => {
    expect(defaultPlanEditMinRole('family')).toBe('member');
    expect(defaultPlanEditMinRole('individual')).toBe('member');
    expect(defaultPlanEditMinRole('collective')).toBe('admin');
  });
});
