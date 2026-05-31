-- ============================================================
-- 🟢 سكربت الإعداد الكامل لقاعدة بيانات جديدة — Sraj-Warehouse
-- ============================================================
-- يجمع كل الترقيات (setup + 02..18) في ملفّ واحد، بالترتيب الصحيح.
-- التشغيل: افتح SQL Editor في مشروع Supabase الجديد، الصق هذا الملفّ كاملاً،
--          واضغط Run. ثمّ اتبع التعليمات في آخر الملفّ لتعيين المؤسّس.
-- (تخطّينا الترقية 05 لأن 07 تستبدلها، و12 لأن 13 تستبدلها.)
-- ============================================================

-- ============================================================
-- [setup] الجداول الأساسية + نظام المؤسّس + بيانات البداية
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('sysadmin', 'whmanager', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  width_m NUMERIC DEFAULT 4,
  depth_m NUMERIC DEFAULT 4,
  height_m NUMERIC DEFAULT 2.3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'ok' CHECK (status IN ('ok', 'warn', 'damaged')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: إنشاء profile تلقائياً عند تسجيل مستخدم جديد
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'مستخدم'), 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- تفعيل RLS
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

-- سياسات أوّليّة (تُشدَّد لاحقاً في الترقية 18)
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

-- بيانات بداية: المستودع الرئيسي + صناديق وأصناف نموذجيّة (يمكن حذفها لاحقاً من الواجهة)
INSERT INTO warehouses (id, name, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'المستودع الرئيسي', 'المستودع الرئيسي لجمعية المسؤولية الاجتماعية')
ON CONFLICT (id) DO NOTHING;

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

DO $$
DECLARE
  bA11 UUID; bA12 UUID; bA21 UUID; bA31 UUID;
  bB11 UUID; bB12 UUID; bB22 UUID;
  bC11 UUID; bC12 UUID; bD11 UUID; bD21 UUID;
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
    (bA11, 'حبال تجاذب', 4, 'ok'), (bA11, 'صفّارات', 10, 'ok'),
    (bA12, 'بالونات', 300, 'ok'), (bA12, 'منفاخ كهربائي', 1, 'ok'),
    (bA21, 'كرات قدم', 6, 'ok'), (bA21, 'كرات طائرة', 4, 'ok'),
    (bA31, 'ميداليات', 50, 'ok'), (bA31, 'كؤوس', 10, 'ok'),
    (bB11, 'بروجكتر Epson', 1, 'ok'), (bB11, 'كابلات HDMI', 3, 'ok'),
    (bB12, 'مكبرات صوت JBL', 2, 'ok'), (bB22, 'كاميرا تصوير', 1, 'ok'),
    (bB22, 'حامل ثلاثي', 2, 'ok'), (bC11, 'طاولات قابلة للطي', 8, 'ok'),
    (bC12, 'كراسي بلاستيكية', 40, 'ok'), (bD11, 'بنرات الجمعية', 4, 'ok'),
    (bD11, 'رول-أب', 3, 'ok'), (bD21, 'أعلام السعودية', 10, 'ok'),
    (bD21, 'شعارات الجمعية', 20, 'ok')
  ON CONFLICT DO NOTHING;
END $$;

-- نظام المؤسّس
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stealth_mode BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS unique_founder_idx ON profiles ((is_founder)) WHERE is_founder = true;

-- Soft delete + optimistic locking
ALTER TABLE items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE damaged_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE donated_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- الدوال المساعدة
CREATE OR REPLACE FUNCTION public.is_founder(uid UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_founder FROM profiles WHERE id = uid), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.health_check()
RETURNS JSON AS $$
  SELECT json_build_object('status','ok','time',NOW(),
    'profiles_count',(SELECT COUNT(*) FROM profiles),
    'warehouses_count',(SELECT COUNT(*) FROM warehouses),
    'has_founder',EXISTS(SELECT 1 FROM profiles WHERE is_founder = true));
$$ LANGUAGE sql STABLE;

-- حماية المؤسّس من الحذف
CREATE OR REPLACE FUNCTION public.prevent_founder_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_founder = true THEN RAISE EXCEPTION 'محظور: لا يمكن حذف حساب المؤسّس'; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS protect_founder_profile ON profiles;
CREATE TRIGGER protect_founder_profile BEFORE DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_founder_delete();

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
CREATE TRIGGER protect_founder_auth BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_founder_auth_delete();

-- وضع التخفّي
CREATE OR REPLACE FUNCTION public.skip_log_for_stealth_founder()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND is_founder = true AND stealth_mode = true) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS founder_stealth_skip ON activity_log;
CREATE TRIGGER founder_stealth_skip BEFORE INSERT ON activity_log
  FOR EACH ROW EXECUTE FUNCTION public.skip_log_for_stealth_founder();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS touch_profiles_updated_at ON profiles;
