import { doublePrecision, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_columns';

/*
 * Base de communes embarquée (SPEC §12.10, LOC, §17 Q-24) : GeoNames (CC BY 4.0), chargée par `pnpm db:reference`
 * depuis `src/features/location/data/communes.tsv.gz`. Données publiques, sans lien avec les jardins.
 */
export const commune = pgTable(
  'commune',
  {
    id: id(),
    countryCode: text('country_code').notNull(),
    postalCode: text('postal_code').notNull(),
    name: text('name').notNull(),
    region: text('region').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    population: integer('population').notNull().default(0),
    elevationM: integer('elevation_m'),
    /** Nom normalisé (minuscules, sans accents ni ponctuation), recherché en trigrammes. */
    searchText: text('search_text').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('commune_country_postal_name_uq').on(t.countryCode, t.postalCode, t.name),
    index('commune_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('commune_postal_idx').on(t.postalCode),
  ],
);
