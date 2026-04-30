import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function FounderTab({ onRefresh }) {
  const { user, profile, refreshProfile } = useAuth();
  const [stealth, setStealth] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    if (profile) {
      setStealth(!!profile.stealth_mode);
      setFullName(profile.full_name || '');
      setEmail(profile.email || '');
    }
  }, [profile]);

  useEffect(() => {
    supabase.rpc('health_check').then(({ data }) => setHealth(data));
  }, []);

  function flash(text, kind = 'success') {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 4000);
  }

  async function toggleStealth() {
    setBusy(true);
    const next = !stealth;
    const { data, error } = await supabase.rpc('toggle_stealth_mode', { enable: next });
    setBusy(false);
    if (error) return flash('فشل التبديل: ' + error.message, 'error');
    setStealth(next);
    await refreshProfile();
    flash(data || (next ? 'تم تفعيل التخفّي' : 'تم إيقاف التخفّي'));
  }

  async function saveName() {
    if (!fullName.trim()) return flash('الاسم مطلوب', 'error');
    setBusy(true);
    const { error: rpcErr } = await supabase.rpc('update_founder_profile', {
      new_full_name: fullName.trim(),
      new_email: null
    });
    setBusy(false);
    if (rpcErr) return flash('فشل الحفظ: ' + rpcErr.message, 'error');
    await refreshProfile();
    flash('تم تحديث الاسم');
  }

  async function changeEmail() {
    if (!email.trim() || email === profile?.email) return flash('أدخل بريداً جديداً مختلفاً', 'error');
    setBusy(true);
    const { error: authErr } = await supabase.auth.updateUser({ email: email.trim() });
    if (authErr) {
      setBusy(false);
      return flash('فشل التحديث: ' + authErr.message, 'error');
    }
    const { error: rpcErr } = await supabase.rpc('update_founder_profile', {
      new_full_name: null,
      new_email: email.trim()
    });
    setBusy(false);
    if (rpcErr) return flash('تحديث جزئي — راجع الحالة: ' + rpcErr.message, 'error');
    await refreshProfile();
    flash('📧 تمّ إرسال رابط تأكيد للبريد الجديد. التحديث يكتمل بعد التأكيد.');
  }

  return (
    <div className="space-y-4">
      {/* رأس الصفحة */}
      <div className="bg-gradient-to-l from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-2xl">👑</div>
          <div>
            <h2 className="text-base font-display font-bold text-amber-900">لوحة المؤسّس</h2>
            <p className="text-xs text-amber-700">صلاحيات كاملة • محميّ من الحذف • قابل للنقل</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.kind === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {msg.text}
        </div>
      )}

      {/* بطاقة وضع التخفّي */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-sm flex items-center gap-2">
              <span className="text-lg">👻</span> وضع التخفّي
            </h3>
            <p className="text-xs text-stone-600 mt-1">
              عند التفعيل: أعمالك لن تُسجَّل في السجل ولن يراها أحد. خاص بك أنت فقط.
            </p>
          </div>
          <button
            onClick={toggleStealth}
            disabled={busy}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${stealth ? 'bg-stone-900' : 'bg-stone-300'} disabled:opacity-50`}
            aria-label="تبديل وضع التخفّي"
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white transition transform ${stealth ? '-translate-x-1' : '-translate-x-6'}`} />
          </button>
        </div>
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${stealth ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>
          الحالة: {stealth ? '👻 مفعّل — أنت غير مرئي في السجل' : '👁 مغلق — أعمالك تُسجَّل عادياً'}
        </div>
      </div>

      {/* بطاقة تغيير الاسم */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="font-display font-bold text-sm mb-3">✏️ تغيير الاسم</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="الاسم الكامل"
            className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
            disabled={busy}
          />
          <button
            onClick={saveName}
            disabled={busy || !fullName.trim() || fullName === profile?.full_name}
            className="px-4 py-2 bg-brand-blue text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-stone-300"
          >
            حفظ
          </button>
        </div>
      </div>

      {/* بطاقة تغيير البريد */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="font-display font-bold text-sm mb-2">📧 نقل الحساب لبريد جديد</h3>
        <p className="text-xs text-stone-600 mb-3">
          سيُرسَل رابط تأكيد للبريد الجديد. كل الصلاحيات والسجلات تنتقل تلقائياً.
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="البريد الإلكتروني الجديد"
            className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
            disabled={busy}
            dir="ltr"
          />
          <button
            onClick={changeEmail}
            disabled={busy || !email.trim() || email === profile?.email}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:bg-stone-300"
          >
            إرسال تأكيد
          </button>
        </div>
        <p className="text-[10px] text-stone-500 mt-2">
          البريد الحالي: <span dir="ltr" className="font-mono">{profile?.email}</span>
        </p>
      </div>

      {/* بطاقة الصحة */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="font-display font-bold text-sm mb-3">🩺 صحة النظام</h3>
        {health ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-green-50 border border-green-200 rounded-lg p-2">
              <div className="text-green-700 font-bold">الحالة</div>
              <div className="text-green-900">{health.status === 'ok' ? '✅ سليم' : '⚠️ ' + health.status}</div>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-2">
              <div className="text-stone-600">المستخدمون</div>
              <div className="text-stone-900 font-bold">{health.profiles_count}</div>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-2">
              <div className="text-stone-600">المستودعات</div>
              <div className="text-stone-900 font-bold">{health.warehouses_count}</div>
            </div>
            <div className={`border rounded-lg p-2 ${health.has_founder ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
              <div className="text-stone-600">المؤسّس</div>
              <div className="font-bold">{health.has_founder ? '👑 مُعيَّن' : '⚠️ غير معيَّن'}</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-500">جاري الفحص...</p>
        )}
      </div>

      {/* تذكير الحماية */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
        <p className="font-bold mb-1">🛡 ملاحظات الحماية:</p>
        <ul className="list-disc pr-5 space-y-1">
          <li>حسابك المؤسّس <strong>لا يمكن حذفه</strong> أبداً، لا من الواجهة ولا حتى من قاعدة البيانات.</li>
          <li>تملك كل الصلاحيات تلقائياً، لا حاجة لتعيينها يدوياً.</li>
          <li>المؤسّس <strong>وحيد</strong> في النظام، لا يمكن إنشاء مؤسّس ثانٍ من الواجهة.</li>
          <li>عند نقل البريد، انتظر رسالة Supabase وانقر رابط التأكيد.</li>
        </ul>
      </div>
    </div>
  );
}
