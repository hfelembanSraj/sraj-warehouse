-- ============================================
-- ترقية رقم 06: قيد فريد جزئي على رمز الصندوق
-- لحلّ مشكلة: لا يمكن إضافة صندوق برمز سبق حذفه ناعمياً
-- ============================================

-- إسقاط القيد القديم (الصارم)
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_warehouse_id_code_key;
DROP INDEX IF EXISTS boxes_warehouse_id_code_key;

-- إنشاء فهرس فريد جزئي يطبّق فقط على الصناديق غير المحذوفة
CREATE UNIQUE INDEX IF NOT EXISTS boxes_warehouse_id_code_active
  ON boxes (warehouse_id, code)
  WHERE deleted_at IS NULL;

SELECT '✅ ترقية 06 (قيد جزئي للرمز) جاهزة' AS status;
