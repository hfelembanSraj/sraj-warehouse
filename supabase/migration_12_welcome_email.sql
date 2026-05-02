-- ============================================
-- ترقية رقم 12: بريد الترحيب التلقائي عند تسجيل المستخدمين
-- يستخدم pg_net (مُتاح في Supabase) لاستدعاء Resend API
-- ============================================
-- خطوة مطلوبة بعد التنفيذ:
--   ضع مفتاح Resend في إعدادات قاعدة البيانات (مرّة واحدة):
--   ALTER DATABASE postgres SET app.resend_api_key = 're_xxxxxxxxxxxx';
--   (استبدل re_xxx بالمفتاح الفعلي — موجود في GitHub Secret RESEND_API_KEY)

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.send_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  resend_key TEXT;
  email_body JSONB;
BEGIN
  resend_key := current_setting('app.resend_api_key', true);
  -- إن لم يُضبَط المفتاح، تخطّى بصمت (لا تعطّل التسجيل)
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

DROP TRIGGER IF EXISTS welcome_email_on_signup ON profiles;
CREATE TRIGGER welcome_email_on_signup
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.send_welcome_email();

SELECT '✅ ترقية 12 (بريد الترحيب) جاهزة — ضَع المفتاح بـ ALTER DATABASE' AS status;
