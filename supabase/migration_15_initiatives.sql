-- ============================================
-- ترقية رقم 15: حُزَم المبادرات (Initiative Bundles)
-- ============================================
-- المُتطلَّب: حفظ قوائم جاهزة من الأدوات لمبادرة معيّنة (مثل: "مبادرة الصيف"
-- تحتاج 5 خيمات + 30 كرسي + بروجكتر + بنرات...) — ثمّ إخراج كلّ شيء بضغطة واحدة.
-- ============================================

-- جدول المبادرات
CREATE TABLE IF NOT EXISTS initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#7B2D8E',
  icon TEXT DEFAULT '🎪',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS initiatives_warehouse_idx ON initiatives(warehouse_id) WHERE deleted_at IS NULL;

-- ربط المبادرة بأدواتها (مع الكميّات المطلوبة)
CREATE TABLE IF NOT EXISTS initiative_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID REFERENCES initiatives(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  UNIQUE(initiative_id, item_id)
);

CREATE INDEX IF NOT EXISTS initiative_items_initiative_idx ON initiative_items(initiative_id);

-- RLS: قراءة للمستخدمين المُصادَقين، تعديل للجميع المُصادَقين أيضاً (يُمكن تشديده لاحقاً)
ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth all initiatives" ON initiatives;
CREATE POLICY "auth all initiatives" ON initiatives FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth all initiative_items" ON initiative_items;
CREATE POLICY "auth all initiative_items" ON initiative_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

SELECT '✅ ترقية 15 (حُزَم المبادرات) جاهزة' AS status;