CREATE TRIGGER touch_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.bootstrap_founder(founder_email TEXT)
RETURNS TEXT AS $$
DECLARE
  founder_id UUID;
  default_warehouse_id UUID := '11111111-1111-1111-1111-111111111111';
  existing_founder_email TEXT;
BEGIN
  SELECT email INTO existing_founder_email FROM profiles WHERE is_founder = true LIMIT 1;
  IF existing_founder_email IS NOT NULL AND existing_founder_email <> founder_email THEN
    RETURN 'خطأ: يوجد مؤسّس بالفعل (' || existing_founder_email || ').';
  END IF;
  SELECT id INTO founder_id FROM profiles WHERE email = founder_email LIMIT 1;
  IF founder_id IS NULL THEN
    RETURN 'خطأ: لم يُعثر على مستخدم بهذا البريد. أنشئ الحساب أولاً من Authentication > Add User';
  END IF;
  UPDATE profiles SET is_founder = true, role = 'sysadmin' WHERE id = founder_id;
  INSERT INTO user_warehouses (user_id, warehouse_id, role, approved, permissions)
  VALUES (founder_id, default_warehouse_id, 'whmanager', true,
    '{"view":true,"checkout":true,"return":true,"add":true,"edit":true,"delete":true}'::jsonb)
  ON CONFLICT (user_id, warehouse_id) DO UPDATE
    SET role='whmanager', approved=true,
        permissions='{"view":true,"checkout":true,"return":true,"add":true,"edit":true,"delete":true}'::jsonb;
  RETURN '✅ تمت ترقية ' || founder_email || ' إلى المؤسّس بنجاح';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_founder_profile(new_full_name TEXT, new_email TEXT)
RETURNS TEXT AS $$
DECLARE caller_id UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND is_founder = true) THEN
    RAISE EXCEPTION 'محظور: هذه الدالة للمؤسّس فقط';
  END IF;
  UPDATE profiles SET full_name = COALESCE(new_full_name, full_name),
    email = COALESCE(new_email, email) WHERE id = caller_id;
  RETURN '✅ تم تحديث بيانات المؤسّس';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.toggle_stealth_mode(enable BOOLEAN)
RETURNS TEXT AS $$
DECLARE caller_id UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND is_founder = true) THEN
    RAISE EXCEPTION 'محظور: هذه الدالة للمؤسّس فقط';
  END IF;
  UPDATE profiles SET stealth_mode = enable WHERE id = caller_id;
  RETURN CASE WHEN enable THEN '👻 تم تفعيل وضع التخفّي' ELSE '👁 تم إيقاف وضع التخفّي' END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- [02] المساحات (zones) والأرفف (shelves) + RPCs + التخطيط
-- ============================================================
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  letter TEXT NOT NULL, name TEXT NOT NULL,
  color TEXT DEFAULT '#185FA5',
  width_cm NUMERIC DEFAULT 200, height_cm NUMERIC DEFAULT 230, depth_cm NUMERIC DEFAULT 65,
  pos_top NUMERIC DEFAULT 6, pos_left NUMERIC DEFAULT NULL, pos_right NUMERIC DEFAULT 4,
  pos_width NUMERIC DEFAULT 18, pos_height NUMERIC DEFAULT 42,
  display_order INTEGER DEFAULT 0, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(warehouse_id, letter)
);

CREATE TABLE IF NOT EXISTS shelves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  shelf_index INTEGER NOT NULL, label TEXT,
  height_cm NUMERIC DEFAULT 70, max_boxes INTEGER DEFAULT 4,
  deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(zone_id, shelf_index)
);

ALTER TABLE boxes ADD COLUMN IF NOT EXISTS shelf_id UUID REFERENCES shelves(id) ON DELETE SET NULL;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS box_index INTEGER DEFAULT 0;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS width_cm NUMERIC DEFAULT 50;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS height_cm NUMERIC DEFAULT 65;

INSERT INTO zones (warehouse_id, letter, name, color, pos_top, pos_left, pos_right, pos_width, pos_height, display_order)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'A', 'عُدّة الفعاليات',  '#D85A30', 6, NULL, 4, 18, 42, 1),
  ('11111111-1111-1111-1111-111111111111', 'B', 'العُدّة التقنية',  '#185FA5', 52, NULL, 4, 18, 42, 2),
  ('11111111-1111-1111-1111-111111111111', 'C', 'تجهيزات ميدانية', '#27500A', 6, 4, NULL, 18, 42, 3),
  ('11111111-1111-1111-1111-111111111111', 'D', 'مواد مساندة',     '#633806', 52, 4, NULL, 18, 42, 4)
ON CONFLICT (warehouse_id, letter) DO NOTHING;

INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes)
SELECT z.id, s.idx, 70, 4 FROM zones z CROSS JOIN (VALUES (1),(2),(3)) AS s(idx)
ON CONFLICT (zone_id, shelf_index) DO NOTHING;

UPDATE boxes b SET shelf_id = s.id,
  box_index = COALESCE(NULLIF(SPLIT_PART(b.code,'-',3),'')::INT, 0)
FROM zones z, shelves s
WHERE z.warehouse_id = b.warehouse_id AND z.letter = SPLIT_PART(b.code,'-',1)
  AND s.zone_id = z.id AND s.shelf_index = COALESCE(NULLIF(SPLIT_PART(b.code,'-',2),'')::INT, 0)
  AND b.shelf_id IS NULL;

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read zones" ON zones;
CREATE POLICY "auth read zones" ON zones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "founder all zones" ON zones;
CREATE POLICY "founder all zones" ON zones FOR ALL TO authenticated
  USING (public.is_founder(auth.uid())) WITH CHECK (public.is_founder(auth.uid()));
DROP POLICY IF EXISTS "auth read shelves" ON shelves;
CREATE POLICY "auth read shelves" ON shelves FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "founder all shelves" ON shelves;
CREATE POLICY "founder all shelves" ON shelves FOR ALL TO authenticated
  USING (public.is_founder(auth.uid())) WITH CHECK (public.is_founder(auth.uid()));

CREATE OR REPLACE FUNCTION public.create_warehouse(
  wh_name TEXT, wh_description TEXT DEFAULT '', wh_width_m NUMERIC DEFAULT 4,
  wh_depth_m NUMERIC DEFAULT 4, wh_height_m NUMERIC DEFAULT 2.3)
