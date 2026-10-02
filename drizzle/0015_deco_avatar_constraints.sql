-- Horodatage de mise à jour des nouvelles tables (même trigger que les autres tables, migration 0001).
CREATE TRIGGER decor_item_set_updated_at BEFORE UPDATE ON decor_item
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER decor_placement_set_updated_at BEFORE UPDATE ON decor_placement
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER avatar_item_set_updated_at BEFORE UPDATE ON avatar_item
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER palette_set_updated_at BEFORE UPDATE ON palette
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER user_avatar_set_updated_at BEFORE UPDATE ON user_avatar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Une rampe de palette compte exactement 4 couleurs (SPEC §10.2).
ALTER TABLE palette ADD CONSTRAINT palette_ramp_ck CHECK (jsonb_typeof(ramp) = 'array' AND jsonb_array_length(ramp) = 4);
