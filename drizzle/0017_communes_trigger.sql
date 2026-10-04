-- Horodatage de mise à jour de la table des communes (même trigger que les autres tables, migration 0001).
CREATE TRIGGER commune_set_updated_at BEFORE UPDATE ON commune
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
