import postgres from 'postgres';

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
