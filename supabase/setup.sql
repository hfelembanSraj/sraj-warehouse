-- ============================================
-- نظام إدارة المستودعات — جمعية المسؤولية الاجتماعية
-- سكربت إعداد قاعدة البيانات في Supabase
-- ============================================
-- كيفية الاستخدام:
-- 1. ادخل لوحة تحكم Supabase
-- 2. افتح SQL Editor
-- 3. الصق هذا الملف كاملاً واضغط Run
-- ============================================

-- جدول الملفات الشخصية للمستخدمين
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('sysadmin', 'whmanager', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المستودعات
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  width_m NUMERIC DEFAULT 4,
  depth_m NUMERIC DEFAULT 4,
  height_m NUMERIC DEFAULT 2.3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول ربط المستخدمين بالمستودعات والصلاحيات
CREATE TABLE IF NOT EXISTS user_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'user' CHECK (role IN ('whmanager', 'user')),
  permissions JSONB DEFAULT '{"view":true,"checkout":false,"return":false,"add":false,"edit":false,"delete":false}'::jsonb,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, warehouse_id)
);

-- جدول طلبات الانضمام
CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الصناديق
CREATE TABLE IF NOT EXISTS boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id, code)
);

-- جدول الأدوات
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'ok' CHECK (status IN ('ok', 'warn', 'damaged')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول عمليات الإخراج
CREATE TABLE IF NOT EXISTS checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  box_id UUID NOT NULL,
  box_code TEXT NOT NULL,
  item_id UUID,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  purpose TEXT DEFAULT 'initiative' CHECK (purpose IN ('initiative', 'personal')),
  initiative TEXT,
  date_out DATE NOT NULL,
  returned_at TIMESTAMPTZ,
  returned_qty INTEGER,
  damaged_at TIMESTAMPTZ,
  donated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المتلفات
CREATE TABLE IF NOT EXISTS damaged_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  box_id UUID,
  box_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT NOT NULL,
  damaged_at DATE NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الدعم
CREATE TABLE IF NOT EXISTS donated_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  box_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  initiative TEXT,
  donated_at DATE NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول سجل الحركات
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Trigger لإنشاء profile تلقائياً عند تسجيل مستخدم جديد
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'مستخدم'),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Row Level Security (الحماية على مستوى الصفوف)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE damaged_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE donated_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- سياسات بسيطة: المستخدم المسجّل يستطيع القراءة والكتابة
CREATE POLICY "auth read profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "auth read warehouses" ON warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon read warehouses" ON warehouses FOR SELECT TO anon USING (true);

CREATE POLICY "auth all user_warehouses" ON user_warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all join_requests" ON join_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon insert join_requests" ON join_requests FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "auth all boxes" ON boxes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all items" ON items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all checkouts" ON checkouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all damaged" ON damaged_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all donated" ON donated_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all log" ON activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- بيانات تجريبية أولية
-- ============================================
INSERT INTO warehouses (id, name, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'المستودع الرئيسي', 'المستودع الرئيسي لجمعية المسؤولية الاجتماعية')
ON CONFLICT (id) DO NOTHING;

-- صناديق تجريبية
INSERT INTO boxes (warehouse_id, code, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'A-1-1', 'حبال وأدوات تحكيم'),
  ('11111111-1111-1111-1111-111111111111', 'A-1-2', 'بالونات ومنفاخ'),
  ('11111111-1111-1111-1111-111111111111', 'A-2-1', 'كرات رياضية'),
  ('11111111-1111-1111-1111-111111111111', 'A-3-1', 'ميداليات وكؤوس'),
  ('11111111-1111-1111-1111-111111111111', 'B-1-1', 'بروجكتر وكابلات'),
  ('11111111-1111-1111-1111-111111111111', 'B-1-2', 'مكبرات صوت'),
  ('11111111-1111-1111-1111-111111111111', 'B-2-2', 'كاميرات تصوير'),
  ('11111111-1111-1111-1111-111111111111', 'C-1-1', 'طاولات قابلة للطي'),
  ('11111111-1111-1111-1111-111111111111', 'C-1-2', 'كراسي بلاستيكية'),
  ('11111111-1111-1111-1111-111111111111', 'D-1-1', 'بنرات الجمعية'),
  ('11111111-1111-1111-1111-111111111111', 'D-2-1', 'أعلام ولوازم')
ON CONFLICT DO NOTHING;

-- إضافة أدوات تجريبية لكل صندوق
DO $$
DECLARE
  bA11 UUID; bA12 UUID; bA21 UUID; bA31 UUID;
  bB11 UUID; bB12 UUID; bB22 UUID;
  bC11 UUID; bC12 UUID;
  bD11 UUID; bD21 UUID;
