-- ============================================
-- ترقية رقم 13: إصلاح بريد الترحيب — جدول إعدادات عوضاً عن ALTER DATABASE
-- (Supabase لا يسمح للمستخدم بـ ALTER DATABASE في SQL Editor)
-- ============================================

-- 1) جدول إعدادات عامّ (مفتاح/قيمة) — للأسرار التي يحتاجها التطبيق
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) RLS: لا أحد يستطيع قراءته أو الكتابة فيه إلّا المؤسّس
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founder all app_config" ON public.app_config;
CREATE POLICY "founder all app_config" ON public.app_config
  FOR ALL TO authenticated
  USING (public.is_founder(auth.uid()))
  WITH CHECK (public.is_founder(auth.uid()));

-- 3) إعادة تعريف دالّة بريد الترحيب لتقرأ من الجدول
CREATE OR REPLACE FUNCTION public.send_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  resend_key TEXT;
  email_body JSONB;
BEGIN
  SELECT value INTO resend_key FROM public.app_config WHERE key = 'resend_api_key';
  IF resend_key IS NULL OR resend_key = '' THEN
    RETURN NEW;
  END IF;

  email_body := jsonb_build_object(
    'from', 'onboarding@resend.dev',
    'to', NEW.email,
    'subject', 'مرحباً بك في نظام إدارة مستودعات الجمعيّة',
    'html',
      '<div dir="rtl" style="font-family: ''Tajawal'', Arial, sans-serif; color: #1A1A1A; max-width: 600px; margin: auto;">' ||
      '<div style="height: 6px; background: linear-gradient(90deg, #E91E8B, #7B2D8E, #2196F3, #00A8B5, #6CB33E, #FFCC00, #F58220);"></div>' ||
      '<div style="padding: 24px;">' ||
      '<h2 style="color: #1A2B5F;">مرحباً ' || COALESCE(NEW.full_name, '') || ' 👋</h2>' ||
      '<p>تمّ إنشاء حسابك في <strong>نظام إدارة المستودعات</strong> الخاصّ بـ:</p>' ||
      '<p style="background: #F3F4F6; padding: 12px; border-radius: 8px; font-weight: bold; color: #1A2B5F;">جمعيّة المسؤوليّة الاجتماعيّة بمحافظة جدّة</p>' ||
      '<p>إن كنت قد طلبت الانضمام لمستودع، ستصلك رسالة أخرى عند الموافقة من مدير المستودع.</p>' ||
      '<p><a href="https://sraj-warehouse.vercel.app" style="display: inline-block; background: linear-gradient(90deg, #1A2B5F, #7B2D8E); color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold;">افتح النظام</a></p>' ||
      '<hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">' ||
      '<p style="font-size: 12px; color: #6B7280;">هذه رسالة تلقائيّة. إن لم تكن أنت من سجّل، تجاهل هذه الرسالة.</p>' ||
      '</div></div>'
  );

  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || resend_key
    ),
    body := email_body
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- التشغيل: نفّذ هذا الملف، ثمّ نفّذ هذا السطر بالمفتاح الفعلي:
--   INSERT INTO app_config (key, value) VALUES ('resend_api_key', 're_xxx')
--     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

SELECT '✅ ترقية 13 (جدول إعدادات لمفتاح Resend) جاهزة' AS status;
