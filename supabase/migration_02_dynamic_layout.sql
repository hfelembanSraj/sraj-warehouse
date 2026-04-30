-- ============================================
-- ترقية رقم 02: التخطيط الديناميكي للمستودعات
-- نفّذ هذا السكربت في Supabase SQL Editor دفعة واحدة
-- ============================================

-- ============================================
-- 🏗 الجداول الجديدة: zones و shelves
-- ============================================

-- جدول المساحات (zones) — كان معرّفاً في الكود فقط
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  letter TEXT NOT NULL,                          -- A, B, C, D, E…
  name TEXT NOT NULL,                            -- "عُدّة الفعاليات"
  color TEXT DEFAULT '#185FA5',                  -- لون العرض
  width_cm NUMERIC DEFAULT 200,                  -- عرض المساحة سم
  height_cm NUMERIC DEFAULT 230,                 -- ارتفاع المساحة سم
  depth_cm NUMERIC DEFAULT 65,                   -- عمق المساحة سم
  -- موقع العرض على الخريطة (نسبة مئوية من المستودع)
  pos_top NUMERIC DEFAULT 6,
  pos_left NUMERIC DEFAULT NULL,
  pos_right NUMERIC DEFAULT 4,
  pos_width NUMERIC DEFAULT 18,
  pos_height NUMERIC DEFAULT 42,
  display_order INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id, letter)
);

-- جدول الأرفف
CREATE TABLE IF NOT EXISTS shelves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  shelf_index INTEGER NOT NULL,                  -- 1, 2, 3…
  label TEXT,                                    -- اسم اختياري للرف
  height_cm NUMERIC DEFAULT 70,                  -- ارتفاع الرف سم
  max_boxes INTEGER DEFAULT 4,                   -- أقصى عدد صناديق
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zone_id, shelf_index)
);

-- إضافة ربط الصناديق بالرفّ
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS shelf_id UUID REFERENCES shelves(id) ON DELETE SET NULL;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS box_index INTEGER DEFAULT 0;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS width_cm NUMERIC DEFAULT 50;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS height_cm NUMERIC DEFAULT 65;

-- ============================================
-- 🔄 ترحيل البيانات الموجودة للهيكل الجديد
-- ============================================

-- 1. إنشاء المساحات الافتراضية للمستودع الرئيسي
INSERT INTO zones (warehouse_id, letter, name, color, pos_top, pos_left, pos_right, pos_width, pos_height, display_order)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'A', 'عُدّة الفعاليات',  '#D85A30', 6, NULL, 4,    18, 42, 1),
  ('11111111-1111-1111-1111-111111111111', 'B', 'العُدّة التقنية',  '#185FA5', 52, NULL, 4,   18, 42, 2),
  ('11111111-1111-1111-1111-111111111111', 'C', 'تجهيزات ميدانية', '#27500A', 6, 4, NULL,    18, 42, 3),
  ('11111111-1111-1111-1111-111111111111', 'D', 'مواد مساندة',     '#633806', 52, 4, NULL,   18, 42, 4)
ON CONFLICT (warehouse_id, letter) DO NOTHING;

-- 2. إنشاء 3 أرفف لكل مساحة
INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes)
SELECT z.id, s.idx, 70, 4
FROM zones z
CROSS JOIN (VALUES (1), (2), (3)) AS s(idx)
ON CONFLICT (zone_id, shelf_index) DO NOTHING;

-- 3. ربط الصناديق الموجودة بالرفّ المناسب من خلال تحليل الرمز
UPDATE boxes b
SET shelf_id = s.id,
    box_index = COALESCE(NULLIF(SPLIT_PART(b.code, '-', 3), '')::INT, 0)
FROM zones z, shelves s
WHERE z.warehouse_id = b.warehouse_id
  AND z.letter = SPLIT_PART(b.code, '-', 1)
  AND s.zone_id = z.id
  AND s.shelf_index = COALESCE(NULLIF(SPLIT_PART(b.code, '-', 2), '')::INT, 0)
  AND b.shelf_id IS NULL;

-- ============================================
-- 🛡 سياسات RLS — قراءة للجميع، تعديل للمؤسّس فقط
-- ============================================
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read zones" ON zones;
CREATE POLICY "auth read zones" ON zones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "founder all zones" ON zones;
CREATE POLICY "founder all zones" ON zones FOR ALL TO authenticated
  USING (public.is_founder(auth.uid()))
  WITH CHECK (public.is_founder(auth.uid()));

