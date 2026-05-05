-- ============================================
-- ترقية رقم 16: تكديس الصناديق + التموضع الحرّ للأغراض خارج المساحات
-- ============================================
-- الأهداف:
--   (أ) السماح بتكديس صندوقين أو أكثر فوق بعضهما في نفس موقع الرف
--   (ب) السماح بوضع الأغراض خارج المساحات في موقع محدّد على خريطة المستودع
--       بدلاً من قائمة مسطّحة تحت الخريطة
-- ============================================

-- (1) تكديس الصناديق: stack_index داخل الموقع نفسه
--     الصندوق الأوّل (السفلي) يأخذ stack_index = 0
--     الصندوق المُكدَّس فوقه يأخذ stack_index = 1، وهكذا
--     رمز الصندوق:
--       - stack 0: A-1-1 (كما هو)
--       - stack 1: A-1-1.2
--       - stack 2: A-1-1.3
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS stack_index INTEGER DEFAULT 0;

-- (2) إحداثيّات حرّة لكل غرض خارج المساحات (نسبة من 0 إلى 100)
--     pos_top  = % من أعلى خريطة المستودع
--     pos_left = % من يسار خريطة المستودع
--     width_pct, height_pct = حجم المربّع
ALTER TABLE items ADD COLUMN IF NOT EXISTS pos_top NUMERIC;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pos_left NUMERIC;
ALTER TABLE items ADD COLUMN IF NOT EXISTS width_pct NUMERIC DEFAULT 10;
ALTER TABLE items ADD COLUMN IF NOT EXISTS height_pct NUMERIC DEFAULT 10;

-- (3) ترحيل: ضع الأغراض الموجودة خارج المساحات في وسط الممرّ افتراضياً
--     سيظهر بعضها فوق بعض في البداية، يستطيع المستخدم سحبها للمواقع الصحيحة
UPDATE items
SET pos_top = 40, pos_left = 40
WHERE warehouse_id IS NOT NULL
  AND box_id IS NULL
  AND zone_id IS NULL
  AND pos_top IS NULL;

-- (4) دالّة مساعدة: إضافة صندوق مُكدَّس فوق صندوق موجود
CREATE OR REPLACE FUNCTION public.add_stacked_box(
  p_below_box_id UUID,
  b_description TEXT DEFAULT '',
  b_width_cm NUMERIC DEFAULT 50,
  b_height_cm NUMERIC DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
  src_shelf_id UUID;
  src_box_index INTEGER;
  src_stack_index INTEGER;
  z_letter TEXT;
  s_index INTEGER;
  wh_id UUID;
  new_stack INTEGER;
  new_box_id UUID;
  new_code TEXT;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;

  -- جلب بيانات الصندوق الذي سنُكدِّس فوقه
  SELECT b.shelf_id, b.box_index, b.stack_index, z.letter, s.shelf_index, z.warehouse_id
    INTO src_shelf_id, src_box_index, src_stack_index, z_letter, s_index, wh_id
  FROM boxes b
  JOIN shelves s ON s.id = b.shelf_id
  JOIN zones z ON z.id = s.zone_id
  WHERE b.id = p_below_box_id AND b.deleted_at IS NULL;

  IF src_shelf_id IS NULL THEN
    RAISE EXCEPTION 'الصندوق السفلي غير موجود';
  END IF;

  -- أعلى stack موجود حالياً في هذا الموقع + 1
  SELECT COALESCE(MAX(stack_index), -1) + 1 INTO new_stack
  FROM boxes
  WHERE shelf_id = src_shelf_id
    AND box_index = src_box_index
    AND deleted_at IS NULL;

  -- توليد الرمز: stack 0 = الرمز الأساسي، 1+ = إضافة .N
  IF new_stack = 0 THEN
    new_code := z_letter || '-' || s_index || '-' || src_box_index;
  ELSE
    new_code := z_letter || '-' || s_index || '-' || src_box_index || '.' || (new_stack + 1);
  END IF;

  INSERT INTO boxes (
    warehouse_id, shelf_id, code, description,
    box_index, stack_index, width_cm, height_cm
  )
  VALUES (
    wh_id, src_shelf_id, new_code, b_description,
    src_box_index, new_stack, b_width_cm, b_height_cm
  )
  RETURNING id INTO new_box_id;

  RETURN new_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ ترقية 16 (التكديس والتموضع الحرّ) جاهزة' AS status;
