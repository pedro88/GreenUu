-- Journal d'XP append-only (SPEC §8.1, XP-15) : ni modification ni suppression, les corrections sont des lignes.
CREATE TRIGGER xp_ledger_append_only BEFORE UPDATE OR DELETE ON xp_ledger_entry
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
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
