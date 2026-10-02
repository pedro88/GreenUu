-- Horodatage de mise à jour de la nouvelle table (même trigger que les autres tables, migration 0001).
CREATE TRIGGER terrain_element_set_updated_at BEFORE UPDATE ON terrain_element
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Lot 7 (SPEC §9, PAGES.md §4) : la vue jardin devient la page d'un jardin. Avant ce lot, aucun écran ne permettait de
-- choisir la vue par défaut : la valeur « classic » des profils existants n'est donc pas un choix, elle est reprise.
UPDATE user_profile SET default_view = 'garden' WHERE default_view = 'classic';
