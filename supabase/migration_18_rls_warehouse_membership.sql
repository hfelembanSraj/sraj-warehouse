-- ============================================
-- ترقية رقم 18: تشديد سياسات RLS — عزل بيانات كل مستودع حسب العضوية
-- ============================================
-- المشكلة (سابقاً): كل الجداول الأساسية كانت بسياسة "auth all" أي أنّ
--   أيّ مستخدم مُسجَّل يستطيع قراءة وتعديل بيانات أيّ مستودع — حتى لو لم
--   يكن عضواً فيه. هذا ثقب أمني حقيقي عند انضمام مستخدمين غير المؤسّس.
--
-- الحلّ: ربط الوصول بعضوية المستودع (جدول user_warehouses, approved=true).
--   - المؤسّس يتجاوز كل القيود عبر public.is_founder(auth.uid()).
--   - تدفّقات anon محفوظة (قراءة المستودعات + إرسال طلب انضمام).
--   - سجلّ النشاط يبقى مقروءاً/قابلاً للإضافة للجميع، لكن لا يُعدَّل/يُحذَف
--     إلا من المؤسّس (حماية سلامة سجلّ التدقيق).
--
-- هذا السكربت آمن لإعادة التشغيل (idempotent): DROP IF EXISTS + CREATE.
-- المؤسّس لن يُحجَب أبداً لأن is_founder أوّل شرط في كل دالّة.
-- ============================================

-- --------------------------------------------
-- 1) دوال مساعدة (SECURITY DEFINER لتفادي التكرار اللانهائي في RLS)
-- --------------------------------------------

-- هل يملك المستخدم الحالي صلاحية الوصول لهذا المستودع؟
CREATE OR REPLACE FUNCTION public.user_can_access_warehouse(wh_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    public.is_founder(auth.uid())
    OR (wh_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_warehouses uw
      WHERE uw.user_id = auth.uid()
        AND uw.warehouse_id = wh_id
        AND uw.approved = true
    ));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- هل المستخدم الحالي مدير لهذا المستودع (أو مؤسّس)؟
CREATE OR REPLACE FUNCTION public.user_is_wh_manager(wh_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    public.is_founder(auth.uid())
    OR (wh_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_warehouses uw
      WHERE uw.user_id = auth.uid()
        AND uw.warehouse_id = wh_id
        AND uw.role = 'whmanager'
        AND uw.approved = true
    ));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- استنتاج مستودع الغرض من أيٍّ من روابطه (الأغراض قد تُربط بأربع طرق)
--   box_id   → boxes.warehouse_id        (داخل صندوق)
--   shelf_id → shelves→zones.warehouse_id (غرض كبير في موقع رفّ)
--   zone_id  → zones.warehouse_id        (غير محدّد داخل مساحة)
--   warehouse_id مباشرةً                  (خارج كل المساحات)
CREATE OR REPLACE FUNCTION public.item_effective_warehouse(
  p_box_id UUID, p_zone_id UUID, p_shelf_id UUID, p_warehouse_id UUID
) RETURNS UUID AS $$
  SELECT CASE
    WHEN p_box_id IS NOT NULL THEN
      (SELECT warehouse_id FROM boxes WHERE id = p_box_id)
    WHEN p_shelf_id IS NOT NULL THEN
      (SELECT z.warehouse_id FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = p_shelf_id)
    WHEN p_zone_id IS NOT NULL THEN
      (SELECT warehouse_id FROM zones WHERE id = p_zone_id)
    ELSE p_warehouse_id
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --------------------------------------------
-- 2) الجداول ذات warehouse_id المباشر
-- --------------------------------------------

-- الصناديق
DROP POLICY IF EXISTS "auth all boxes" ON boxes;
DROP POLICY IF EXISTS "wh members boxes" ON boxes;
CREATE POLICY "wh members boxes" ON boxes FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id))
  WITH CHECK (public.user_can_access_warehouse(warehouse_id));

-- عمليات الإخراج
DROP POLICY IF EXISTS "auth all checkouts" ON checkouts;
DROP POLICY IF EXISTS "wh members checkouts" ON checkouts;
CREATE POLICY "wh members checkouts" ON checkouts FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id))
  WITH CHECK (public.user_can_access_warehouse(warehouse_id));

-- المتلفات
DROP POLICY IF EXISTS "auth all damaged" ON damaged_items;
DROP POLICY IF EXISTS "wh members damaged" ON damaged_items;
CREATE POLICY "wh members damaged" ON damaged_items FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id))
  WITH CHECK (public.user_can_access_warehouse(warehouse_id));

-- الدعم
DROP POLICY IF EXISTS "auth all donated" ON donated_items;
DROP POLICY IF EXISTS "wh members donated" ON donated_items;
CREATE POLICY "wh members donated" ON donated_items FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id))
  WITH CHECK (public.user_can_access_warehouse(warehouse_id));

-- المبادرات
DROP POLICY IF EXISTS "auth all initiatives" ON initiatives;
DROP POLICY IF EXISTS "wh members initiatives" ON initiatives;
CREATE POLICY "wh members initiatives" ON initiatives FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id))
  WITH CHECK (public.user_can_access_warehouse(warehouse_id));