RETURNS UUID AS $$
DECLARE caller_id UUID := auth.uid(); new_wh_id UUID;
BEGIN
  IF NOT public.is_founder(caller_id) THEN RAISE EXCEPTION 'محظور: إنشاء المستودعات للمؤسّس فقط'; END IF;
  INSERT INTO warehouses (name, description, width_m, depth_m, height_m)
  VALUES (wh_name, wh_description, wh_width_m, wh_depth_m, wh_height_m) RETURNING id INTO new_wh_id;
  INSERT INTO user_warehouses (user_id, warehouse_id, role, approved, permissions)
  VALUES (caller_id, new_wh_id, 'whmanager', true,
    '{"view":true,"checkout":true,"return":true,"add":true,"edit":true,"delete":true}'::jsonb)
  ON CONFLICT (user_id, warehouse_id) DO NOTHING;
  RETURN new_wh_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rename_warehouse(wh_id UUID, new_name TEXT, new_description TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  UPDATE warehouses SET name = COALESCE(new_name, name), description = COALESCE(new_description, description) WHERE id = wh_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.delete_warehouse(wh_id UUID)
RETURNS VOID AS $$
DECLARE wh_count INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  SELECT COUNT(*) INTO wh_count FROM warehouses;
  IF wh_count <= 1 THEN RAISE EXCEPTION 'لا يمكن حذف آخر مستودع'; END IF;
  DELETE FROM warehouses WHERE id = wh_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.add_zone(
  wh_id UUID, zone_letter TEXT, zone_name TEXT, zone_color TEXT DEFAULT '#185FA5',
  zone_width_cm NUMERIC DEFAULT 200, zone_height_cm NUMERIC DEFAULT 230,
  zone_depth_cm NUMERIC DEFAULT 65, shelves_count INTEGER DEFAULT 3)
RETURNS UUID AS $$
DECLARE new_zone_id UUID; i INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  INSERT INTO zones (warehouse_id, letter, name, color, width_cm, height_cm, depth_cm, pos_top, pos_right, pos_width, pos_height, display_order)
  VALUES (wh_id, UPPER(zone_letter), zone_name, zone_color, zone_width_cm, zone_height_cm, zone_depth_cm,
    6, 4, 18, 42, (SELECT COALESCE(MAX(display_order),0)+1 FROM zones WHERE warehouse_id = wh_id))
  RETURNING id INTO new_zone_id;
  FOR i IN 1..shelves_count LOOP
    INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes) VALUES (new_zone_id, i, 70, 4);
  END LOOP;
  RETURN new_zone_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_zone(
  z_id UUID, z_name TEXT DEFAULT NULL, z_color TEXT DEFAULT NULL,
  z_width_cm NUMERIC DEFAULT NULL, z_height_cm NUMERIC DEFAULT NULL, z_depth_cm NUMERIC DEFAULT NULL,
  z_pos_top NUMERIC DEFAULT NULL, z_pos_left NUMERIC DEFAULT NULL, z_pos_right NUMERIC DEFAULT NULL,
  z_pos_width NUMERIC DEFAULT NULL, z_pos_height NUMERIC DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  UPDATE zones SET name=COALESCE(z_name,name), color=COALESCE(z_color,color),
    width_cm=COALESCE(z_width_cm,width_cm), height_cm=COALESCE(z_height_cm,height_cm),
    depth_cm=COALESCE(z_depth_cm,depth_cm), pos_top=COALESCE(z_pos_top,pos_top),
    pos_left=z_pos_left, pos_right=z_pos_right,
    pos_width=COALESCE(z_pos_width,pos_width), pos_height=COALESCE(z_pos_height,pos_height)
  WHERE id = z_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.delete_zone(z_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  DELETE FROM zones WHERE id = z_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.add_shelf(z_id UUID, s_height_cm NUMERIC DEFAULT 70, s_max_boxes INTEGER DEFAULT 4)
RETURNS UUID AS $$
DECLARE new_shelf_id UUID; next_index INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  SELECT COALESCE(MAX(shelf_index),0)+1 INTO next_index FROM shelves WHERE zone_id = z_id;
  INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes)
  VALUES (z_id, next_index, s_height_cm, s_max_boxes) RETURNING id INTO new_shelf_id;
  RETURN new_shelf_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_shelf(s_id UUID, s_height_cm NUMERIC DEFAULT NULL, s_max_boxes INTEGER DEFAULT NULL, s_label TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  UPDATE shelves SET height_cm=COALESCE(s_height_cm,height_cm), max_boxes=COALESCE(s_max_boxes,max_boxes), label=COALESCE(s_label,label) WHERE id = s_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.delete_shelf(s_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  DELETE FROM shelves WHERE id = s_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.add_box_to_shelf(s_id UUID, b_description TEXT DEFAULT '', b_width_cm NUMERIC DEFAULT 50, b_height_cm NUMERIC DEFAULT 65)
RETURNS UUID AS $$
DECLARE z_letter TEXT; s_index INTEGER; next_box INTEGER; wh_id UUID; new_box_id UUID; new_code TEXT;
BEGIN
  SELECT z.letter, s.shelf_index, z.warehouse_id INTO z_letter, s_index, wh_id
  FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = s_id;
  IF z_letter IS NULL THEN RAISE EXCEPTION 'الرف غير موجود'; END IF;
  IF (SELECT COUNT(*) FROM boxes WHERE shelf_id = s_id) >= (SELECT max_boxes FROM shelves WHERE id = s_id) THEN
    RAISE EXCEPTION 'الرف ممتلئ بالصناديق';
  END IF;
  SELECT COALESCE(MAX(box_index),0)+1 INTO next_box FROM boxes WHERE shelf_id = s_id;
  new_code := z_letter || '-' || s_index || '-' || next_box;
  INSERT INTO boxes (warehouse_id, shelf_id, code, description, box_index, width_cm, height_cm)
  VALUES (wh_id, s_id, new_code, b_description, next_box, b_width_cm, b_height_cm) RETURNING id INTO new_box_id;
  RETURN new_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_warehouse_layout(wh_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'warehouse', (SELECT row_to_json(w) FROM warehouses w WHERE w.id = wh_id),
    'zones', COALESCE((
      SELECT json_agg(z_data ORDER BY (z_data->>'display_order')::int) FROM (
        SELECT json_build_object('id',z.id,'letter',z.letter,'name',z.name,'color',z.color,
          'width_cm',z.width_cm,'height_cm',z.height_cm,'depth_cm',z.depth_cm,
          'pos_top',z.pos_top,'pos_left',z.pos_left,'pos_right',z.pos_right,
          'pos_width',z.pos_width,'pos_height',z.pos_height,'display_order',z.display_order,
          'shelves', COALESCE((
            SELECT json_agg(sh ORDER BY (sh->>'shelf_index')::int) FROM (
              SELECT json_build_object('id',s.id,'shelf_index',s.shelf_index,'label',s.label,
                'height_cm',s.height_cm,'max_boxes',s.max_boxes) AS sh
              FROM shelves s WHERE s.zone_id = z.id AND s.deleted_at IS NULL
            ) AS sh_rows), '[]'::json)) AS z_data
        FROM zones z WHERE z.warehouse_id = wh_id AND z.deleted_at IS NULL
      ) AS z_rows), '[]'::json));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- [03] الصور + دلو التخزين
-- ============================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS photo_url TEXT;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sraj-photos','sraj-photos',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=true, file_size_limit=5242880,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
DROP POLICY IF EXISTS "anyone can view sraj photos" ON storage.objects;
CREATE POLICY "anyone can view sraj photos" ON storage.objects FOR SELECT USING (bucket_id = 'sraj-photos');
DROP POLICY IF EXISTS "authenticated can upload sraj photos" ON storage.objects;
CREATE POLICY "authenticated can upload sraj photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sraj-photos');
DROP POLICY IF EXISTS "users update own sraj photos" ON storage.objects;
CREATE POLICY "users update own sraj photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sraj-photos' AND (auth.uid() = owner OR public.is_founder(auth.uid())));
DROP POLICY IF EXISTS "users delete own sraj photos" ON storage.objects;
CREATE POLICY "users delete own sraj photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sraj-photos' AND (auth.uid() = owner OR public.is_founder(auth.uid())));

-- ============================================================
-- [04] add_shelf_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_shelf_at(z_id UUID, s_position TEXT DEFAULT 'bottom', s_height_cm NUMERIC DEFAULT 70, s_max_boxes INTEGER DEFAULT 4, s_label TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE new_shelf_id UUID; new_index INTEGER; shelves_count INTEGER;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  SELECT COUNT(*) INTO shelves_count FROM shelves WHERE zone_id = z_id;
  IF shelves_count = 0 THEN new_index := 1;
  ELSIF s_position = 'top' THEN SELECT MIN(shelf_index)-1 INTO new_index FROM shelves WHERE zone_id = z_id;
  ELSE SELECT MAX(shelf_index)+1 INTO new_index FROM shelves WHERE zone_id = z_id;
  END IF;
  INSERT INTO shelves (zone_id, shelf_index, height_cm, max_boxes, label)
  VALUES (z_id, new_index, s_height_cm, s_max_boxes, s_label) RETURNING id INTO new_shelf_id;
  RETURN new_shelf_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- [06] قيد فريد جزئي على رمز الصندوق
-- ============================================================
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_warehouse_id_code_key;
DROP INDEX IF EXISTS boxes_warehouse_id_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS boxes_warehouse_id_code_active ON boxes (warehouse_id, code) WHERE deleted_at IS NULL;

-- ============================================================
-- [07] add_box_at_position (النسخة النهائية — تستبدل 05)
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_box_at_position(s_id UUID, p_position INTEGER, b_description TEXT DEFAULT '', b_width_cm NUMERIC DEFAULT 50, b_height_cm NUMERIC DEFAULT 65)
RETURNS UUID AS $$
DECLARE z_letter TEXT; s_index INTEGER; wh_id UUID; new_box_id UUID; new_code TEXT; r RECORD;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  SELECT z.letter, s.shelf_index, z.warehouse_id INTO z_letter, s_index, wh_id
  FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = s_id;
  IF z_letter IS NULL THEN RAISE EXCEPTION 'الرف غير موجود'; END IF;
  IF p_position < 1 THEN p_position := 1; END IF;
  IF EXISTS (SELECT 1 FROM boxes WHERE shelf_id = s_id AND box_index = p_position AND deleted_at IS NULL) THEN
    FOR r IN SELECT id, box_index FROM boxes WHERE shelf_id = s_id AND box_index >= p_position AND deleted_at IS NULL ORDER BY box_index DESC LOOP
      UPDATE boxes SET box_index = r.box_index+1, code = z_letter||'-'||s_index||'-'||(r.box_index+1) WHERE id = r.id;
    END LOOP;
  END IF;
  new_code := z_letter||'-'||s_index||'-'||p_position;
  INSERT INTO boxes (warehouse_id, shelf_id, code, description, box_index, width_cm, height_cm)
  VALUES (wh_id, s_id, new_code, b_description, p_position, b_width_cm, b_height_cm) RETURNING id INTO new_box_id;
  RETURN new_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- [08] أغراض غير محدّدة المكان داخل مساحة
-- ============================================================
ALTER TABLE items ALTER COLUMN box_id DROP NOT NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS items_unassigned_in_zone_idx ON items (zone_id) WHERE box_id IS NULL AND deleted_at IS NULL;
UPDATE items i SET zone_id = (SELECT z.id FROM zones z JOIN shelves s ON s.zone_id = z.id JOIN boxes b ON b.shelf_id = s.id WHERE b.id = i.box_id)
WHERE i.zone_id IS NULL AND i.box_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.delete_box_keep_items(p_box_id UUID)
RETURNS VOID AS $$
DECLARE z_id UUID;
BEGIN
  SELECT z.id INTO z_id FROM zones z JOIN shelves s ON s.zone_id = z.id JOIN boxes b ON b.shelf_id = s.id WHERE b.id = p_box_id;
  IF z_id IS NULL THEN RAISE EXCEPTION 'الصندوق غير موجود أو لا ينتمي لمساحة'; END IF;
  UPDATE items SET box_id = NULL, zone_id = z_id WHERE box_id = p_box_id AND deleted_at IS NULL;
  UPDATE boxes SET deleted_at = NOW() WHERE id = p_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- [09] move_box_to_position
-- ============================================================
CREATE OR REPLACE FUNCTION public.move_box_to_position(p_box_id UUID, p_target_shelf_id UUID, p_target_position INTEGER)
RETURNS VOID AS $$
DECLARE src_shelf_id UUID; src_box_index INTEGER; src_zone_letter TEXT; src_shelf_index INTEGER;
  tgt_zone_letter TEXT; tgt_shelf_index INTEGER; tgt_warehouse_id UUID; r RECORD;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  SELECT shelf_id, box_index INTO src_shelf_id, src_box_index FROM boxes WHERE id = p_box_id AND deleted_at IS NULL;
  IF src_shelf_id IS NULL THEN RAISE EXCEPTION 'الصندوق غير موجود أو ليس له رفّ'; END IF;
  SELECT z.letter, s.shelf_index INTO src_zone_letter, src_shelf_index FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = src_shelf_id;
  SELECT z.letter, s.shelf_index, z.warehouse_id INTO tgt_zone_letter, tgt_shelf_index, tgt_warehouse_id FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = p_target_shelf_id;
  IF tgt_zone_letter IS NULL THEN RAISE EXCEPTION 'الرف الهدف غير موجود'; END IF;
  IF p_target_position < 1 THEN p_target_position := 1; END IF;
  IF src_shelf_id = p_target_shelf_id AND src_box_index = p_target_position THEN RETURN; END IF;
  UPDATE boxes SET box_index = -1, code = '__moving__'||p_box_id::TEXT WHERE id = p_box_id;
  IF src_shelf_id = p_target_shelf_id THEN
    IF p_target_position > src_box_index THEN
      FOR r IN SELECT id, box_index FROM boxes WHERE shelf_id = p_target_shelf_id AND box_index > src_box_index AND box_index <= p_target_position AND deleted_at IS NULL ORDER BY box_index ASC LOOP
        UPDATE boxes SET box_index = r.box_index-1, code = tgt_zone_letter||'-'||tgt_shelf_index||'-'||(r.box_index-1) WHERE id = r.id;
      END LOOP;
    ELSE
      FOR r IN SELECT id, box_index FROM boxes WHERE shelf_id = p_target_shelf_id AND box_index >= p_target_position AND box_index < src_box_index AND deleted_at IS NULL ORDER BY box_index DESC LOOP
        UPDATE boxes SET box_index = r.box_index+1, code = tgt_zone_letter||'-'||tgt_shelf_index||'-'||(r.box_index+1) WHERE id = r.id;
      END LOOP;
    END IF;
  ELSE
    FOR r IN SELECT id, box_index FROM boxes WHERE shelf_id = src_shelf_id AND box_index > src_box_index AND deleted_at IS NULL ORDER BY box_index ASC LOOP
      UPDATE boxes SET box_index = r.box_index-1, code = src_zone_letter||'-'||src_shelf_index||'-'||(r.box_index-1) WHERE id = r.id;
    END LOOP;
    IF EXISTS (SELECT 1 FROM boxes WHERE shelf_id = p_target_shelf_id AND box_index = p_target_position AND deleted_at IS NULL) THEN
      FOR r IN SELECT id, box_index FROM boxes WHERE shelf_id = p_target_shelf_id AND box_index >= p_target_position AND deleted_at IS NULL ORDER BY box_index DESC LOOP
        UPDATE boxes SET box_index = r.box_index+1, code = tgt_zone_letter||'-'||tgt_shelf_index||'-'||(r.box_index+1) WHERE id = r.id;
      END LOOP;
    END IF;
  END IF;
  UPDATE boxes SET shelf_id = p_target_shelf_id, box_index = p_target_position,
    code = tgt_zone_letter||'-'||tgt_shelf_index||'-'||p_target_position, warehouse_id = tgt_warehouse_id WHERE id = p_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- [10] تخزين خارج المساحات
-- ============================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS items_outside_zones_idx ON items (warehouse_id) WHERE box_id IS NULL AND zone_id IS NULL AND deleted_at IS NULL;

-- ============================================================
-- [11] target_type/target_id لسجلّ النشاط
-- ============================================================
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS target_id UUID;
CREATE INDEX IF NOT EXISTS activity_log_target_lookup_idx ON activity_log(target_type, target_id, created_at DESC);

-- ============================================================
-- [13] app_config + بريد الترحيب
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "founder all app_config" ON public.app_config;
CREATE POLICY "founder all app_config" ON public.app_config FOR ALL TO authenticated
  USING (public.is_founder(auth.uid())) WITH CHECK (public.is_founder(auth.uid()));

CREATE OR REPLACE FUNCTION public.send_welcome_email()
RETURNS TRIGGER AS $$
DECLARE resend_key TEXT; email_body JSONB;
BEGIN
  SELECT value INTO resend_key FROM public.app_config WHERE key = 'resend_api_key';
  IF resend_key IS NULL OR resend_key = '' THEN RETURN NEW; END IF;
  email_body := jsonb_build_object('from','onboarding@resend.dev','to',NEW.email,
    'subject','مرحباً بك في نظام إدارة مستودعات الجمعيّة',
    'html','<div dir="rtl" style="font-family: Arial, sans-serif;"><h2>مرحباً '||COALESCE(NEW.full_name,'')||' 👋</h2><p>تمّ إنشاء حسابك في نظام إدارة المستودعات.</p></div>');
  PERFORM net.http_post(url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||resend_key),
    body := email_body);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ملاحظة: بريد الترحيب يعمل فقط بعد تفعيل إضافة pg_net وإدخال مفتاح Resend:
--   INSERT INTO app_config (key, value) VALUES ('resend_api_key','re_xxx')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================
-- [14] وسوم الأغراض
-- ============================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS items_tags_gin_idx ON items USING gin(tags);

-- ============================================================
-- [15] حُزَم المبادرات
-- ============================================================
CREATE TABLE IF NOT EXISTS initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, color TEXT DEFAULT '#7B2D8E', icon TEXT DEFAULT '🎪',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(), deleted_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS initiatives_warehouse_idx ON initiatives(warehouse_id) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS initiative_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID REFERENCES initiatives(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1, notes TEXT, UNIQUE(initiative_id, item_id));
CREATE INDEX IF NOT EXISTS initiative_items_initiative_idx ON initiative_items(initiative_id);
ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- [16] تكديس الصناديق + التموضع الحرّ
-- ============================================================
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS stack_index INTEGER DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pos_top NUMERIC;
ALTER TABLE items ADD COLUMN IF NOT EXISTS pos_left NUMERIC;
ALTER TABLE items ADD COLUMN IF NOT EXISTS width_pct NUMERIC DEFAULT 10;
ALTER TABLE items ADD COLUMN IF NOT EXISTS height_pct NUMERIC DEFAULT 10;

CREATE OR REPLACE FUNCTION public.add_stacked_box(p_below_box_id UUID, b_description TEXT DEFAULT '', b_width_cm NUMERIC DEFAULT 50, b_height_cm NUMERIC DEFAULT 30)
RETURNS UUID AS $$
DECLARE src_shelf_id UUID; src_box_index INTEGER; src_stack_index INTEGER; z_letter TEXT; s_index INTEGER; wh_id UUID; new_stack INTEGER; new_box_id UUID; new_code TEXT;
BEGIN
  IF NOT public.is_founder(auth.uid()) THEN RAISE EXCEPTION 'محظور: للمؤسّس فقط'; END IF;
  SELECT b.shelf_id, b.box_index, b.stack_index, z.letter, s.shelf_index, z.warehouse_id
    INTO src_shelf_id, src_box_index, src_stack_index, z_letter, s_index, wh_id
  FROM boxes b JOIN shelves s ON s.id = b.shelf_id JOIN zones z ON z.id = s.zone_id
  WHERE b.id = p_below_box_id AND b.deleted_at IS NULL;
  IF src_shelf_id IS NULL THEN RAISE EXCEPTION 'الصندوق السفلي غير موجود'; END IF;
  SELECT COALESCE(MAX(stack_index),-1)+1 INTO new_stack FROM boxes WHERE shelf_id = src_shelf_id AND box_index = src_box_index AND deleted_at IS NULL;
  IF new_stack = 0 THEN new_code := z_letter||'-'||s_index||'-'||src_box_index;
  ELSE new_code := z_letter||'-'||s_index||'-'||src_box_index||'.'||(new_stack+1); END IF;
  INSERT INTO boxes (warehouse_id, shelf_id, code, description, box_index, stack_index, width_cm, height_cm)
  VALUES (wh_id, src_shelf_id, new_code, b_description, src_box_index, new_stack, b_width_cm, b_height_cm) RETURNING id INTO new_box_id;
  RETURN new_box_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- [17] أغراض كبيرة تشغل موقع صندوق على الرفّ
-- ============================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS shelf_id UUID REFERENCES shelves(id) ON DELETE CASCADE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS box_index INTEGER;
ALTER TABLE items ADD COLUMN IF NOT EXISTS stack_index INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS items_shelf_slot_idx ON items (shelf_id, box_index) WHERE box_id IS NULL AND deleted_at IS NULL;

-- ============================================================
-- [18] تشديد RLS حسب عضوية المستودع
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_can_access_warehouse(wh_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_founder(auth.uid()) OR (wh_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_warehouses uw WHERE uw.user_id = auth.uid() AND uw.warehouse_id = wh_id AND uw.approved = true));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_is_wh_manager(wh_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_founder(auth.uid()) OR (wh_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_warehouses uw WHERE uw.user_id = auth.uid() AND uw.warehouse_id = wh_id AND uw.role = 'whmanager' AND uw.approved = true));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.item_effective_warehouse(p_box_id UUID, p_zone_id UUID, p_shelf_id UUID, p_warehouse_id UUID)
RETURNS UUID AS $$
  SELECT CASE
    WHEN p_box_id IS NOT NULL THEN (SELECT warehouse_id FROM boxes WHERE id = p_box_id)
    WHEN p_shelf_id IS NOT NULL THEN (SELECT z.warehouse_id FROM shelves s JOIN zones z ON z.id = s.zone_id WHERE s.id = p_shelf_id)
    WHEN p_zone_id IS NOT NULL THEN (SELECT warehouse_id FROM zones WHERE id = p_zone_id)
    ELSE p_warehouse_id END;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS "auth all boxes" ON boxes;
CREATE POLICY "wh members boxes" ON boxes FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id)) WITH CHECK (public.user_can_access_warehouse(warehouse_id));
DROP POLICY IF EXISTS "auth all checkouts" ON checkouts;
CREATE POLICY "wh members checkouts" ON checkouts FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id)) WITH CHECK (public.user_can_access_warehouse(warehouse_id));
DROP POLICY IF EXISTS "auth all damaged" ON damaged_items;
CREATE POLICY "wh members damaged" ON damaged_items FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id)) WITH CHECK (public.user_can_access_warehouse(warehouse_id));
DROP POLICY IF EXISTS "auth all donated" ON donated_items;
CREATE POLICY "wh members donated" ON donated_items FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id)) WITH CHECK (public.user_can_access_warehouse(warehouse_id));
DROP POLICY IF EXISTS "auth all initiatives" ON initiatives;
CREATE POLICY "wh members initiatives" ON initiatives FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(warehouse_id)) WITH CHECK (public.user_can_access_warehouse(warehouse_id));
DROP POLICY IF EXISTS "auth all items" ON items;
CREATE POLICY "wh members items" ON items FOR ALL TO authenticated
  USING (public.user_can_access_warehouse(public.item_effective_warehouse(box_id, zone_id, shelf_id, warehouse_id)))
  WITH CHECK (public.user_can_access_warehouse(public.item_effective_warehouse(box_id, zone_id, shelf_id, warehouse_id)));
