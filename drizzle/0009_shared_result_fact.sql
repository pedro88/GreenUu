-- Partage anonymisé des bilans (SPEC §11.3, §7.6) : HMAC annuel du jardin, aucune donnée identifiante.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
INSERT INTO reco_secret (year, secret)
VALUES (extract(year from now())::int, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (year) DO NOTHING;
--> statement-breakpoint
CREATE MATERIALIZED VIEW shared_result_fact AS
SELECT
  encode(hmac(r.id::text, k.secret, 'sha256'), 'hex') AS fact_id,
  encode(hmac(g.id::text, k.secret, 'sha256'), 'hex') AS garden_pseudo,
  g.geohash4,
  g.koppen,
  g.hardiness_zone,
  (round(g.altitude_m / 100.0) * 100)::int AS altitude_100,
  g.soil_type,
  round(g.soil_ph * 2) / 2 AS soil_ph_half,
  coalesce(
    z.environment,
    (SELECT a.environment FROM zone a
      WHERE a.garden_id = z.garden_id AND a.environment IS NOT NULL AND a.id::text = ANY (string_to_array(z.path, '/'))
      ORDER BY a.depth DESC LIMIT 1),
    (SELECT ge.environment FROM garden_environment ge WHERE ge.garden_id = g.id ORDER BY ge.position LIMIT 1)
  ) AS environment,
  coalesce((SELECT array_agg(p.code ORDER BY p.code) FROM practice_declaration pd JOIN practice p ON p.id = pd.practice_id
    WHERE pd.garden_id = g.id AND pd.zone_id IS NULL AND pd.season_id IS NULL AND NOT pd.excluded), '{}') AS practices,
  c.species_id,
  c.variety_id,
  c.method,
  (SELECT extract(doy FROM cs.actual_on)::smallint FROM culture_stage cs WHERE cs.culture_id = c.id AND cs.stage = 'sowing') AS sowing_doy,
  (SELECT extract(doy FROM cs.actual_on)::smallint FROM culture_stage cs WHERE cs.culture_id = c.id AND cs.stage = 'planting') AS planting_doy,
  r.success_pct,
  r.rating,
  r.quality,
  r.yield_kg_m2,
  coalesce((SELECT array_agg(pr.code ORDER BY pr.code) FROM culture_result_problem rp JOIN problem pr ON pr.id = rp.problem_id WHERE rp.result_id = r.id), '{}') AS problem_codes,
  s.year
FROM culture_result r
JOIN garden g ON g.id = r.garden_id
JOIN culture c ON c.id = r.culture_id
JOIN zone z ON z.id = c.zone_id
JOIN season s ON s.id = r.season_id
JOIN reco_secret k ON k.year = extract(year from now())::int
LEFT JOIN variety v ON v.id = c.variety_id
WHERE g.share_results
  AND g.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND r.completeness >= 60
  AND (c.variety_id IS NULL OR v.status = 'approved');
--> statement-breakpoint
CREATE UNIQUE INDEX shared_result_fact_id_uq ON shared_result_fact (fact_id);
--> statement-breakpoint
CREATE INDEX shared_result_fact_species_idx ON shared_result_fact (species_id, environment);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_set_updated_at', t);
  END LOOP;
END $$;
