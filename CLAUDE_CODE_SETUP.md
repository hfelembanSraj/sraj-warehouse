# 💻 دليل إعداد المشروع على جهاز جديد

> **الغرض:** تشغيل مشروع *Sraj-Warehouse* ومواصلة تطويره على أي حاسوب آخر تملكه.
> **الوقت المتوقّع:** 15–20 دقيقة (مرّة واحدة لكل جهاز).
>
> كل ملفّات المشروع وسياقه محفوظة على GitHub — هذا الدليل يجعل أي جهاز جاهزاً
> للعمل عليه بنفس قدرة جهازك الحالي تماماً.

---

## ما الذي ينتقل تلقائياً وما الذي تُعدّه يدوياً

| العنصر | الحالة |
|:---|:---|
| كود الموقع كاملاً | ✅ ينتقل عبر GitHub (خطوة الاستنساخ) |
| سياق المشروع وقراراته (ملف `CLAUDE.md`) | ✅ ينتقل مع الكود — يقرأه Claude Code تلقائياً |
| قاعدة البيانات والموقع المنشور | ✅ في السحابة — لا شيء تُعيد إعداده |
| ملف `.env` (مفاتيح Supabase) | ⚙️ تُنشئه يدوياً (الخطوة 6 — انسخ والصق) |
| البرامج (Node, Git, Claude Code) | ⚙️ تُثبّتها مرّة واحدة (الخطوات 1–4) |

---

## الخطوة 1 — تثبيت Node.js

1. افتح: **https://nodejs.org**
2. حمّل النسخة المكتوب عليها **LTS** (نسخة 20 أو أحدث).
3. ثبّتها بالضغط Next حتى النهاية.

**للتحقّق:** افتح **PowerShell** واكتب `node --version` — يجب أن يظهر رقم مثل `v20.x` أو أعلى.

---

## الخطوة 2 — تثبيت Git

1. افتح: **https://git-scm.com/download/win** (سيبدأ التحميل تلقائياً على ويندوز).
2. ثبّته بالإعدادات الافتراضية (Next حتى النهاية).

**للتحقّق:** في PowerShell اكتب `git --version` — يجب أن يظهر رقم إصدار.

---

## الخطوة 3 — تثبيت Claude Code

افتح **PowerShell كمسؤول** (اضغط يمين على أيقونته ← Run as Administrator) وألصق:

```powershell
irm https://claude.ai/install.ps1 | iex
```

ثمّ أغلق PowerShell وافتحه من جديد، ونفّذ `claude --version` للتأكّد.
(على Mac/Linux استخدم بدلاً منه: `curl -fsSL https://claude.ai/install.sh | bash`)

---

## الخطوة 4 — ربط حساب GitHub (حتى تستطيع حفظ تعديلاتك)

ثبّت أداة GitHub CLI من **https://cli.github.com** ، ثمّ في PowerShell:

```
gh auth login
```

اختر: **GitHub.com** ← **HTTPS** ← **Login with a web browser** ، وسجّل الدخول
بحساب الجمعيّة `hfelembanSraj`. هذا يسمح بحفظ تعديلاتك على GitHub من هذا الجهاز.

---

## الخطوة 5 — تنزيل المشروع (الاستنساخ)

اختر مكاناً للمشروع (مثلاً قرص `D:`)، وفي PowerShell نفّذ:

```
cd D:\
git clone https://github.com/hfelembanSraj/sraj-warehouse.git Sraj-Warehouse
cd Sraj-Warehouse
```

سيُنشأ مجلّد `D:\Sraj-Warehouse` يحوي المشروع كاملاً.

---

## الخطوة 6 — إنشاء ملف `.env`

ملف `.env` يحوي مفاتيح الاتصال بقاعدة البيانات، وهو غير محفوظ على GitHub لأسباب
تنظيميّة. أنشئه يدوياً مرّة واحدة:

1. داخل مجلّد `D:\Sraj-Warehouse` أنشئ ملفاً جديداً اسمه بالضبط: **`.env`**
2. ضع فيه هذين السطرين بالضبط:

```
VITE_SUPABASE_URL=https://grlucvdrgcdmdpevwkfm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdybHVjdmRyZ2NkbWRwZXZ3a2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1OTMsImV4cCI6MjA5NTgxMjU5M30.enF9FW30HMrBcjfOgM11_BnHdF_Cj9kJvdI2p3Jjby0
```

> هذا المفتاح من نوع "anon" — آمن (يظهر أصلاً داخل كود الموقع المنشور للجميع)،
> فلا حرج من نسخه. إن لم يعمل مستقبلاً فستجد القيمة المحدّثة في
> لوحة Supabase ← Project Settings ← API.

---

## الخطوة 7 — تجهيز المشروع وتشغيله

في PowerShell داخل `D:\Sraj-Warehouse`:

```
npm.cmd install
npm.cmd run dev
```

- `npm.cmd install` ينزّل مكتبات المشروع (مرّة واحدة، قد يأخذ دقيقة-دقيقتين).
- `npm.cmd run dev` يشغّل نسخة تجريبيّة محليّة — افتح الرابط الذي يظهر (عادةً
  `http://localhost:5173`) في المتصفّح.

> ملاحظة: على ويندوز نستخدم `npm.cmd` وليس `npm`.

---

## الخطوة 8 — بدء العمل مع Claude Code

في PowerShell داخل مجلّد المشروع، اكتب:

```
claude
```

ستُفتح جلسة Claude **داخل مجلّد المشروع**، وسيقرأ ملف `CLAUDE.md` تلقائياً فيعرف
كل شيء عن المشروع. ألصق هذه الرسالة الافتتاحية:

```
السلام عليكم. هذا مشروع Sraj-Warehouse على جهاز جديد.
اقرأ CLAUDE.md ثمّ HANDOVER.md، وتحقّق من git log والموقع المباشر،
ثمّ أخبرني بحالة المشروع وما يمكننا العمل عليه.
```

---

## حفظ تعديلاتك ونشرها (من أي جهاز)

بعد أي تغيير، يحفظه Claude Code وينشره عبر:

```
git add -A
git commit -m "وصف التغيير"
git push
```

`git push` يرفع التعديل إلى GitHub، ومنه ينشر Vercel الموقع تلقائياً خلال دقيقتين.

> **تنبيه مهم:** إن عملت على جهازين، نفّذ `git pull` **قبل** بدء العمل في كل
> مرّة لتجلب آخر التعديلات — حتى لا تتعارض النسخ.

---

## حلول سريعة لمشاكل شائعة

| المشكلة | الحلّ |
|:---|:---|
| `claude: command not found` | أغلق PowerShell وافتحه من جديد بعد التثبيت |
| `npm` لا يعمل | استخدم `npm.cmd` بدلاً منه على ويندوز |
| الموقع المحلّي صفحة بيضاء | تأكّد أن ملف `.env` موجود وفيه السطران بالضبط |
| `git push` يطلب كلمة مرور | أعِد الخطوة 4 (`gh auth login`) |
| تعارض عند `git pull` | أخبر Claude Code بالرسالة كاملة وسيحلّها معك |
