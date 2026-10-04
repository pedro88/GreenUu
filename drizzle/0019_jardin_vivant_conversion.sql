-- Horodatage de mise à jour des nouvelles tables (même trigger que les autres tables, migration 0001).
CREATE TRIGGER terrain_cell_set_updated_at BEFORE UPDATE ON terrain_cell
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER plan_snapshot_set_updated_at BEFORE UPDATE ON plan_snapshot
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Aménagements ponctuels (SPEC §4.2.6, lot 9) : objets du catalogue de déco, avec les identifiants stables du chargement
-- du référentiel (`decorItemRefId`). Le référentiel les met ensuite à jour ; ils doivent exister pour la conversion.
INSERT INTO decor_item (id, code, sprite_key, width_tiles, height_tiles, unlock_condition, sort_order) VALUES
  ('5d89df6e-80f0-512c-a24d-dbf89da4f17c', 'water_point', 'structures/robinet', 1, 1, '{"v":1,"kind":"none"}', 200),
  ('950da93d-ea18-5009-a959-5007c79f5c0a', 'rain_barrel', 'structures/recuperateur-eau', 1, 1, '{"v":1,"kind":"none"}', 201),
  ('8f63ef7f-6f8d-5873-9e88-4f4996e7d424', 'existing_tree', 'cultures/pommier-4-feuillage', 2, 2, '{"v":1,"kind":"none"}', 202),
  ('fe90476f-025f-5ce4-9415-db00f1fa9cb6', 'gate', 'structures/portail-ferme', 1, 1, '{"v":1,"kind":"none"}', 203)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Conversion de l'ancien terrain en rectangles (PNT-03) : les surfaces et les linéaires deviennent les cases qu'ils
-- couvrent, à l'échelle du jardin ; les ponctuels, un objet posé au centre du rectangle (le pied de l'objet est au bas
-- de son emprise). Idempotente : une case déjà peinte est gardée, un objet converti reprend l'identifiant de l'élément.
-- `terrain_element` n'est ni modifiée ni supprimée.
CREATE FUNCTION greenu_convert_terrain_elements() RETURNS void LANGUAGE sql AS $$
  INSERT INTO terrain_cell (garden_id, scene_zone_id, x, y, kind)
  SELECT e.garden_id, e.scene_zone_id, gx, gy, e.kind
  FROM terrain_element e
  JOIN garden g ON g.id = e.garden_id
  CROSS JOIN LATERAL generate_series(
    floor((e.geometry->>'x')::numeric / g.tile_size_cm)::int,
    ceil(((e.geometry->>'x')::numeric + (e.geometry->>'w')::numeric) / g.tile_size_cm)::int - 1) gx
  CROSS JOIN LATERAL generate_series(
    floor((e.geometry->>'y')::numeric / g.tile_size_cm)::int,
    ceil(((e.geometry->>'y')::numeric + (e.geometry->>'h')::numeric) / g.tile_size_cm)::int - 1) gy
  WHERE e.kind IN ('path', 'gravel_path', 'stepping_stones', 'hedge', 'fence') AND gx BETWEEN 0 AND 10000 AND gy BETWEEN 0 AND 10000
  ON CONFLICT DO NOTHING;

  INSERT INTO decor_placement (id, garden_id, scene_zone_id, decor_item_id, x_cm, y_cm)
  SELECT e.id, e.garden_id, e.scene_zone_id, i.id,
    round((e.geometry->>'x')::numeric + (e.geometry->>'w')::numeric / 2)::int,
    round((e.geometry->>'y')::numeric + (e.geometry->>'h')::numeric / 2 + i.height_tiles * g.tile_size_cm / 2.0)::int
  FROM terrain_element e
  JOIN garden g ON g.id = e.garden_id
  JOIN decor_item i ON i.code = e.kind
  WHERE e.kind IN ('water_point', 'rain_barrel', 'existing_tree', 'gate')
  ON CONFLICT DO NOTHING;
$$;
--> statement-breakpoint
SELECT greenu_convert_terrain_elements();
