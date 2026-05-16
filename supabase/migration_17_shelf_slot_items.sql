-- ============================================
-- ترقية رقم 17: أغراض كبيرة تشغل موقع صندوق على الرفّ مباشرة
-- ============================================
-- المُتطلَّب: غرض كبير (ثلاجة، طاولة كبيرة...) لا يدخل صندوقاً، لكنّه
-- يأخذ نفس موقع ومساحة الصندوق العادي على الرفّ — لا مربّع عائم.
--
-- نموذج البيانات الجديد للغرض:
--   item.box_id != NULL                         → داخل صندوق
--   item.shelf_id != NULL  AND box_id IS NULL   → غرض كبير في موقع رفّ (box_index)
--   item.zone_id  != NULL  AND box_id/shelf NULL → غير محدّد المكان (قائمة)
--   item.warehouse_id != NULL (لا box/zone/shelf) → خارج المساحات (مربّع على الخريطة)
-- ============================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS shelf_id UUID REFERENCES shelves(id) ON DELETE CASCADE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS box_index INTEGER;
ALTER TABLE items ADD COLUMN IF NOT EXISTS stack_index INTEGER DEFAULT 0;

-- فهرس لتسريع جلب أغراض رفّ معيّن في موقع
CREATE INDEX IF NOT EXISTS items_shelf_slot_idx
  ON items (shelf_id, box_index)
  WHERE box_id IS NULL AND deleted_at IS NULL;

-- تنظيف: الأغراض التجريبيّة العائمة (pos_top مضبوط داخل مساحة) تُعاد "غير محدّدة"
UPDATE items
SET pos_top = NULL, pos_left = NULL
WHERE box_id IS NULL AND zone_id IS NOT NULL AND shelf_id IS NULL AND pos_top IS NOT NULL;

SELECT '✅ ترقية 17 (أغراض في مواقع الرفّ) جاهزة' AS status;
