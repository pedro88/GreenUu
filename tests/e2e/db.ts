import postgres from 'postgres';
import { seedId } from '../../src/lib/uuid5';

/** Base des e2e, remise à zéro et seedée au démarrage du serveur (SPEC §13). */
/**
 * Instant de référence des e2e : serveur (APP_NOW) et seed (SEED_REFERENCE_DATE) partagent cette seule source de
 * « maintenant » (audit e2e lot 4, C1). Un mercredi de milieu de mois, hors bascule d'heure d'été (25 octobre).
 */
export const E2E_NOW = '2026-10-14T10:00:00Z';
export const E2E_YEAR = 2026;

export const TEST_DB = process.env.DATABASE_URL_TEST ?? 'postgres://greenu:greenu@localhost:5434/greenu_test';

/** Préconditions lues en base plutôt que par l'UI : les tickets du seed n'ont pas d'ID déterministe. */
export async function ticketIdByTitle(gardenId: string, title: string): Promise<string> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ id: string }[]>`select id from ticket where garden_id = ${gardenId} and title = ${title} and deleted_at is null limit 1`;
    if (!row) throw new Error(`ticket « ${title} » introuvable`);
    return row.id;
  } finally {
    await sql.end();
  }
}

export async function ticketCount(gardenId: string, title: string): Promise<number> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from ticket where garden_id = ${gardenId} and title = ${title}`;
    return row?.n ?? 0;
  } finally {
    await sql.end();
  }
}

export async function guideIdByTitle(title: string): Promise<string> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ id: string }[]>`select g.id from guide g join guide_version v on v.id = g.current_version_id where v.title = ${title} and g.deleted_at is null limit 1`;
    if (!row) throw new Error(`guide « ${title} » introuvable`);
    return row.id;
  } finally {
    await sql.end();
  }
}

export async function tipContext(body: string): Promise<{ geohash4: string | null; koppen: string | null } | null> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ geohash4: string | null; koppen: string | null }[]>`select geohash4, koppen from tip where body = ${body} limit 1`;
    return row ?? null;
  } finally {
    await sql.end();
  }
}

export async function guideSlugByTitle(title: string): Promise<string> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ slug: string }[]>`select g.slug from guide g join guide_version v on v.id = g.current_version_id where v.title = ${title} limit 1`;
    if (!row) throw new Error(`guide « ${title} » introuvable`);
    return row.slug;
  } finally {
    await sql.end();
  }
}

/** Précondition de modération posée en base (le masquage automatique est testé en intégration, MOD-01). */
export async function hideGuide(title: string): Promise<void> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    await sql`update guide set hidden_by_moderation = true where current_version_id in (select id from guide_version where title = ${title})`;
  } finally {
    await sql.end();
  }
}

/**
 * Vue jardin (MAP-02) : zones placées de la scène extérieure et cultures en cours qui y sont placées (leur zone ou un
 * ancêtre a une géométrie), lues en base au moment du test.
 */
export async function placedEntities(gardenId: string): Promise<{ zones: string[]; cultures: string[] }> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const zones = await sql<{ id: string }[]>`select id from zone where garden_id = ${gardenId} and archived_at is null and scene_zone_id is null and geometry is not null`;
    const cultures = await sql<{ id: string }[]>`
      select c.id from culture c join zone z on z.id = c.zone_id
      where c.garden_id = ${gardenId} and c.deleted_at is null and c.status = 'active' and z.scene_zone_id is null and z.archived_at is null
        and exists (select 1 from zone a where a.garden_id = z.garden_id and a.geometry is not null and (a.id = z.id or a.id::text = any (string_to_array(z.path, '/'))))`;
    return { zones: zones.map((r) => r.id), cultures: cultures.map((r) => r.id) };
  } finally {
    await sql.end();
  }
}

/** Zone non archivée d'un jardin à une géométrie donnée (PLN-01, PLN-02). */
export async function zoneAt(gardenId: string, g: { x: number; y: number; w: number; h: number }) {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ id: string; name: string; type: string; parent: string | null; geometry: unknown }[]>`
      select z.id, z.name, t.code as type, p.name as parent, z.geometry from zone z join zone_type t on t.id = z.zone_type_id left join zone p on p.id = z.parent_id
      where z.garden_id = ${gardenId} and z.archived_at is null and (z.geometry->>'x')::int = ${g.x} and (z.geometry->>'y')::int = ${g.y}
        and (z.geometry->>'w')::int = ${g.w} and (z.geometry->>'h')::int = ${g.h} limit 1`;
    return row ?? null;
  } finally {
    await sql.end();
  }
}

/** Culture rattachée à un ticket du seed (E2E-MAP-04b). */
export async function cultureOfTicket(gardenId: string, title: string): Promise<string> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ id: string | null }[]>`select culture_id as id from ticket where garden_id = ${gardenId} and title = ${title} and deleted_at is null limit 1`;
    if (!row?.id) throw new Error(`ticket « ${title} » sans culture`);
    return row.id;
  } finally {
    await sql.end();
  }
}

/** Avatar enregistré d'un utilisateur (AVT-01, AVT-02) ; null tant qu'aucun n'a été attribué. */
export async function avatarRow(userId: string): Promise<{ configHash: string; config: { layers: Record<string, { item: string | null; palettes: string[] }> } } | null> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ config_hash: string; config: { layers: Record<string, { item: string | null; palettes: string[] }> } }[]>`select config_hash, config from user_avatar where user_id = ${userId}`;
    return row ? { configHash: row.config_hash, config: row.config } : null;
  } finally {
    await sql.end();
  }
}

/** Pratique déclarée par un objet de déco (DEC-03). */
export async function decorPracticeCode(placementId: string): Promise<string | null> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ code: string }[]>`select p.code from practice_declaration d join practice p on p.id = d.practice_id where d.decor_placement_id = ${placementId}`;
    return row?.code ?? null;
  } finally {
    await sql.end();
  }
}

/** Objet de déco posé à une position (E2E-DEC-01b). */
export async function decorAtPosition(gardenId: string, itemCode: string, x: number, y: number): Promise<{ id: string; placedBy: string | null } | null> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ id: string; placed_by: string | null }[]>`
      select p.id, p.placed_by from decor_placement p join decor_item i on i.id = p.decor_item_id
      where p.garden_id = ${gardenId} and i.code = ${itemCode} and p.x_cm = ${x} and p.y_cm = ${y} limit 1`;
    return row ? { id: row.id, placedBy: row.placed_by } : null;
  } finally {
    await sql.end();
  }
}

/** Déclarations d'une pratique au niveau du jardin, avec l'objet éventuellement lié (E2E-DEC-01b). */
export async function practiceDeclarations(gardenId: string, code: string): Promise<{ decorPlacementId: string | null }[]> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const rows = await sql<{ decor_placement_id: string | null }[]>`
      select d.decor_placement_id from practice_declaration d join practice p on p.id = d.practice_id where d.garden_id = ${gardenId} and p.code = ${code}`;
    return rows.map((r) => ({ decorPlacementId: r.decor_placement_id }));
  } finally {
    await sql.end();
  }
}

/** XP d'un jardin : somme des gains positifs (§8.7), pour la page de progression. */
export async function gardenXpOf(gardenId: string): Promise<number> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ n: number }[]>`select coalesce(sum(amount) filter (where amount > 0), 0)::int as n from xp_ledger_entry where garden_id = ${gardenId}`;
    return row?.n ?? 0;
  } finally {
    await sql.end();
  }
}

/**
 * Contenu exclusif propre au test AVT-02 : le catalogue réel est entièrement disponible. L'élément reprend le sprite
 * du chapeau de paille et exige le succès « Semencier ». Retiré par `removeExclusiveAvatarItem`.
 */
export const EXCLUSIVE_ITEM = 'exclusive_straw_hat';
export async function addExclusiveAvatarItem(): Promise<void> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    await sql`insert into avatar_item (code, layer, sprite_key, palette_slots, unlock_condition, default_unlocked, sort_order)
      values (${EXCLUSIVE_ITEM}, 'headwear', 'couvre-chef-chapeau-paille', '["material"]'::jsonb, '{"v":1,"kind":"achievement","code":"seed_saver"}'::jsonb, false, 999)
      on conflict (code) do nothing`;
    await sql`insert into avatar_item_palette (avatar_item_id, palette_id)
      select i.id, p.id from avatar_item i, palette p where i.code = ${EXCLUSIVE_ITEM} and p.code = 'straw' on conflict do nothing`;
  } finally {
    await sql.end();
  }
}
export async function removeExclusiveAvatarItem(): Promise<void> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    await sql`delete from avatar_item where code = ${EXCLUSIVE_ITEM}`;
  } finally {
    await sql.end();
  }
}

/** Jardin créé par l'assistant, relu par son nom (LOC-01). */
export async function gardenByName(name: string): Promise<{ lat: number; lng: number; timezone: string; altitudeM: number | null; placeLabel: string | null } | null> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ lat: number; lng: number; timezone: string; altitude_m: number | null; place_label: string | null }[]>`
      select lat, lng, timezone, altitude_m, place_label from garden where name = ${name} order by created_at desc limit 1`;
    return row ? { lat: Number(row.lat), lng: Number(row.lng), timezone: row.timezone, altitudeM: row.altitude_m, placeLabel: row.place_label } : null;
  } finally {
    await sql.end();
  }
}

/** Espèce la plus récoltée (en kg) d'un jardin sur des saisons civiles, avec ses kilos par année (STAT-01). */
export async function topSpeciesKgByYear(gardenId: string): Promise<{ speciesId: string; kg: Record<number, number> }> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const rows = await sql<{ species_id: string; y: number; kg: number }[]>`
      select c.species_id, extract(year from h.harvested_on)::int as y, sum(h.quantity_kg)::float as kg
      from harvest h join culture c on c.id = h.culture_id
      where h.garden_id = ${gardenId} and h.deleted_at is null and c.deleted_at is null and h.quantity_kg is not null
      group by 1, 2`;
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.species_id, (totals.get(r.species_id) ?? 0) + r.kg);
    const [speciesId = ''] = [...totals].sort((a, b) => b[1] - a[1])[0] ?? [];
    return { speciesId, kg: Object.fromEntries(rows.filter((r) => r.species_id === speciesId).map((r) => [r.y, r.kg])) };
  } finally {
    await sql.end();
  }
}

/** Saisies relues par leur texte (OFF-02, OFF-05). */
export async function journalCountByBody(body: string): Promise<number> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from journal_entry where body = ${body} and deleted_at is null`;
    return row?.n ?? 0;
  } finally {
    await sql.end();
  }
}
export async function harvestCount(cultureId: string, quantity: number): Promise<number> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from harvest where culture_id = ${cultureId} and quantity = ${quantity} and deleted_at is null`;
    return row?.n ?? 0;
  } finally {
    await sql.end();
  }
}

/** Supprime (ou rétablit) une culture, comme le ferait un autre membre pendant que l'appareil est hors-ligne (OFF-05). */
export async function setCultureDeleted(cultureId: string, deleted: boolean): Promise<void> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    await sql`update culture set deleted_at = ${deleted ? sql`now()` : null} where id = ${cultureId}`;
  } finally {
    await sql.end();
  }
}

/**
 * Jardin neuf pour un test du jardin vivant (lot 9) : un seul membre (propriétaire) et une planche placée, pour que
 * les gestes et les versions du plan ne croisent pas ceux des autres tests. `watered` ajoute un arrosage de la planche,
 * enregistré 40 minutes avant l'instant de référence (événement déjà distribué : il ne rapporte pas d'XP).
 */
export async function freshGarden(owner: string, opts: { orgType?: 'individual' | 'family' | 'collective'; watered?: boolean } = {}): Promise<{ gardenId: string; zoneId: string }> {
  const sql = postgres(TEST_DB, { max: 1 });
  const ownerId = seedId(`user:${owner}`);
  try {
    return await sql.begin(async (tx) => {
      const name = `Jardin vivant ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const [g] = await tx<{ id: string }[]>`insert into garden (name, org_type, lat, lng, geohash4, timezone, plan_edit_min_role, created_by)
        values (${name}, ${opts.orgType ?? 'individual'}, 50.4669, 4.8675, 'u0hw', 'Europe/Brussels', 'admin', ${ownerId}) returning id`;
      const gardenId = g?.id ?? '';
      await tx`insert into garden_member (garden_id, user_id, role) values (${gardenId}, ${ownerId}, 'owner')`;
      const [z] = await tx<{ id: string }[]>`insert into zone (garden_id, zone_type_id, name, geometry)
        values (${gardenId}, (select id from zone_type where code = 'bed' and garden_id is null), 'Planche 2', ${tx.json({ v: 1, kind: 'rect', x: 100, y: 100, w: 200, h: 300 })}) returning id`;
      const zoneId = z?.id ?? '';
      if (opts.watered) {
        const at = new Date(Date.parse(E2E_NOW) - 40 * 60_000);
        const [j] = await tx<{ id: string }[]>`insert into journal_entry (garden_id, zone_id, kind, intervention, observed_at, author_id)
          values (${gardenId}, ${zoneId}, 'intervention', 'watering', ${at}, ${ownerId}) returning id`;
        await tx`insert into domain_event (type, actor_id, garden_id, subject_type, subject_id, payload, occurred_at, dispatched_at)
          values ('journal.entry_created', ${ownerId}, ${gardenId}, 'journal_entry', ${j?.id ?? ''},
            ${tx.json({ kind: 'intervention', hasPhoto: false, structured: true, cultureId: null, textLength: 0 })}, ${at}, ${at})`;
      }
      return { gardenId, zoneId };
    });
  } finally {
    await sql.end();
  }
}

/** Cases de terrain peintes d'un jardin (PNT-01, PNT-05). */
export async function terrainCells(gardenId: string): Promise<{ x: number; y: number; kind: string }[]> {
  const sql = postgres(TEST_DB, { max: 1 });
  try {
    return [...await sql<{ x: number; y: number; kind: string }[]>`select x, y, kind from terrain_cell where garden_id = ${gardenId} order by y, x`];
  } finally {
    await sql.end();
  }
}
