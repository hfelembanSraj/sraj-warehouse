-- ============================================
-- ترقية رقم 10: تخزين خارج المساحات
-- المُتطلَّب: تخزين أشياء كبيرة (طاولات قابلة للطيّ، لوحات الجمعية، إلخ)
-- داخل المستودع لكن خارج المساحات والأرفف والصناديق.
-- ============================================
-- الحلّ: إضافة warehouse_id إلى items للأغراض غير المرتبطة بصندوق ولا مساحة.
-- نموذج البيانات بعد الترقية:
--   item.box_id  != NULL  → داخل صندوق محدّد
--   item.zone_id != NULL  → غير محدّد المكان داخل مساحة (انتقالي)
--   item.warehouse_id != NULL  → خارج كلّ المساحات (المنطقة الحرّة)
-- ============================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE;

-- فهرس لتسريع جلب أغراض المنطقة الحرّة في مستودع
CREATE INDEX IF NOT EXISTS items_outside_zones_idx
  ON items (warehouse_id)
  WHERE box_id IS NULL AND zone_id IS NULL AND deleted_at IS NULL;

-- (لا حاجة لتحديث items الموجودة — قيمتها الافتراضيّة NULL)

SELECT '✅ ترقية 10 (تخزين خارج المساحات) جاهزة' AS status;