-- --------------------------------------------
-- 3) الأغراض (warehouse مستنتَج من الروابط)
-- --------------------------------------------
DROP POLICY IF EXISTS "auth all items" ON items;
DROP POLICY IF EXISTS "wh members items" ON items;
CREATE POLICY "wh members items" ON items FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(
           public.item_effective_warehouse(box_id, zone_id, shelf_id, warehouse_id)))
  WITH CHECK (public.user_can_access_warehouse(
           public.item_effective_warehouse(box_id, zone_id, shelf_id, warehouse_id)));

-- --------------------------------------------
-- 4) أدوات المبادرات (warehouse عبر المبادرة)
-- --------------------------------------------
DROP POLICY IF EXISTS "auth all initiative_items" ON initiative_items;
DROP POLICY IF EXISTS "wh members initiative_items" ON initiative_items;
CREATE POLICY "wh members initiative_items" ON initiative_items FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(
           (SELECT warehouse_id FROM initiatives WHERE id = initiative_id)))
  WITH CHECK (public.user_can_access_warehouse(
           (SELECT warehouse_id FROM initiatives WHERE id = initiative_id)));

-- --------------------------------------------
-- 5) ربط المستخدمين بالمستودعات
--    قراءة: صفوف المستخدم نفسه أو مدير ذلك المستودع.
--    كتابة: مدير ذلك المستودع (أو المؤسّس).
-- --------------------------------------------
DROP POLICY IF EXISTS "auth all user_warehouses" ON user_warehouses;
DROP POLICY IF EXISTS "uw select" ON user_warehouses;
DROP POLICY IF EXISTS "uw write" ON user_warehouses;
CREATE POLICY "uw select" ON user_warehouses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_is_wh_manager(warehouse_id));
CREATE POLICY "uw write" ON user_warehouses FOR ALL TO authenticated
  USING (public.user_is_wh_manager(warehouse_id))
  WITH CHECK (public.user_is_wh_manager(warehouse_id));

-- --------------------------------------------
-- 6) طلبات الانضمام
--    إدراج: anon (محفوظ) + أيّ مستخدم مُسجَّل.
--    قراءة: صاحب الطلب أو مدير المستودع.
--    تعديل/حذف: مدير المستودع (أو المؤسّس).
-- --------------------------------------------
DROP POLICY IF EXISTS "auth all join_requests" ON join_requests;
-- نُبقي السياسة "anon insert join_requests" كما هي (لا تُحذَف)
DROP POLICY IF EXISTS "jr insert auth" ON join_requests;
DROP POLICY IF EXISTS "jr select" ON join_requests;
DROP POLICY IF EXISTS "jr update" ON join_requests;
DROP POLICY IF EXISTS "jr delete" ON join_requests;
CREATE POLICY "jr insert auth" ON join_requests FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "jr select" ON join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_is_wh_manager(warehouse_id));
CREATE POLICY "jr update" ON join_requests FOR UPDATE TO authenticated
  USING (public.user_is_wh_manager(warehouse_id))
  WITH CHECK (public.user_is_wh_manager(warehouse_id));
CREATE POLICY "jr delete" ON join_requests FOR DELETE TO authenticated
  USING (public.user_is_wh_manager(warehouse_id));

-- --------------------------------------------
-- 7) سجلّ النشاط — مقروء/قابل للإضافة للجميع،
--    لا يُعدَّل/يُحذَف إلا من المؤسّس (حماية سلامة سجلّ التدقيق)
-- --------------------------------------------
DROP POLICY IF EXISTS "auth all log" ON activity_log;
DROP POLICY IF EXISTS "log select" ON activity_log;
DROP POLICY IF EXISTS "log insert" ON activity_log;
DROP POLICY IF EXISTS "log update founder" ON activity_log;
DROP POLICY IF EXISTS "log delete founder" ON activity_log;
CREATE POLICY "log select" ON activity_log FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "log insert" ON activity_log FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "log update founder" ON activity_log FOR UPDATE TO authenticated
  USING (public.is_founder(auth.uid()))
  WITH CHECK (public.is_founder(auth.uid()));
CREATE POLICY "log delete founder" ON activity_log FOR DELETE TO authenticated
  USING (public.is_founder(auth.uid()));

-- ملاحظة: لم تُمَسّ profiles / warehouses / zones / shelves / app_config:
--   - warehouses: الكتابة عبر دوال SECURITY DEFINER تتحقّق من is_founder.
--   - zones / shelves: الكتابة للمؤسّس فقط (ترقية 02).
--   - app_config: للمؤسّس فقط (ترقية 13).
--   - profiles: تبقى مقروءة للمُسجَّلين (يلزم للوحات الأسماء والسجلّ).

-- --------------------------------------------
-- 8) تحقّق: عرض كل السياسات النشطة بعد الترقية
-- --------------------------------------------
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('boxes','items','checkouts','damaged_items','donated_items',
                    'initiatives','initiative_items','user_warehouses',
                    'join_requests','activity_log')
ORDER BY tablename, policyname;

SELECT '✅ ترقية 18 (تشديد RLS حسب عضوية المستودع) جاهزة' AS status;
