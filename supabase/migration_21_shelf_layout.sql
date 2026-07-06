-- ============================================================
-- ترقية 21: التقسيم الحرّ داخل أماكن التخزين
-- ============================================================
-- كل رفّ (قسم) يحمل موضعاً حرّاً داخل واجهة المكان: pos JSONB
-- {top,left,width,height,kind} — نِسب مئويّة 0..100 + نوع القسم
-- (drawer درج / shelf رفّ / cabinet خزانة كبيرة).
-- NULL = التوزيع القديم (صفوف متساوية). آمنة لإعادة التشغيل.
-- ============================================================

ALTER TABLE shelves ADD COLUMN IF NOT EXISTS pos JSONB DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.update_shelf_pos(s_id UUID, s_pos JSONB DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  UPDATE shelves SET pos = s_pos WHERE id = s_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_warehouse_layout: إضافة 'pos' لمخرجات الأرفف (نفس نسخة ترقية 20 + حقل واحد)
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
            'points', z.points,
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

SELECT '✅ ترقية 21 (التقسيم الحرّ داخل الأماكن) جاهزة' AS status;
