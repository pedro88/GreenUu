-- Cibles ticket / commentaire des pièces jointes (arc exclusif, SPEC §4.3).
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_ticket_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_comment_fk" FOREIGN KEY ("ticket_comment_id") REFERENCES "ticket_comment"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Historique des tickets : append-only (RG-TCK-02).
CREATE TRIGGER ticket_event_append_only BEFORE UPDATE OR DELETE ON ticket_event
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
