import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PostgresJsDatabase<Schema>;
/** Transaction Drizzle : même API que Db. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Exécuteur accepté par les dépôts : la base ou une transaction en cours. */
export type Executor = Db | Tx;

const globalForDb = globalThis as unknown as { __greenuSql?: ReturnType<typeof postgres> }; // as: singleton survivant au HMR de Next

export function createSql(url: string) {
  return postgres(url, { max: 10, prepare: true, onnotice: () => undefined });
}

export function createDb(sql: ReturnType<typeof postgres>): Db {
  return drizzle({ client: sql, schema });
}

let cached: Db | undefined;

export function db(): Db {
  if (!cached) {
    globalForDb.__greenuSql ??= createSql(env().DATABASE_URL);
    cached = createDb(globalForDb.__greenuSql);
  }
  return cached;
}

export { schema };
