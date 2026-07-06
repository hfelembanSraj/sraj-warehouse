-- ============================================================
-- ترقية 23: صور فوق الأشكال — للمساحات/العناصر (zones) والأقسام (shelves)
-- ============================================================
ALTER TABLE zones   ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;
ALTER TABLE shelves ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.set_zone_photo(z_id UUID, z_photo TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  UPDATE zones SET photo_url = z_photo WHERE id = z_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_shelf_photo(s_id UUID, s_photo TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  UPDATE shelves SET photo_url = s_photo WHERE id = s_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_warehouse_layout: إضافة photo_url للمساحات والأقسام (نسخة 22 + حقلان)
CREATE OR REPLACE FUNCTION public.get_warehouse_layout(wh_id UUID)
RETURNS JSON AS $$
  SELECT CASE WHEN public.user_can_access_warehouse(wh_id) THEN (
    SELECT json_build_object(
      'warehouse', (SELECT row_to_json(w) FROM warehouses w WHERE w.id = wh_id),
      'zones', COALESCE((
        SELECT json_agg(z_data ORDER BY (z_data->>'display_order')::int) FROM (
          SELECT json_build_object(
            'id', z.id, 'letter', z.letter, 'name', z.name, 'color', z.color,
            'width_cm', z.width_cm, 'height_cm', z.height_cm, 'depth_cm', z.depth_cm,
            'pos_top', z.pos_top, 'pos_left', z.pos_left, 'pos_right', z.pos_right,
            'pos_width', z.pos_width, 'pos_height', z.pos_height, 'display_order', z.display_order,
            'points', z.points, 'parent_zone_id', z.parent_zone_id, 'photo_url', z.photo_url,
            'shelves', COALESCE((
              SELECT json_agg(sh ORDER BY (sh->>'shelf_index')::int) FROM (
                SELECT json_build_object('id', s.id, 'shelf_index', s.shelf_index, 'label', s.label,
                  'height_cm', s.height_cm, 'max_boxes', s.max_boxes, 'pos', s.pos, 'photo_url', s.photo_url) AS sh
                FROM shelves s WHERE s.zone_id = z.id AND s.deleted_at IS NULL
              ) AS sh_rows), '[]'::json)
          ) AS z_data
          FROM zones z WHERE z.warehouse_id = wh_id AND z.deleted_at IS NULL
        ) AS z_rows), '[]'::json))
  ) ELSE NULL END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

SELECT '✅ ترقية 23 (صور الأشكال) جاهزة' AS status;