DROP POLICY IF EXISTS "auth read shelves" ON shelves;
CREATE POLICY "auth read shelves" ON shelves FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "founder all shelves" ON shelves;
CREATE POLICY "founder all shelves" ON shelves FOR ALL TO authenticated
  USING (public.is_founder(auth.uid()))
  WITH CHECK (public.is_founder(auth.uid()));

-- ============================================
-- 🚀 دوال المؤسّس (RPC) — لإدارة المستودعات والمساحات والأرفف
-- ============================================

-- إنشاء مستودع جديد كاملاً، وإلحاق المؤسّس بصلاحيات كاملة فيه
CREATE OR REPLACE FUNCTION public.create_warehouse(
  wh_name TEXT,
  wh_description TEXT DEFAULT '',
  wh_width_m NUMERIC DEFAULT 4,
  wh_depth_m NUMERIC DEFAULT 4,
  wh_height_m NUMERIC DEFAULT 2.3
)
RETURNS UUID AS $$
DECLARE
  caller_id UUID := auth.uid();
  new_wh_id UUID;
BEGIN
  IF NOT public.is_founder(caller_id) THEN
    RAISE EXCEPTION 'محظور: إنشاء المستودعات للمؤسّس فقط';
  END IF;

  INSERT INTO warehouses (name, description, width_m, depth_m, height_m)
  VALUES (wh_name, wh_description, wh_width_m, wh_depth_m, wh_height_m)
  RETURNING id INTO new_wh_id;

  -- إلحاق المؤسّس تلقائياً كمدير بكل الصلاحيات
  INSERT INTO user_warehouses (user_id, warehouse_id, role, approved, permissions)
  VALUES (caller_id, new_wh_id, 'whmanager', true,
    '{"view":true,"checkout":true,"return":true,"add":true,"edit":true,"delete":true}'::jsonb)
  ON CONFLICT (user_id, warehouse_id) DO NOTHING;

  RETURN new_wh_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إعادة تسمية مستودع
CREATE OR REPLACE FUNCTION public.rename_warehouse(wh_id UUID, new_name TEXT, new_description TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  UPDATE warehouses
    SET name = COALESCE(new_name, name),
        description = COALESCE(new_description, description)
    WHERE id = wh_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- حذف مستودع كامل (مع كل ما فيه)
CREATE OR REPLACE FUNCTION public.delete_warehouse(wh_id UUID)
RETURNS VOID AS $$
DECLARE
  wh_count INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  SELECT COUNT(*) INTO wh_count FROM warehouses;
  IF wh_count <= 1 THEN
    RAISE EXCEPTION 'لا يمكن حذف آخر مستودع — يجب أن يكون هناك مستودع واحد على الأقل';
  END IF;
  DELETE FROM warehouses WHERE id = wh_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إضافة مساحة جديدة
CREATE OR REPLACE FUNCTION public.add_zone(
  wh_id UUID,
  zone_letter TEXT,
  zone_name TEXT,
  zone_color TEXT DEFAULT '#185FA5',
  zone_width_cm NUMERIC DEFAULT 200,
  zone_height_cm NUMERIC DEFAULT 230,
  zone_depth_cm NUMERIC DEFAULT 65,
  shelves_count INTEGER DEFAULT 3
)
RETURNS UUID AS $$
DECLARE
  new_zone_id UUID;
  i INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  INSERT INTO zones (warehouse_id, letter, name, color, width_cm, height_cm, depth_cm,
                     pos_top, pos_right, pos_width, pos_height, display_order)
  VALUES (wh_id, UPPER(zone_letter), zone_name, zone_color, zone_width_cm, zone_height_cm, zone_depth_cm,
          6, 4, 18, 42,
          (SELECT COALESCE(MAX(display_order), 0) + 1 FROM zones WHERE warehouse_id = wh_id))
  RETURNING id INTO new_zone_id;

  -- إنشاء الأرفف
  FOR i IN 1..shelves_count LOOP
    INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes)
    VALUES (new_zone_id, i, 70, 4);
  END LOOP;

  RETURN new_zone_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تعديل مساحة
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
  z_pos_height NUMERIC DEFAULT NULL
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
    pos_height  = COALESCE(z_pos_height, pos_height)
  WHERE id = z_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- حذف مساحة (مع أرففها وصناديقها — soft delete)
