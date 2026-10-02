-- Versions de guide immuables (RG-GUI-02, GUI-03) ; la suppression passe par celle du guide (cascade).
CREATE OR REPLACE FUNCTION forbid_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% est immuable', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;
--> statement-breakpoint
CREATE TRIGGER guide_version_immutable BEFORE UPDATE ON guide_version
  FOR EACH ROW EXECUTE FUNCTION forbid_update();
--> statement-breakpoint
-- On ne vote pas pour son propre tip (RG-TIP-02) : vérifié aussi par le service.
CREATE OR REPLACE FUNCTION tip_vote_not_author() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tip WHERE id = NEW.tip_id AND author_id = NEW.user_id) THEN
    RAISE EXCEPTION 'vote sur son propre tip' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER tip_vote_not_author BEFORE INSERT OR UPDATE ON tip_vote
  FOR EACH ROW EXECUTE FUNCTION tip_vote_not_author();
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
