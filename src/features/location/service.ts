import { sql } from 'drizzle-orm';
import { normalizeSearch } from '@/lib/text';
import type { Executor } from '@/server/db/client';
import { commune } from '@/server/db/schema';

/*
 * Recherche de communes (SPEC §12.10, LOC-01 à 03) dans la base embarquée : aucun appel externe. Recherche en
 * trigrammes sur le nom normalisé, ou par début de code postal. Une localité qui a plusieurs codes postaux (communes
 * françaises, rues du Luxembourg) n'apparaît qu'une fois, avec son plus petit code.
 */

export const COMMUNE_LIMIT = 10;
export const MIN_QUERY = 2;

/** Pays de la base → fuseau horaire (un seul fuseau par pays couvert). */
export const COUNTRY_TIMEZONES: Record<string, string> = { BE: 'Europe/Brussels', FR: 'Europe/Paris', LU: 'Europe/Luxembourg', CH: 'Europe/Zurich' };

export type CommuneHit = { id: string; name: string; postalCode: string; countryCode: string; region: string; lat: number; lng: number; elevationM: number | null; timezone: string };

export async function searchCommunes(tx: Executor, query: string): Promise<CommuneHit[]> {
  const q = normalizeSearch(query);
  if (q.length < MIN_QUERY) return [];
  // Code postal (« 4000 », « L-1111 ») : correspondance de début ; sinon le nom, en début ou en trigrammes.
  const postal = /\d/.test(query) ? query.trim().toUpperCase().replace(/\s+/g, '') : null;
  const rows = await tx.execute<{ id: string; name: string; postal_code: string; country_code: string; region: string; lat: number; lng: number; elevation_m: number | null }>(sql`
    select id, name, postal_code, country_code, region, lat, lng, elevation_m from (
      select distinct on (country_code, name, region) id, name, postal_code, country_code, region, lat, lng, elevation_m, population,
        ${commune.searchText} like ${`${q}%`} as prefix, word_similarity(${q}, ${commune.searchText}) as score
      from ${commune}
      where ${postal ? sql`${commune.postalCode} like ${`${postal}%`}` : sql`(${commune.searchText} like ${`${q}%`} or ${q} <% ${commune.searchText})`}
      order by country_code, name, region, postal_code
    ) hits
    order by prefix desc, population desc, score desc, name
    limit ${COMMUNE_LIMIT}`);
  return [...rows].map((r) => ({
    id: r.id, name: r.name, postalCode: r.postal_code, countryCode: r.country_code, region: r.region, lat: Number(r.lat), lng: Number(r.lng),
    elevationM: r.elevation_m === null ? null : Number(r.elevation_m), timezone: COUNTRY_TIMEZONES[r.country_code] ?? 'Europe/Brussels',
  }));
}