CREATE OR REPLACE FUNCTION public.delete_zone(z_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  DELETE FROM zones WHERE id = z_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إضافة رف
CREATE OR REPLACE FUNCTION public.add_shelf(
  z_id UUID,
  s_height_cm NUMERIC DEFAULT 70,
  s_max_boxes INTEGER DEFAULT 4
)
RETURNS UUID AS $$
DECLARE
  new_shelf_id UUID;
  next_index INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  SELECT COALESCE(MAX(shelf_index), 0) + 1 INTO next_index FROM shelves WHERE zone_id = z_id;
  INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes)
  VALUES (z_id, next_index, s_height_cm, s_max_boxes)
  RETURNING id INTO new_shelf_id;
  RETURN new_shelf_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تعديل رف
CREATE OR REPLACE FUNCTION public.update_shelf(
  s_id UUID,
  s_height_cm NUMERIC DEFAULT NULL,
  s_max_boxes INTEGER DEFAULT NULL,
  s_label TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  UPDATE shelves SET
    height_cm = COALESCE(s_height_cm, height_cm),
    max_boxes = COALESCE(s_max_boxes, max_boxes),
    label     = COALESCE(s_label, label)
  WHERE id = s_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- حذف رف
CREATE OR REPLACE FUNCTION public.delete_shelf(s_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;
  DELETE FROM shelves WHERE id = s_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 📦 RPC للصناديق المرتبطة بالأرفف (مفيد للبناء البصري)
-- ============================================

-- إضافة صندوق مرتبط برف
CREATE OR REPLACE FUNCTION public.add_box_to_shelf(
  s_id UUID,
  b_description TEXT DEFAULT '',
  b_width_cm NUMERIC DEFAULT 50,
  b_height_cm NUMERIC DEFAULT 65
)
RETURNS UUID AS $$
DECLARE
  z_letter TEXT;
  s_index INTEGER;
  next_box INTEGER;
  wh_id UUID;
  new_box_id UUID;
  new_code TEXT;
BEGIN
  -- جلب البيانات اللازمة لتوليد رمز الصندوق
  SELECT z.letter, s.shelf_index, z.warehouse_id INTO z_letter, s_index, wh_id
  FROM shelves s JOIN zones z ON z.id = s.zone_id
  WHERE s.id = s_id;

  IF z_letter IS NULL THEN
    RAISE EXCEPTION 'الرف غير موجود';
  END IF;

  -- التحقّق من حدّ السماح في الرف
  IF (SELECT COUNT(*) FROM boxes WHERE shelf_id = s_id) >=
     (SELECT max_boxes FROM shelves WHERE id = s_id) THEN
    RAISE EXCEPTION 'الرف ممتلئ بالصناديق — قم بزيادة الحدّ الأقصى أو احذف صندوقاً أوّلاً';
  END IF;

  SELECT COALESCE(MAX(box_index), 0) + 1 INTO next_box FROM boxes WHERE shelf_id = s_id;
  new_code := z_letter || '-' || s_index || '-' || next_box;

  INSERT INTO boxes (warehouse_id, shelf_id, code, description, box_index, width_cm, height_cm)
  VALUES (wh_id, s_id, new_code, b_description, next_box, b_width_cm, b_height_cm)
  RETURNING id INTO new_box_id;

  RETURN new_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 🔍 دالة جلب التخطيط الكامل لمستودع (مفيد للواجهة)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_warehouse_layout(wh_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'warehouse', (SELECT row_to_json(w) FROM warehouses w WHERE w.id = wh_id),
    'zones', COALESCE((
      SELECT json_agg(z_data ORDER BY (z_data->>'display_order')::int) FROM (
        SELECT json_build_object(
          'id', z.id,
          'letter', z.letter,
          'name', z.name,
          'color', z.color,
          'width_cm', z.width_cm,
          'height_cm', z.height_cm,
          'depth_cm', z.depth_cm,
          'pos_top', z.pos_top,
          'pos_left', z.pos_left,
          'pos_right', z.pos_right,
          'pos_width', z.pos_width,
          'pos_height', z.pos_height,
          'display_order', z.display_order,
          'shelves', COALESCE((
            SELECT json_agg(sh ORDER BY (sh->>'shelf_index')::int) FROM (
              SELECT json_build_object(
                'id', s.id,
                'shelf_index', s.shelf_index,
                'label', s.label,
                'height_cm', s.height_cm,
                'max_boxes', s.max_boxes
              ) AS sh
              FROM shelves s
              WHERE s.zone_id = z.id AND s.deleted_at IS NULL
            ) AS sh_rows
          ), '[]'::json)
        ) AS z_data
        FROM zones z
        WHERE z.warehouse_id = wh_id AND z.deleted_at IS NULL
      ) AS z_rows
    ), '[]'::json)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================
SELECT '✅ الترقية 02 (التخطيط الديناميكي) نُفّذت بنجاح' AS status;
