import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandLogo, { BrandStripe } from '../components/BrandLogo';

const REMEMBER_KEY = 'sraj.rememberMe';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // وضع الشاشة: login = دخول · forgot = استرجاع كلمة المرور
  const [mode, setMode] = useState('login');
  const [resetInfo, setResetInfo] = useState('');

  async function handleResetRequest(e) {
    e.preventDefault();
    setError('');
    setResetInfo('');
    if (!email.trim()) { setError('أدخل بريدك الإلكتروني أوّلاً'); return; }
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) {
      setError('تعذّر الإرسال: ' + error.message);
    } else {
      setResetInfo(`أُرسل رابط استرجاع كلمة المرور إلى ${email.trim()}. افتح بريدك واتبع الرابط.`);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem(REMEMBER_KEY);
    if (stored) {
      const { remember, lastEmail } = JSON.parse(stored);
      setRememberMe(remember);
      if (remember && lastEmail) setEmail(lastEmail);
    }
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError('بيانات الدخول غير صحيحة');
    } else {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ remember: true, lastEmail: email }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-stone-50 via-white to-pink-50/30 p-4">
      {/* شريط ألوان الجمعيّة العلوي */}
      <BrandStripe height={5} animated className="fixed top-0 left-0 right-0 z-50" />

      <div className="flex-1 flex items-center justify-center pt-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
            {/* الرأس بألوان الجمعيّة */}
            <div className="relative bg-gradient-to-br from-brand-navy to-brand-purple px-8 py-7 text-center text-white">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl shadow-xl mb-3 p-2">
                <BrandLogo size={64} />
              </div>
              <h1 className="text-lg font-display font-bold leading-tight">جمعيّة المسؤوليّة الاجتماعيّة</h1>
              <p className="text-xs opacity-90 mt-0.5">بمحافظة جدّة</p>
              <p className="text-[11px] opacity-75 mt-2">نظام إدارة المستودعات</p>
              {/* خط ألوان أسفل الرأس */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-stripe" />
            </div>

            <div className="p-8">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              {resetInfo && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-2.5 rounded-lg text-sm mb-4">
                  ✅ {resetInfo}
                </div>
              )}

              {mode === 'login' ? (
                <>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs text-stone-700 font-medium mb-1.5">البريد الإلكتروني</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition"
                        placeholder="example@sra.org"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-700 font-medium mb-1.5">كلمة المرور</label>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition"
                        dir="ltr"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded accent-brand-navy cursor-pointer"
                        />
                        <span>إبقني مسجّلاً على هذا الجهاز</span>
                      </label>
                      <button type="button"
                        onClick={() => { setMode('forgot'); setError(''); setResetInfo(''); }}
                        className="text-xs text-brand-navy hover:text-brand-pink font-medium transition">
                        نسيت كلمة المرور؟
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-l from-brand-navy to-brand-purple text-white py-3 rounded-lg text-sm font-bold hover:shadow-lg hover:opacity-95 transition disabled:opacity-50 shadow-md"
                    >
                      {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
                    </button>
                  </form>

                  <div className="mt-5 pt-5 border-t border-stone-200 text-center">
                    <Link to="/signup" className="text-sm text-brand-navy font-medium hover:text-brand-pink transition">
                      ليس لديك حساب؟ سجّل الآن
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3 rounded-lg mb-4">
                    🔑 أدخل بريدك الإلكتروني المسجَّل وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
                  </div>
                  <form onSubmit={handleResetRequest} className="space-y-4">
                    <div>
                      <label className="block text-xs text-stone-700 font-medium mb-1.5">البريد الإلكتروني المسجَّل</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition"
                        placeholder="example@sra.org"
                        dir="ltr"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-l from-brand-navy to-brand-purple text-white py-3 rounded-lg text-sm font-bold hover:shadow-lg hover:opacity-95 transition disabled:opacity-50 shadow-md"
                    >
                      {loading ? 'جاري الإرسال...' : '📧 أرسل رابط الاسترجاع'}
                    </button>
                  </form>

                  <div className="mt-5 pt-5 border-t border-stone-200 text-center">
                    <button onClick={() => { setMode('login'); setError(''); setResetInfo(''); }}
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
