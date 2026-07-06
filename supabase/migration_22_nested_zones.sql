-- ============================================================
-- ترقية 22: مساحات متداخلة — «مساحة داخل مساحة»
-- ============================================================
-- الدولاب الكبير = مساحة، وبداخله مساحات مستقلّة (parent_zone_id).
-- كل مساحة داخليّة كاملة الصلاحيات: أرفف، صناديق، تقسيم حرّ، وحتى
-- مساحات أعمق. الخريطة الرئيسية تعرض المساحات الجذريّة فقط.
-- آمنة لإعادة التشغيل.
-- ============================================================

ALTER TABLE zones ADD COLUMN IF NOT EXISTS parent_zone_id UUID REFERENCES zones(id) ON DELETE CASCADE;

-- add_zone: معامل جديد zone_parent — نحذف النسخة القديمة أوّلاً لتفادي
-- تعارض overload في PostgREST
DROP FUNCTION IF EXISTS public.add_zone(uuid, text, text, text, numeric, numeric, numeric, integer);

CREATE OR REPLACE FUNCTION public.add_zone(
  wh_id UUID, zone_letter TEXT, zone_name TEXT, zone_color TEXT DEFAULT '#185FA5',
  zone_width_cm NUMERIC DEFAULT 200, zone_height_cm NUMERIC DEFAULT 230,
  zone_depth_cm NUMERIC DEFAULT 65, shelves_count INTEGER DEFAULT 3,
  zone_parent UUID DEFAULT NULL)
RETURNS UUID AS $$
DECLARE new_zone_id UUID; i INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  INSERT INTO zones (warehouse_id, letter, name, color, width_cm, height_cm, depth_cm, pos_top, pos_right, pos_width, pos_height, display_order, parent_zone_id)
  VALUES (wh_id, UPPER(zone_letter), zone_name, zone_color, zone_width_cm, zone_height_cm, zone_depth_cm,
    6, 4, 18, 42, (SELECT COALESCE(MAX(display_order),0)+1 FROM zones WHERE warehouse_id = wh_id), zone_parent)
  RETURNING id INTO new_zone_id;
  FOR i IN 1..shelves_count LOOP
    INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes) VALUES (new_zone_id, i, 70, 4);
  END LOOP;
  RETURN new_zone_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_warehouse_layout: إضافة parent_zone_id (نفس نسخة ترقية 21 + حقل واحد)
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
            'points', z.points, 'parent_zone_id', z.parent_zone_id,
            'shelves', COALESCE((
              SELECT json_agg(sh ORDER BY (sh->>'shelf_index')::int) FROM (
                SELECT json_build_object('id', s.id, 'shelf_index', s.shelf_index, 'label', s.label,
                  'height_cm', s.height_cm, 'max_boxes', s.max_boxes, 'pos', s.pos) AS sh
                FROM shelves s WHERE s.zone_id = z.id AND s.deleted_at IS NULL
              ) AS sh_rows), '[]'::json)
          ) AS z_data
          FROM zones z WHERE z.warehouse_id = wh_id AND z.deleted_at IS NULL
        ) AS z_rows), '[]'::json))
  ) ELSE NULL END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

SELECT '✅ ترقية 22 (المساحات المتداخلة) جاهزة' AS status;
