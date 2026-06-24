-- ============================================================
-- ترقية 20: دعم المساحات المضلّعة (الرسم بالخطوط)
-- ============================================================
-- تضيف عمود points لتخزين شكل المساحة كمضلّع (قائمة نقاط نِسب مئويّة
-- 0..100 نسبةً إلى مربّع الإحاطة pos_*). NULL = مستطيل عاديّ (السلوك القديم).
-- متوافقة رجعيّاً تماماً: المساحات الحاليّة تبقى مستطيلات (points = NULL).
-- لا تمسّ أي بيانات. آمنة لإعادة التشغيل (idempotent).
-- ============================================================

-- 1) العمود الجديد (لا يؤثّر على الصفوف الموجودة — تبقى NULL = مستطيل)
ALTER TABLE zones ADD COLUMN IF NOT EXISTS points JSONB DEFAULT NULL;

-- 2) update_zone: إضافة z_points (يُكتب مباشرةً بلا COALESCE، فيمكن تعيينه
--    إلى NULL لإرجاع المساحة مستطيلاً). الواجهة تُمرّر النقاط الحاليّة عند
--    التحريك/التكبير فقط، فلا تُمحى بالخطأ.
-- مهمّ: نحذف النسخة القديمة (11 معاملاً) أوّلاً — وإلا أبقاها Postgres كنسخة
-- ثانية (overload) فينشأ تعارض «could not choose best candidate» في PostgREST.
DROP FUNCTION IF EXISTS public.update_zone(uuid, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.update_zone(
  z_id UUID,
  z_name TEXT DEFAULT NULL,
  z_color TEXT DEFAULT NULL,
  z_width_cm NUMERIC DEFAULT NULL,
  z_height_cm NUMERIC DEFAULT NULL,
  z_depth_cm NUMERIC DEFAULT NULL,
  z_pos_top NUMERIC DEFAULT NULL,
  z_pos_left NUMERIC DEFAULT NULL,
  z_pos_right NUMERIC DEFAULT NULL,
  z_pos_width NUMERIC DEFAULT NULL,
  z_pos_height NUMERIC DEFAULT NULL,
  z_points JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  UPDATE zones SET
    name        = COALESCE(z_name, name),
    color       = COALESCE(z_color, color),
    width_cm    = COALESCE(z_width_cm, width_cm),
    height_cm   = COALESCE(z_height_cm, height_cm),
    depth_cm    = COALESCE(z_depth_cm, depth_cm),
    pos_top     = COALESCE(z_pos_top, pos_top),
    pos_left    = z_pos_left,    -- يمكن تعيينه إلى NULL
    pos_right   = z_pos_right,
    pos_width   = COALESCE(z_pos_width, pos_width),
    pos_height  = COALESCE(z_pos_height, pos_height),
    points      = z_points       -- يُكتب مباشرةً (NULL = مستطيل)
  WHERE id = z_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) get_warehouse_layout: إضافة 'points' إلى مخرجات كل مساحة (وإلا لن تصل
--    الواجهة). نفس جسم ترقية 19 مع حقل النقاط فقط.
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
                  'height_cm', s.height_cm, 'max_boxes', s.max_boxes) AS sh
                FROM shelves s WHERE s.zone_id = z.id AND s.deleted_at IS NULL
              ) AS sh_rows), '[]'::json)
          ) AS z_data
          FROM zones z WHERE z.warehouse_id = wh_id AND z.deleted_at IS NULL
        ) AS z_rows), '[]'::json))
  ) ELSE NULL END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

SELECT '✅ ترقية 20 (المساحات المضلّعة) جاهزة' AS status;