DROP POLICY IF EXISTS "auth all initiative_items" ON initiative_items;
CREATE POLICY "wh members initiative_items" ON initiative_items FOR ALL TO authenticated
  USING (public.user_can_access_warehouse((SELECT warehouse_id FROM initiatives WHERE id = initiative_id)))
  WITH CHECK (public.user_can_access_warehouse((SELECT warehouse_id FROM initiatives WHERE id = initiative_id)));
DROP POLICY IF EXISTS "auth all user_warehouses" ON user_warehouses;
CREATE POLICY "uw select" ON user_warehouses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_is_wh_manager(warehouse_id));
CREATE POLICY "uw write" ON user_warehouses FOR ALL TO authenticated
  USING (public.user_is_wh_manager(warehouse_id)) WITH CHECK (public.user_is_wh_manager(warehouse_id));
DROP POLICY IF EXISTS "auth all join_requests" ON join_requests;
CREATE POLICY "jr insert auth" ON join_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "jr select" ON join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_is_wh_manager(warehouse_id));
CREATE POLICY "jr update" ON join_requests FOR UPDATE TO authenticated
  USING (public.user_is_wh_manager(warehouse_id)) WITH CHECK (public.user_is_wh_manager(warehouse_id));
CREATE POLICY "jr delete" ON join_requests FOR DELETE TO authenticated USING (public.user_is_wh_manager(warehouse_id));
DROP POLICY IF EXISTS "auth all log" ON activity_log;
CREATE POLICY "log select" ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "log insert" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "log update founder" ON activity_log FOR UPDATE TO authenticated
  USING (public.is_founder(auth.uid())) WITH CHECK (public.is_founder(auth.uid()));
CREATE POLICY "log delete founder" ON activity_log FOR DELETE TO authenticated USING (public.is_founder(auth.uid()));

-- ============================================================
-- ✅ انتهى الإعداد. الخطوات التالية (يدويّاً):
--   1. Authentication > Users > Add user:
--        البريد: h.felemban@sraj.org.sa  (مع Auto Confirm User)
--   2. نفّذ في SQL Editor:
--        SELECT public.bootstrap_founder('h.felemban@sraj.org.sa');
--   3. (اختياري) لبريد الترحيب: فعّل إضافة pg_net من Database > Extensions
--        ثمّ أدخل مفتاح Resend في app_config.
-- ============================================================
SELECT '✅ تم إعداد قاعدة بيانات Sraj-Warehouse الجديدة بالكامل!' AS status;
