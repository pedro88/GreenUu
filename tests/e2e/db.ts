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