BEGIN
  SELECT id INTO bA11 FROM boxes WHERE code='A-1-1' LIMIT 1;
  SELECT id INTO bA12 FROM boxes WHERE code='A-1-2' LIMIT 1;
  SELECT id INTO bA21 FROM boxes WHERE code='A-2-1' LIMIT 1;
  SELECT id INTO bA31 FROM boxes WHERE code='A-3-1' LIMIT 1;
  SELECT id INTO bB11 FROM boxes WHERE code='B-1-1' LIMIT 1;
  SELECT id INTO bB12 FROM boxes WHERE code='B-1-2' LIMIT 1;
  SELECT id INTO bB22 FROM boxes WHERE code='B-2-2' LIMIT 1;
  SELECT id INTO bC11 FROM boxes WHERE code='C-1-1' LIMIT 1;
  SELECT id INTO bC12 FROM boxes WHERE code='C-1-2' LIMIT 1;
  SELECT id INTO bD11 FROM boxes WHERE code='D-1-1' LIMIT 1;
  SELECT id INTO bD21 FROM boxes WHERE code='D-2-1' LIMIT 1;

  INSERT INTO items (box_id, name, quantity, status) VALUES
    (bA11, 'حبال تجاذب', 4, 'ok'),
    (bA11, 'صفّارات', 10, 'ok'),
    (bA12, 'بالونات', 300, 'ok'),
    (bA12, 'منفاخ كهربائي', 1, 'ok'),
    (bA21, 'كرات قدم', 6, 'ok'),
    (bA21, 'كرات طائرة', 4, 'ok'),
    (bA31, 'ميداليات', 50, 'ok'),
    (bA31, 'كؤوس', 10, 'ok'),
    (bB11, 'بروجكتر Epson', 1, 'ok'),
    (bB11, 'كابلات HDMI', 3, 'ok'),
    (bB12, 'مكبرات صوت JBL', 2, 'ok'),
    (bB22, 'كاميرا تصوير', 1, 'ok'),
    (bB22, 'حامل ثلاثي', 2, 'ok'),
    (bC11, 'طاولات قابلة للطي', 8, 'ok'),
    (bC12, 'كراسي بلاستيكية', 40, 'ok'),
    (bD11, 'بنرات الجمعية', 4, 'ok'),
    (bD11, 'رول-أب', 3, 'ok'),
    (bD21, 'أعلام السعودية', 10, 'ok'),
    (bD21, 'شعارات الجمعية', 20, 'ok')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================
-- 🟢 إضافات نظام المؤسّس Sraj-Warehouse
-- ============================================

-- حقول المؤسّس على جدول profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stealth_mode BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ضمان وجود مؤسّس واحد فقط في النظام
CREATE UNIQUE INDEX IF NOT EXISTS unique_founder_idx
  ON profiles ((is_founder)) WHERE is_founder = true;

-- ============================================
-- 🟡 طبقة الاستقرار: Soft Delete + Optimistic Locking
-- ============================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE damaged_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE donated_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================
-- 🔵 الدوال المساعدة
-- ============================================

-- هل المستخدم مؤسّس؟
CREATE OR REPLACE FUNCTION public.is_founder(uid UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_founder FROM profiles WHERE id = uid), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- نقطة فحص الحالة الصحيّة (تُستخدم من UptimeRobot ومن Cron الإبقاء على التشغيل)
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS JSON AS $$
  SELECT json_build_object(
    'status', 'ok',
    'time', NOW(),
    'profiles_count', (SELECT COUNT(*) FROM profiles),
    'warehouses_count', (SELECT COUNT(*) FROM warehouses),
    'has_founder', EXISTS(SELECT 1 FROM profiles WHERE is_founder = true)
  );
$$ LANGUAGE sql STABLE;

-- ============================================
-- 🔴 محفّز: حماية حساب المؤسّس من الحذف (في profiles)
-- ============================================
CREATE OR REPLACE FUNCTION public.prevent_founder_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_founder = true THEN
    RAISE EXCEPTION 'محظور: لا يمكن حذف حساب المؤسّس';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_founder_profile ON profiles;
CREATE TRIGGER protect_founder_profile
  BEFORE DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_founder_delete();

-- منع حذف المؤسّس من auth.users كذلك
CREATE OR REPLACE FUNCTION public.prevent_founder_auth_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = OLD.id AND is_founder = true) THEN
    RAISE EXCEPTION 'محظور: لا يمكن حذف حساب المؤسّس من نظام المصادقة';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_founder_auth ON auth.users;
CREATE TRIGGER protect_founder_auth
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_founder_auth_delete();

