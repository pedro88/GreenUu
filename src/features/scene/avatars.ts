import { sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { avatarsOf } from '../avatar/service';
import type { RectGeometry } from '../zone/tree';
import { ACTION_WINDOW_MS, replayedAction } from './avatar-action.pure';
import { spotsBelow } from './grid.pure';
import type { SceneAvatar } from './snapshot.schema';

/*
 * Avatars de la vue jardin (SPEC §9.5, COL-04, LIV-01, LIV-07), dans tous les types de jardin : chaque membre actif dans
 * les 24 dernières heures apparaît près de la zone de sa dernière action (événement de domaine rattaché à une zone,
 * directement ou par sa culture), ou de l'ancêtre placé le plus proche dans la scène affichée. L'utilisateur courant
 * apparaît dès qu'il a agi sur une zone du jardin, même plus anciennement. L'avatar rejoue cette action si elle a moins
 * de 24 h (LIV-08) : rien n'est inventé.
 */

type ZoneInfo = { id: string; path: string; geometry: RectGeometry | null; sceneZoneId: string | null };

export async function sceneAvatars(tx: Executor, o: { gardenId: string; viewerId: string; sceneZoneId: string | null; now: Date; byId: Map<string, ZoneInfo> }): Promise<SceneAvatar[]> {
  const since = new Date(o.now.getTime() - ACTION_WINDOW_MS);
  const rows = await tx.execute<{
    actor_id: string; zone_id: string; pseudo: string; type: string; occurred_at: Date | string; journal_kind: string | null; intervention: string | null;
    has_photo: boolean | null; stage: string | null; method: string | null; action_tag: string | null;
  }>(sql`
    select distinct on (e.actor_id) e.actor_id, z.zone_id, p.pseudo, e.type, e.occurred_at, j.kind as journal_kind, j.intervention,
      (e.payload->>'hasPhoto')::boolean as has_photo, e.payload->>'stage' as stage, c.method, t.action_tag
    from domain_event e
    join garden_member m on m.garden_id = e.garden_id and m.user_id = e.actor_id and m.left_at is null
    join user_profile p on p.user_id = e.actor_id
    left join journal_entry j on e.subject_type = 'journal_entry' and j.id = e.subject_id
    left join ticket t on e.subject_type = 'ticket' and t.id = e.subject_id
    left join culture c on e.subject_type = 'culture' and c.id = e.subject_id
    cross join lateral (select case e.subject_type
      when 'zone' then e.subject_id
      when 'culture' then c.zone_id
      when 'ticket' then coalesce(t.zone_id, (select tc.zone_id from culture tc where tc.id = t.culture_id))
      when 'journal_entry' then coalesce(j.zone_id, (select jc.zone_id from culture jc where jc.id = j.culture_id))
      when 'harvest' then (select hc.zone_id from harvest h join culture hc on hc.id = h.culture_id where h.id = e.subject_id)
      when 'result' then (select rc.zone_id from culture_result r join culture rc on rc.id = r.culture_id where r.id = e.subject_id)
    end as zone_id) z
    where e.garden_id = ${o.gardenId} and e.actor_id is not null and e.occurred_at <= ${o.now.toISOString()}::timestamptz
      and (e.occurred_at > ${since.toISOString()}::timestamptz or e.actor_id = ${o.viewerId})
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
      if (!a || !at) return;
      const occurredAt = new Date(m.occurred_at);
      const action = replayedAction({ type: m.type, journalKind: m.journal_kind, intervention: m.intervention, hasPhoto: m.has_photo ?? false, stage: m.stage, method: m.method, actionTag: m.action_tag, occurredAt }, o.now);
      out.push({ userId: m.actor_id, pseudo: m.pseudo, config: a.config, configHash: a.configHash, zoneId: m.zone_id, position: at, action, ageMinutes: Math.max(0, Math.floor((o.now.getTime() - occurredAt.getTime()) / 60_000)), isViewer: m.actor_id === o.viewerId });
    });
  }
  return out;
}
