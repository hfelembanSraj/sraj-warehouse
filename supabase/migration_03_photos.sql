-- ============================================
-- ترقية رقم 03: دعم الصور للأدوات والصناديق
-- ============================================

-- 1. إضافة حقل photo_url إلى الجداول
ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. إنشاء Bucket للصور (إن لم يكن موجوداً)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sraj-photos',
  'sraj-photos',
  true,                                              -- عام للقراءة
  5242880,                                           -- 5MB حد أقصى للصورة
  ARRAY['image/jpeg', 'image/png', 'image/webp']     -- صيغ مسموحة فقط
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 3. سياسات الوصول
-- القراءة: متاحة للجميع (anon + authenticated) — لأنّ الـ bucket public
DROP POLICY IF EXISTS "anyone can view sraj photos" ON storage.objects;
CREATE POLICY "anyone can view sraj photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sraj-photos');

-- الرفع: للمستخدمين المُصادَقين فقط
DROP POLICY IF EXISTS "authenticated can upload sraj photos" ON storage.objects;
CREATE POLICY "authenticated can upload sraj photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sraj-photos');

-- التحديث: للمستخدم الذي رفع الملف فقط، أو المؤسّس
DROP POLICY IF EXISTS "users update own sraj photos" ON storage.objects;
CREATE POLICY "users update own sraj photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'sraj-photos' AND (auth.uid() = owner OR public.is_founder(auth.uid())));

-- الحذف: للمالك أو المؤسّس
DROP POLICY IF EXISTS "users delete own sraj photos" ON storage.objects;
CREATE POLICY "users delete own sraj photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'sraj-photos' AND (auth.uid() = owner OR public.is_founder(auth.uid())));

SELECT '✅ ترقية الصور (03) جاهزة' AS status;
