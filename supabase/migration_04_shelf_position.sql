-- ============================================
-- ترقية رقم 04: إضافة الأرفف فوق/تحت + اسم مخصّص
-- ============================================

-- دالة جديدة تستوعب الموقع (top/bottom) واسم اختياري للرف
CREATE OR REPLACE FUNCTION public.add_shelf_at(
  z_id UUID,
  s_position TEXT DEFAULT 'bottom',          -- 'top' = أعلى | 'bottom' = أسفل
  s_height_cm NUMERIC DEFAULT 70,
  s_max_boxes INTEGER DEFAULT 4,
  s_label TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_shelf_id UUID;
  new_index INTEGER;
  shelves_count INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;

  SELECT COUNT(*) INTO shelves_count FROM shelves WHERE zone_id = z_id;

  IF shelves_count = 0 THEN
    new_index := 1;
  ELSIF s_position = 'top' THEN
    -- ضع الرف في الأعلى عبر شاخص أصغر من الأقل الموجود
    SELECT MIN(shelf_index) - 1 INTO new_index FROM shelves WHERE zone_id = z_id;
  ELSE
    -- الموقع الافتراضي: في الأسفل
    SELECT MAX(shelf_index) + 1 INTO new_index FROM shelves WHERE zone_id = z_id;
  END IF;

  INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes, label)
  VALUES (z_id, new_index, s_height_cm, s_max_boxes, s_label)
  RETURNING id INTO new_shelf_id;

  RETURN new_shelf_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ ترقية 04 (موقع الرف + اسم) جاهزة' AS status;
