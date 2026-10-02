import { sql } from 'drizzle-orm';
import type { OrgType } from '@/lib/enums';
import type { Executor } from '@/server/db/client';
import { avatarsOf } from '../avatar/service';
import type { RectGeometry } from '../zone/tree';
import { spotsBelow } from './grid.pure';
import type { SceneAvatar } from './snapshot.schema';

/*
 * Avatars de la vue jardin (SPEC §9.5, COL-04) : dans les jardins collectifs, chaque membre actif dans les 24 dernières
 * heures apparaît près de la zone de sa dernière action (événement de domaine rattaché à une zone, directement ou par sa
 * culture), ou de l'ancêtre placé le plus proche dans la scène affichée.
 */

export const COLLECTIVE_ORG_TYPES: readonly OrgType[] = ['collective', 'association', 'educational'];
const WINDOW_MS = 24 * 3_600_000;

type ZoneInfo = { id: string; path: string; geometry: RectGeometry | null; sceneZoneId: string | null };

export async function sceneAvatars(tx: Executor, o: { gardenId: string; orgType: OrgType; sceneZoneId: string | null; now: Date; byId: Map<string, ZoneInfo> }): Promise<SceneAvatar[]> {
  if (!COLLECTIVE_ORG_TYPES.includes(o.orgType)) return [];
  const since = new Date(o.now.getTime() - WINDOW_MS);
  const rows = await tx.execute<{ actor_id: string; zone_id: string; pseudo: string }>(sql`
    select distinct on (e.actor_id) e.actor_id, z.zone_id, p.pseudo
    from domain_event e
    join garden_member m on m.garden_id = e.garden_id and m.user_id = e.actor_id and m.left_at is null
    join user_profile p on p.user_id = e.actor_id
    cross join lateral (select case e.subject_type
      when 'zone' then e.subject_id
      when 'culture' then (select c.zone_id from culture c where c.id = e.subject_id)
      when 'ticket' then (select coalesce(t.zone_id, c.zone_id) from ticket t left join culture c on c.id = t.culture_id where t.id = e.subject_id)
      when 'journal_entry' then (select coalesce(j.zone_id, c.zone_id) from journal_entry j left join culture c on c.id = j.culture_id where j.id = e.subject_id)
      when 'harvest' then (select c.zone_id from harvest h join culture c on c.id = h.culture_id where h.id = e.subject_id)
      when 'result' then (select c.zone_id from culture_result r join culture c on c.id = r.culture_id where r.id = e.subject_id)
    end as zone_id) z
    where e.garden_id = ${o.gardenId} and e.actor_id is not null and e.occurred_at > ${since.toISOString()}::timestamptz and e.occurred_at <= ${o.now.toISOString()}::timestamptz
      and z.zone_id is not null
    order by e.actor_id, e.occurred_at desc, e.id desc
    limit 200`);
  const list = [...rows];
  if (!list.length) return [];
  // Zone de la dernière action, ou son ancêtre le plus proche placé dans cette scène.
  const anchorOf = (zoneId: string) => {
    const z = o.byId.get(zoneId);
    const chain = z ? [z.id, ...(z.path ? z.path.split('/').reverse() : [])] : [];
    return chain.map((id) => o.byId.get(id)).find((a) => a?.geometry && a.sceneZoneId === o.sceneZoneId) ?? null;
  };
  const byAnchor = new Map<string, typeof list>();
  for (const r of list) {
    const a = anchorOf(r.zone_id);
    if (a) byAnchor.set(a.id, [...(byAnchor.get(a.id) ?? []), r]);
  }
  const avatars = await avatarsOf(tx, list.map((r) => r.actor_id));
  const out: SceneAvatar[] = [];
  for (const [zoneId, members] of byAnchor) {
    const rect = o.byId.get(zoneId)?.geometry;
    if (!rect) continue;
    const spots = spotsBelow(rect, members.length);
    members.sort((a, b) => (a.pseudo < b.pseudo ? -1 : 1)).forEach((m, i) => {
      const a = avatars.get(m.actor_id);
      const at = spots[i];
      if (a && at) out.push({ userId: m.actor_id, pseudo: m.pseudo, config: a.config, configHash: a.configHash, zoneId: m.zone_id, position: at });
    });
  }
  return out;
}
