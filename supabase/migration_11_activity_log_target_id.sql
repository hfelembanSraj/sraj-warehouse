-- ============================================
-- ترقية رقم 11: إثراء سجلّ النشاط بمعرّف الهدف ونوعه
-- لاستخدام السجلّ في "تتبّع حركة الغرض الواحد" بشكل دقيق (لا اعتماد على النصّ)
-- ============================================

ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS target_id UUID;

-- فهرس للبحث السريع عن سجلّ كائن معيّن
CREATE INDEX IF NOT EXISTS activity_log_target_lookup_idx
  ON activity_log(target_type, target_id, created_at DESC);

SELECT '✅ ترقية 11 (target_id لسجلّ النشاط) جاهزة' AS status;
