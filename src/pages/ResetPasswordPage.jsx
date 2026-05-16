import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import BrandLogo, { BrandStripe } from '../components/BrandLogo';

// صفحة تعيين كلمة مرور جديدة — يصلها المستخدم عبر رابط الاسترجاع في بريده
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [ready, setReady] = useState(false);   // هل جلسة الاسترجاع جاهزة؟
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase يعالج رمز الاسترجاع من رابط البريد تلقائياً
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    // قد تكون الجلسة جاهزة قبل تسجيل المستمع
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    // مهلة احتياط: أظهر النموذج بعد ثانيتين حتى لو لم نلتقط الحدث
    const t = setTimeout(() => setReady(true), 2500);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) { setError('تعذّر التحديث: ' + (error.message || 'خطأ')); return; }
    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate('/login'), 3500);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-stone-50 via-white to-pink-50/30 p-4">
      <BrandStripe height={5} animated className="fixed top-0 left-0 right-0 z-50" />
      <div className="flex-1 flex items-center justify-center pt-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
            <div className="relative bg-gradient-to-br from-brand-navy to-brand-purple px-8 py-7 text-center text-white">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-xl mb-3 p-2">
                <BrandLogo size={52} />
              </div>
              <h1 className="text-base font-display font-bold">تعيين كلمة مرور جديدة</h1>
              <p className="text-[11px] opacity-80 mt-0.5">جمعيّة المسؤوليّة الاجتماعيّة</p>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-stripe" />
            </div>

            <div className="p-8">
              {done ? (
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3 text-2xl">✓</div>
                  <h2 className="text-base font-display font-bold mb-2">تمّ تغيير كلمة المرور</h2>
                  <p className="text-sm text-stone-600 mb-2">يمكنك الآن الدخول بكلمة المرور الجديدة.</p>
                  <p className="text-xs text-stone-400">جاري التحويل لصفحة الدخول...</p>
                </div>
              ) : !ready ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 border-3 border-brand-navy border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-sm text-stone-600">جارٍ التحقّق من رابط الاسترجاع...</p>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-lg text-sm mb-4">
                      {error}
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs text-stone-700 font-medium mb-1.5">كلمة المرور الجديدة (6 أحرف على الأقل)</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-700 font-medium mb-1.5">تأكيد كلمة المرور</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition"
                        dir="ltr"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-l from-brand-navy to-brand-purple text-white py-3 rounded-lg text-sm font-bold hover:shadow-lg hover:opacity-95 transition disabled:opacity-50 shadow-md"
                    >
                      {loading ? 'جاري الحفظ...' : '🔒 حفظ كلمة المرور الجديدة'}
                    </button>
                  </form>
                  <div className="mt-5 pt-5 border-t border-stone-200 text-center">
                    <button onClick={() => navigate('/login')}
                      className="text-sm text-brand-navy font-medium hover:text-brand-pink transition">
                      → الرجوع لتسجيل الدخول
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-stone-400 mt-4">
            © 2026 جمعيّة المسؤوليّة الاجتماعيّة بمحافظة جدّة
          </p>
        </div>
      </div>
    </div>
  );
}
