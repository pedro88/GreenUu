-- updated_at maintenu par trigger (SPEC §4.1)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_set_updated_at', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Tables append-only (SPEC §4.3)
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % est append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Seule exception : marquer un événement comme distribué (dispatched_at).
CREATE OR REPLACE FUNCTION domain_event_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'domain_event est append-only' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'dispatched_at') IS DISTINCT FROM (to_jsonb(OLD) - 'dispatched_at') THEN
    RAISE EXCEPTION 'domain_event est append-only (seul dispatched_at peut changer)' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER domain_event_append_only BEFORE UPDATE OR DELETE ON domain_event
  FOR EACH ROW EXECUTE FUNCTION domain_event_guard();
--> statement-breakpoint
-- Types de zone de base (SPEC §4.4) — `label` = clé i18n zoneTypes.<code>
INSERT INTO zone_type (garden_id, code, label, can_host_cultures, has_interior_default, default_environment, sort_order) VALUES
  (NULL, 'plot',           'plot',           true,  false, NULL,          10),
  (NULL, 'bed',            'bed',            true,  false, NULL,          20),
  (NULL, 'row',            'row',            true,  false, NULL,          30),
  (NULL, 'square_bed',     'square_bed',     true,  false, NULL,          40),
  (NULL, 'container',      'container',      true,  false, NULL,          50),
  (NULL, 'pot',            'pot',            true,  false, NULL,          60),
  (NULL, 'greenhouse',     'greenhouse',     true,  true,  'greenhouse',  70),
  (NULL, 'tunnel',         'tunnel',         true,  true,  'tunnel',      80),
  (NULL, 'bench',          'bench',          true,  false, NULL,          90),
  (NULL, 'nursery',        'nursery',        true,  false, NULL,         100),
  (NULL, 'seed_tray',      'seed_tray',      true,  false, NULL,         110),
  (NULL, 'cell',           'cell',           true,  false, NULL,         120),
  (NULL, 'compost',        'compost',        false, false, NULL,         130),
  (NULL, 'orchard',        'orchard',        true,  false, NULL,         140),
  (NULL, 'fruit_hedge',    'fruit_hedge',    true,  false, NULL,         150),
  (NULL, 'flower_bed',     'flower_bed',     true,  false, NULL,         160),
  (NULL, 'meadow',         'meadow',         true,  false, NULL,         170),
  (NULL, 'path',           'path',           false, false, NULL,         180);
--> statement-breakpoint
INSERT INTO practice (code, category, sort_order) VALUES
  ('organic', 'method', 10), ('permaculture', 'method', 20), ('no_dig', 'soil', 30), ('living_soil', 'soil', 40),
  ('mulching', 'soil', 50), ('green_manure', 'soil', 60), ('irrigation_drip', 'irrigation', 70),
  ('irrigation_sprinkler', 'irrigation', 80), ('irrigation_manual', 'irrigation', 90), ('irrigation_none', 'irrigation', 100),
  ('crop_rotation', 'method', 110), ('companion_planting', 'method', 120), ('biodiversity_insect_hotel', 'biodiversity', 130),
  ('biodiversity_pond', 'biodiversity', 140), ('biodiversity_hedge', 'biodiversity', 150), ('biodiversity_birdhouse', 'biodiversity', 160),
  ('seed_saving', 'method', 170), ('composting', 'soil', 180), ('no_pesticides', 'method', 190);
