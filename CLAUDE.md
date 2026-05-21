# CLAUDE.md — Sraj-Warehouse

> هذا الملف يقرأه Claude Code تلقائياً في بداية كل جلسة. وهو **ذاكرة المشروع
> المحمولة**: يسافر مع الكود على GitHub، فيمكن تطوير الموقع من أي جهاز بكامل
> السياق. للسجلّ التفصيلي الكامل اقرأ أيضاً `HANDOVER.md`.

---

## 0. المالك وكيفية التواصل معه

- **المالك:** حسين — مؤسّس *جمعية المسؤولية الاجتماعية بمحافظة جدّة* (جهة سعودية غير ربحية).
- **البريد:** `evuon1@gmail.com` · **GitHub:** `hussain-HHS`.
- **غير مبرمج.** تواصل معه **بالعربية الفصحى** دائماً. استخدم الجداول والقوائم
  القصيرة لا الفقرات الطويلة. اشرح كل أمر طرفية بالعربية.
- **حاسم:** للقرارات التقنية الروتينية اختر الأفضل ونفّذ — لا تسأل "أ أم ب؟".
  لكن **اسأله** في القرارات التجارية/المنتج/الهوية، و**قبل أي إجراء خارجي خطير**
  (نشر، حذف، تعديل قاعدة بيانات، مصاريف) — يلزم "نعم/ابدأ" صريحة.
- **قواعد تجربة الاستخدام:** أزرار "حفظ" صريحة (لا حفظ تلقائي) · أزرار الإنشاء
  العامّة خارج سياق العنصر · كل التعديلات في مودالات مركزيّة · تنقّل هرمي متدرّج.
- **المظهر الداكن:** يكره الأبيض الفاقع — كل سطح فاتح يجب أن يحمل نسخة `dark:`،
  ولون النصّ الداكن مُلطَّف (`#bdb9b1`). لا تستخدم `text-white`/`stone-100` على خلفية داكنة.

تفاصيل أوسع لكل ما سبق في مجلّد ذاكرة Claude المحليّة (إن وُجد) وفي `HANDOVER.md`.

---

## 1. ما هو المشروع

نظام إدارة مستودعات (Warehouse Management) لعُدّة المبادرات التشغيلية للجمعية —
ليس مواد غذائية. تنقّل هرمي: مستودعات ← مساحات (zones) ← أرفف ← صناديق ← أصناف.
يدعم الإخراج/الإرجاع، المتلفات، الدعم، المبادرات، التقارير، QR، الصور.

---

## 2. التقنيات والاستضافة (كلها مجانية بالكامل — قيد إلزامي: ميزانية صفر)

| الطبقة | الأداة |
|:---|:---|
| الواجهة | React 18 + Vite 5 + Tailwind 3 (RTL) · React Router 6 |
| الخلفية | Supabase (Postgres + Auth + Storage) |
| الاستضافة | Vercel (نشر تلقائي من فرع `main`) |
| مكتبات | `@supabase/supabase-js`, `qrcode`, `qr-scanner`, `browser-image-compression`, `xlsx` |

- **لا تقترح أي خدمة مدفوعة** دون سؤاله صراحةً. PWA مُؤجَّل؛ Capacitor/متاجر التطبيقات مؤجَّلة.

---

## 3. البنية السحابية الحيّة

| الموقع | القيمة |
|:---|:---|
| الموقع المباشر | `https://sraj-warehouse.vercel.app` |
| مستودع GitHub | `https://github.com/hussain-HHS/-sraj-warehouse` (لاحظ الشرطة البادئة — لا تُصحّحها) |
| Supabase | المرجع `tfrzyiyoromlgmcissvu` — `https://tfrzyiyoromlgmcissvu.supabase.co` |
| Vercel | team `team_yjSVfkDNYdlWJjwbF1itNeHR` · project `prj_uoHMF49IQMc8xJAQSYhQDPoDhyTE` |
| استقرار الإنتاج | Cron-job.org (إبقاء Supabase حيّاً) · GitHub Actions (نسخ احتياطي يومي) · UptimeRobot · Resend (تنبيهات + بريد ترحيب) |

كل الحسابات على بريد `evuon1@gmail.com`. حساب المؤسّس في النظام هو نفسه — صلاحيات كاملة، غير قابل للحذف، وضع تخفٍّ اختياري.

---

