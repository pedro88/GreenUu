import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { listZoneTypes } from './repo';
import type { ZoneTypeOption } from './ui/ZoneForm';

export async function zoneTypeOptions(tx: Executor, scope: Scope, opts = { includeArchived: false }): Promise<(ZoneTypeOption & { archived: boolean; canHostCultures: boolean })[]> {
  const rows = await listZoneTypes(tx, scope, opts);
  return rows.map((r) => ({
    id: r.id, code: r.code, label: r.label, isCustom: r.gardenId !== null, hasInteriorDefault: r.hasInteriorDefault, archived: r.archivedAt !== null, canHostCultures: r.canHostCultures,
  }));
}
