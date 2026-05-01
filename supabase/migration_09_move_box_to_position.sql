-- ============================================
-- ترقية رقم 09: نقل صندوق إلى موقع محدّد (داخل الرف نفسه أو إلى رفّ آخر)
-- ============================================
-- يدعم:
--   1. إعادة الترتيب داخل نفس الرف (تحريك للأمام أو للخلف مع إزاحة الصناديق المتوسّطة)
--   2. النقل بين رفوف مختلفة إلى موقع محدّد (مع ضغط الرف المصدر وإزاحة الرف الهدف)
-- يستخدم رمزاً مؤقّتاً للصندوق المنقول لتفادي تعارضات الفهرس الفريد أثناء العمليّة.

CREATE OR REPLACE FUNCTION public.move_box_to_position(
  p_box_id UUID,
  p_target_shelf_id UUID,
  p_target_position INTEGER
)
RETURNS VOID AS $$
DECLARE
  src_shelf_id UUID;
  src_box_index INTEGER;
  src_zone_letter TEXT;
  src_shelf_index INTEGER;
  tgt_zone_letter TEXT;
  tgt_shelf_index INTEGER;
  tgt_warehouse_id UUID;
  r RECORD;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN
    RAISE EXCEPTION 'محظور: للمؤسّس فقط';
  END IF;

  SELECT shelf_id, box_index INTO src_shelf_id, src_box_index
  FROM boxes WHERE id = p_box_id AND deleted_at IS NULL;

  IF src_shelf_id IS NULL THEN
    RAISE EXCEPTION 'الصندوق غير موجود أو ليس له رفّ';
  END IF;

  SELECT z.letter, s.shelf_index INTO src_zone_letter, src_shelf_index
  FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = src_shelf_id;

  SELECT z.letter, s.shelf_index, z.warehouse_id INTO tgt_zone_letter, tgt_shelf_index, tgt_warehouse_id
  FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = p_target_shelf_id;

  IF tgt_zone_letter IS NULL THEN
    RAISE EXCEPTION 'الرف الهدف غير موجود';
  END IF;

  IF p_target_position < 1 THEN p_target_position := 1; END IF;

  -- بدون عمل إن نفس الرف ونفس الموقع
  IF src_shelf_id = p_target_shelf_id AND src_box_index = p_target_position THEN
    RETURN;
  END IF;

  -- خطوة 1: انقل الصندوق إلى موقع مؤقّت آمن لتفادي تعارض الفهرس الفريد
  UPDATE boxes
  SET box_index = -1,
      code = '__moving__' || p_box_id::TEXT
  WHERE id = p_box_id;

  IF src_shelf_id = p_target_shelf_id THEN
    -- إعادة ترتيب داخل نفس الرف
    IF p_target_position > src_box_index THEN
      -- الموقع الجديد أكبر: أزِح الصناديق بين (src+1) و target نزولاً (-1)
      FOR r IN SELECT id, box_index FROM boxes
        WHERE shelf_id = p_target_shelf_id
          AND box_index > src_box_index
          AND box_index <= p_target_position
          AND deleted_at IS NULL
        ORDER BY box_index ASC
      LOOP
        UPDATE boxes
        SET box_index = r.box_index - 1,
            code = tgt_zone_letter || '-' || tgt_shelf_index || '-' || (r.box_index - 1)
        WHERE id = r.id;
      END LOOP;
    ELSE
      -- الموقع الجديد أصغر: أزِح الصناديق بين target و (src-1) صعوداً (+1)
      FOR r IN SELECT id, box_index FROM boxes
        WHERE shelf_id = p_target_shelf_id
          AND box_index >= p_target_position
          AND box_index < src_box_index
          AND deleted_at IS NULL
        ORDER BY box_index DESC
      LOOP
        UPDATE boxes
        SET box_index = r.box_index + 1,
            code = tgt_zone_letter || '-' || tgt_shelf_index || '-' || (r.box_index + 1)
        WHERE id = r.id;
      END LOOP;
    END IF;
  ELSE
    -- نقل بين رفوف: اضغط الرف المصدر (decrement كل > src_box_index)
    FOR r IN SELECT id, box_index FROM boxes
      WHERE shelf_id = src_shelf_id
        AND box_index > src_box_index
        AND deleted_at IS NULL
      ORDER BY box_index ASC
    LOOP
      UPDATE boxes
      SET box_index = r.box_index - 1,
          code = src_zone_letter || '-' || src_shelf_index || '-' || (r.box_index - 1)
      WHERE id = r.id;
    END LOOP;

    -- ثمّ أزِح الرف الهدف عند الموقع الهدف فما بعده (إن كان مشغولاً)
    IF EXISTS (SELECT 1 FROM boxes WHERE shelf_id = p_target_shelf_id AND box_index = p_target_position AND deleted_at IS NULL) THEN
      FOR r IN SELECT id, box_index FROM boxes
        WHERE shelf_id = p_target_shelf_id
          AND box_index >= p_target_position
          AND deleted_at IS NULL
        ORDER BY box_index DESC
      LOOP
        UPDATE boxes
        SET box_index = r.box_index + 1,
            code = tgt_zone_letter || '-' || tgt_shelf_index || '-' || (r.box_index + 1)
        WHERE id = r.id;
      END LOOP;
    END IF;
  END IF;

  -- خطوة 2: ضع الصندوق في موقعه النهائي
  UPDATE boxes
  SET shelf_id = p_target_shelf_id,
      box_index = p_target_position,
      code = tgt_zone_letter || '-' || tgt_shelf_index || '-' || p_target_position,
      warehouse_id = tgt_warehouse_id
  WHERE id = p_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ ترقية 09 (نقل صندوق إلى موقع محدّد) جاهزة' AS status;
