-- ============================================================
-- ترقية 19: عزل قراءة المساحات والأرفف حسب عضوية المستودع
-- ============================================================
-- المشكلة: ترقية 18 عزلت الصناديق/الأصناف/الإخراجات... لكنها أبقت
--   سياسات قراءة zones/shelves مفتوحة "USING (true)" (من ترقية 02)،
--   فأي مستخدم مُسجَّل كان يرى بنية كل المستودعات (أسماء المساحات،
--   أبعادها، الأرفف). هذه الترقية تقصر القراءة على أعضاء المستودع،
--   وتُحكِم دالّة get_warehouse_layout كذلك. المؤسّس يتجاوز كل القيود.
-- آمن لإعادة التشغيل (idempotent).
-- ============================================================

-- المساحات: القراءة لأعضاء المستودع فقط (المؤسّس يتجاوز)
DROP POLICY IF EXISTS "auth read zones" ON zones;
DROP POLICY IF EXISTS "wh members read zones" ON zones;
CREATE POLICY "wh members read zones" ON zones FOR SELECT TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id));

-- الأرفف: القراءة عبر مستودع المساحة الأمّ
DROP POLICY IF EXISTS "auth read shelves" ON shelves;
DROP POLICY IF EXISTS "wh members read shelves" ON shelves;
CREATE POLICY "wh members read shelves" ON shelves FOR SELECT TO authenticated
  USING (public.user_can_access_warehouse(
           (SELECT z.warehouse_id FROM zones z WHERE z.id = shelves.zone_id)));

-- إحكام دالّة التخطيط: لا تُرجِع تخطيط مستودع لا يملك المستخدم الوصول إليه
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
            'shelves', COALESCE((
              SELECT json_agg(sh ORDER BY (sh->>'shelf_index')::int) FROM (
                SELECT json_build_object('id', s.id, 'shelf_index', s.shelf_index, 'label', s.label,
                  'height_cm', s.height_cm, 'max_boxes', s.max_boxes) AS sh
                FROM shelves s WHERE s.zone_id = z.id AND s.deleted_at IS NULL
              ) AS sh_rows), '[]'::json)
          ) AS z_data
          FROM zones z WHERE z.warehouse_id = wh_id AND z.deleted_at IS NULL
        ) AS z_rows), '[]'::json))
  ) ELSE NULL END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

SELECT '✅ ترقية 19 (عزل قراءة المساحات والأرفف) جاهزة' AS status;
