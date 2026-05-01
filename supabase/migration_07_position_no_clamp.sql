-- ============================================
-- ترقية رقم 07: السماح بإضافة صندوق في أيّ موقع شاغر دون تقصير تلقائي
-- المشكلة: في النسخة السابقة، إذا اختار المستخدم موقعاً > max_box_index + 1،
--          كانت الدالّة تُقصِّره تلقائياً وتضع الصندوق في أوّل موقع متاح
--          (الموقع 1 إذا الرف فارغ). نتيجة: المستخدم يختار "رابع" فيظهر "أوّل".
-- الحلّ:    إذا كان الموقع شاغراً → أدخل هناك مباشرة دون إزاحة.
--          إذا كان مشغولاً → أزِح كما في السابق.
-- ============================================

CREATE OR REPLACE FUNCTION public.add_box_at_position(
  s_id UUID,
  p_position INTEGER,
  b_description TEXT DEFAULT '',
  b_width_cm NUMERIC DEFAULT 50,
  b_height_cm NUMERIC DEFAULT 65
)
RETURNS UUID AS $$
DECLARE
  z_letter TEXT;
  s_index INTEGER;
  wh_id UUID;
  new_box_id UUID;
  new_code TEXT;
  r RECORD;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;

  -- جلب بيانات الرف لتوليد الرمز
  SELECT z.letter, s.shelf_index, z.warehouse_id INTO z_letter, s_index, wh_id
  FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = s_id;
  IF z_letter IS NULL THEN
    RAISE EXCEPTION 'الرف غير موجود';
  END IF;

  -- اضبط الموقع: لا أقلّ من 1
  IF p_position < 1 THEN p_position := 1; END IF;

  -- إن كان الموقع المطلوب مشغولاً، أزِح كل الصناديق المُساوية والأكبر للأمام بترتيب عكسي
  IF EXISTS (SELECT 1 FROM boxes WHERE shelf_id = s_id AND box_index = p_position AND deleted_at IS NULL) THEN
    FOR r IN SELECT id, box_index FROM boxes
      WHERE shelf_id = s_id AND box_index >= p_position AND deleted_at IS NULL
      ORDER BY box_index DESC
    LOOP
      UPDATE boxes
      SET box_index = r.box_index + 1,
          code = z_letter || '-' || s_index || '-' || (r.box_index + 1)
      WHERE id = r.id;
    END LOOP;
  END IF;
  -- وإلا، الموقع شاغر → أدخل مباشرة بلا إزاحة (يبقى ما قبله شاغراً كما هو)

  new_code := z_letter || '-' || s_index || '-' || p_position;

  INSERT INTO boxes (warehouse_id, shelf_id, code, description, box_index, width_cm, height_cm)
  VALUES (wh_id, s_id, new_code, b_description, p_position, b_width_cm, b_height_cm)
  RETURNING id INTO new_box_id;

  RETURN new_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ ترقية 07 (إضافة في أيّ موقع شاغر) جاهزة' AS status;