## 4. الحالة الحاليّة (آخر تحديث: 2026-05-17 — الجلسة 3)

النظام **في الإنتاج ويعمل**. أُنجز في الجلسة 3:

- **ترقية 18 (`migration_18`) مُطبَّقة على قاعدة البيانات:** تشديد RLS — كل
  مستودع معزول؛ المستخدم يصل فقط لمستودعاته (`user_warehouses`, approved). المؤسّس
  يتجاوز كل القيود عبر `is_founder()`. تدفّقات anon محفوظة.
- **التسجيل متعدّد المستودعات:** صفحة التسجيل تختار عدّة مستودعات (طلب لكلٍّ).
- **الأغراض الحرّة على الخريطة:** تتحرّك بحرّية في الفراغ لكن **ممنوع تداخلها مع
  مساحات التخزين** (`FreeItemSquare` + `obstacles`). المساحات ثابتة لا تتحرّك أبداً.
- **المظهر الداكن:** لُطِّف عالمياً (`index.css`: `#e7e5e4`→`#bdb9b1`) ومُسِح
  الأبيض الفاقع في `WarehouseMap` و`ZoneView`.
- **`ZoneView`:** تحديد موحّد للصناديق + الأغراض الكبيرة معاً، وحذف جماعي للاثنين،
  وتكديس صندوق فوق غرض.
- **التقارير:** الأغراض الكبيرة/غير المحدّدة تظهر بموقعها (`resolveItemLocation`)؛
  مكتبة xlsx تُحمَّل عند الطلب فقط.

نقاط مؤجَّلة معروفة: راجع قسم "Outstanding" في `HANDOVER.md`.

---

## 5. خريطة الكود

```
src/
  pages/        LoginPage, SignupPage, ResetPasswordPage, Dashboard
  context/      AuthContext  (user, profile, permissions, warehouses, can(), isFounder)
  components/   WarehouseMap, ZoneView, BoxView, ShelfView, LocationPicker,
                ReportsTab, InitiativesTab, CheckoutsTab, RecoveryBin, FounderTab,
                UsersTab, RequestsTab, BuilderForms, CardboardBox, FreeItemSquare, ...
  lib/          supabase.js, helpers.js, constants.js, warehouseOps.js,
                photoUpload.js, useKeyboard.js, useTheme.js
supabase/       setup.sql + migration_02 .. migration_18  (كلها مُطبَّقة)
.github/        workflows: backup, notify-overdue, ...
```

- **`ShelfView.jsx` ليس كوداً ميّتاً** رغم ما قد يوحي به `HANDOVER`. هو موصول
  بالتنقّل وقابل للوصول عبر روابط QR العميقة — لا تحذفه.
- `warehouseOps.js` = المصدر الوحيد لتعديلات البنية (إنشاء/نقل/حذف) وحذف ناعم متتالٍ.
- `Dashboard.loadAllData` فيه فلاتر دقيقة (`deleted_at`, `shelf_id NOT NULL`) — لا تكسرها.

---

## 6. الإعداد على جهاز جديد + النشر

- **جهاز جديد:** اتبع `CLAUDE_CODE_SETUP.md` (دليل عربي خطوة بخطوة: تثبيت
  Node + Git + Claude Code، استنساخ المستودع، إنشاء `.env`، `npm install`).
- **النشر:** `git push` إلى `main` ⟵ Vercel ينشر تلقائياً. تحقّق من حالة النشر.
- **ترقيات SQL:** ملفات `supabase/migration_*.sql` تُطبَّق على Supabase (SQL Editor
  أو عبر MCP). أضِف ملفاً جديداً مرقّماً — لا تُعدّل القديمة.
- **أوامر Windows:** PowerShell يمنع `npm.ps1` — استخدم `npm.cmd`. استخدم Bash لـ git/gh.

---

## 7. كيف تبدأ جلسة جديدة (على أي جهاز)

1. اقرأ هذا الملف كاملاً ثم `HANDOVER.md`.
2. تحقّق من الموقع المباشر، ومن `git status` و`git log`.
3. راجع آخر ملاحظات المستخدم في المحادثة وأعطها الأولويّة.
4. لا تكسر طبقات الاستقرار (Cron, backup, UptimeRobot, البريد).
5. عند الشكّ في نيّة المستخدم — اسأل سؤالاً واحداً بدل بناء خاطئ.
