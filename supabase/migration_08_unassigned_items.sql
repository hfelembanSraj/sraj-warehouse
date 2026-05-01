-- ============================================
-- ترقية رقم 08: السماح بأغراض داخل مساحة دون صندوق محدّد
-- المُتطلَّب: عند حذف صندوق فيه أغراض، يخيّر المستخدم:
--   (أ) حذف الصندوق مع الأغراض، أو
--   (ب) حذف الصندوق فقط — الأغراض تبقى في نفس المساحة كـ"غير محدّدة"
--   ويجب على المستخدم لاحقاً أن يحدّد لها صندوقاً جديداً.
-- ============================================

-- 1. السماح بأن يكون box_id فارغاً (للأغراض غير المحدّدة)
ALTER TABLE items ALTER COLUMN box_id DROP NOT NULL;

-- 2. إضافة zone_id لتتبّع المساحة عند عدم وجود صندوق
ALTER TABLE items ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE CASCADE;

-- 3. فهرس لتسريع جلب الأغراض غير المحدّدة في مساحة
CREATE INDEX IF NOT EXISTS items_unassigned_in_zone_idx
  ON items (zone_id) WHERE box_id IS NULL AND deleted_at IS NULL;

-- 4. تعبئة zone_id للأغراض الموجودة (للتاريخ المُستقبلي إن صار box_id = NULL)
UPDATE items i
SET zone_id = (
  SELECT z.id
  FROM zones z
  JOIN shelves s ON s.zone_id = z.id
  JOIN boxes b   ON b.shelf_id = s.id
  WHERE b.id = i.box_id
)
WHERE i.zone_id IS NULL AND i.box_id IS NOT NULL;

-- 5. دالّة مُساعدة: حذف صندوق مع نقل أغراضه إلى "غير محدّدة" في المساحة نفسها
CREATE OR REPLACE FUNCTION public.delete_box_keep_items(p_box_id UUID)
RETURNS VOID AS $$
DECLARE
  z_id UUID;
BEGIN
  -- اعثر على المساحة الحاليّة لهذا الصندوق
  SELECT z.id INTO z_id
  FROM zones z
  JOIN shelves s ON s.zone_id = z.id
  JOIN boxes b   ON b.shelf_id = s.id
  WHERE b.id = p_box_id;

  IF z_id IS NULL THEN
    RAISE EXCEPTION 'الصندوق غير موجود أو لا ينتمي لمساحة';
  END IF;

  -- انقل جميع الأغراض النشطة في هذا الصندوق إلى "غير محدّدة" داخل المساحة
  UPDATE items
  SET box_id = NULL,
      zone_id = z_id
  WHERE box_id = p_box_id AND deleted_at IS NULL;

  -- حذف ناعم للصندوق
  UPDATE boxes SET deleted_at = NOW() WHERE id = p_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ ترقية 08 (الأغراض غير المحدّدة) جاهزة' AS status;
