import postgres from 'postgres';

/** Base des e2e, remise à zéro et seedée au démarrage du serveur (SPEC §13). */
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