-- ============================================
-- 👻 محفّز التخفّي: تخطّي تسجيل النشاط للمؤسّس عند تفعيل وضع التخفّي
-- ============================================
CREATE OR REPLACE FUNCTION public.skip_log_for_stealth_founder()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = NEW.user_id AND is_founder = true AND stealth_mode = true
  ) THEN
    RETURN NULL; -- لا يُدرج السجل عند التخفّي
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS founder_stealth_skip ON activity_log;
CREATE TRIGGER founder_stealth_skip
  BEFORE INSERT ON activity_log
  FOR EACH ROW EXECUTE FUNCTION public.skip_log_for_stealth_founder();

-- ============================================
-- ⏱ محفّز updated_at تلقائي على profiles
-- ============================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_profiles_updated_at ON profiles;
CREATE TRIGGER touch_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- 🚀 دالة تعيين المؤسّس (تُستخدم مرّة واحدة بعد إنشاء حساب المؤسّس في Auth)
-- ============================================
CREATE OR REPLACE FUNCTION public.bootstrap_founder(founder_email TEXT)
RETURNS TEXT AS $$
DECLARE
  founder_id UUID;
  default_warehouse_id UUID := '11111111-1111-1111-1111-111111111111';
  existing_founder_email TEXT;
BEGIN
  -- التأكّد من عدم وجود مؤسّس آخر
  SELECT email INTO existing_founder_email FROM profiles WHERE is_founder = true LIMIT 1;
  IF existing_founder_email IS NOT NULL AND existing_founder_email <> founder_email THEN
    RETURN 'خطأ: يوجد مؤسّس بالفعل (' || existing_founder_email || '). لا يمكن وجود أكثر من مؤسّس.';
  END IF;

  SELECT id INTO founder_id FROM profiles WHERE email = founder_email LIMIT 1;
  IF founder_id IS NULL THEN
    RETURN 'خطأ: لم يُعثر على مستخدم بهذا البريد. أنشئ الحساب أولاً من Authentication > Add User';
  END IF;

  -- ترقية إلى مؤسّس + مدير نظام
  UPDATE profiles SET is_founder = true, role = 'sysadmin' WHERE id = founder_id;

  -- ربطه بالمستودع الرئيسي كمدير بكل الصلاحيات
  INSERT INTO user_warehouses (user_id, warehouse_id, role, approved, permissions)
  VALUES (founder_id, default_warehouse_id, 'whmanager', true,
    '{"view":true,"checkout":true,"return":true,"add":true,"edit":true,"delete":true}'::jsonb)
  ON CONFLICT (user_id, warehouse_id) DO UPDATE
    SET role = 'whmanager', approved = true,
        permissions = '{"view":true,"checkout":true,"return":true,"add":true,"edit":true,"delete":true}'::jsonb;

  RETURN '✅ تمت ترقية ' || founder_email || ' إلى المؤسّس بنجاح';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 🔑 دالة تحديث بريد المؤسّس في profiles
-- (auth.users.email يُحدَّث تلقائياً من واجهة الإعدادات)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_founder_profile(new_full_name TEXT, new_email TEXT)
RETURNS TEXT AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND is_founder = true) THEN
    RAISE EXCEPTION 'محظور: هذه الدالة للمؤسّس فقط';
  END IF;
  UPDATE profiles
    SET full_name = COALESCE(new_full_name, full_name),
        email     = COALESCE(new_email,     email)
    WHERE id = caller_id;
  RETURN '✅ تم تحديث بيانات المؤسّس';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 🎚 دالة تبديل وضع التخفّي للمؤسّس
-- ============================================
CREATE OR REPLACE FUNCTION public.toggle_stealth_mode(enable BOOLEAN)
RETURNS TEXT AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND is_founder = true) THEN
    RAISE EXCEPTION 'محظور: هذه الدالة للمؤسّس فقط';
  END IF;
  UPDATE profiles SET stealth_mode = enable WHERE id = caller_id;
  RETURN CASE WHEN enable THEN '👻 تم تفعيل وضع التخفّي' ELSE '👁 تم إيقاف وضع التخفّي' END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ملاحظات مهمة بعد التنفيذ:
-- ============================================
-- 1. أنشئ حساب المؤسّس من Authentication > Users > Add user
--    البريد: evuon1@gmail.com (مع تفعيل Auto Confirm User)
-- 2. ثم نفّذ:  SELECT bootstrap_founder('evuon1@gmail.com');
-- 3. لإضافة مستخدم آخر كمدير مستودع لاحقاً:
--    INSERT INTO user_warehouses (user_id, warehouse_id, role, approved, permissions)
--    SELECT id, '11111111-1111-1111-1111-111111111111', 'whmanager', true,
--    '{"view":true,"checkout":true,"return":true,"add":true,"edit":true,"delete":true}'::jsonb
--    FROM profiles WHERE email = 'manager@example.com';
-- ============================================

SELECT '✅ تم إعداد قاعدة بيانات Sraj-Warehouse بنجاح!' AS status;
