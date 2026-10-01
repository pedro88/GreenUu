import { asc } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { problem } from '@/server/db/schema';

export function listProblems(tx: Executor) {
  return tx.select().from(problem).orderBy(asc(problem.sortOrder));
}
