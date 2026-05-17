import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import BrandLogo, { BrandStripe } from '../components/BrandLogo';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', warehouseIds: [] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('warehouses').select('id, name').then(({ data }) => {
      if (data) setWarehouses(data);
    });
  }, []);

  function toggleWarehouse(id) {
    setForm(f => ({
      ...f,
      warehouseIds: f.warehouseIds.includes(id)
        ? f.warehouseIds.filter(x => x !== id)
        : [...f.warehouseIds, id]
    }));
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    if (form.warehouseIds.length === 0) {
      setError('اختر مستودعاً واحداً على الأقل');
      return;
    }
    setLoading(true);
    const { error } = await signUp(form.email, form.password, form.fullName, form.warehouseIds);
    setLoading(false);
    if (error) {
      setError(error.message || 'حدث خطأ أثناء التسجيل');
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 to-orange-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3 text-2xl">✓</div>
          <h2 className="text-lg font-display font-bold mb-2">تم إرسال طلبك بنجاح</h2>
          <p className="text-sm text-stone-600 mb-4">ستتلقّى إشعاراً عند موافقة مدير كلّ مستودع على طلبك.</p>
          <p className="text-xs text-stone-400">جاري التحويل لصفحة الدخول...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-stone-50 via-white to-pink-50/30 p-4">
      <BrandStripe height={5} animated className="fixed top-0 left-0 right-0 z-50" />
      <div className="flex-1 flex items-center justify-center pt-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
            <div className="relative bg-gradient-to-br from-brand-navy to-brand-purple px-8 py-6 text-center text-white">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-xl mb-2 p-1.5">
                <BrandLogo size={52} />
              </div>
              <h1 className="text-base font-display font-bold">إنشاء حساب جديد</h1>
              <p className="text-[11px] opacity-80 mt-0.5">طلب الانضمام لمستودع</p>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-stripe" />
            </div>

            <div className="p-7">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-lg text-sm mb-4">{error}</div>
              )}

              <form onSubmit={handleSignup} className="space-y-3">
                <div>
                  <label className="block text-xs text-stone-700 font-medium mb-1.5">الاسم الكامل</label>
                  <input type="text" required value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})}
                    className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs text-stone-700 font-medium mb-1.5">البريد الإلكتروني</label>
                  <input type="email" required value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
                    className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs text-stone-700 font-medium mb-1.5">كلمة المرور (6 أحرف على الأقل)</label>
                  <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({...form, password: e.target.value})}
                    className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/20 outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs text-stone-700 font-medium mb-1.5">
                    المستودعات المطلوبة
                    <span className="text-stone-400 font-normal"> (يمكنك اختيار أكثر من مستودع)</span>
                  </label>
                  <div className="border border-stone-300 rounded-lg divide-y divide-stone-100 max-h-44 overflow-y-auto">
                    {warehouses.length === 0 ? (
                      <p className="text-xs text-stone-400 text-center py-4">جاري تحميل المستودعات...</p>
                    ) : warehouses.map(w => {
                      const checked = form.warehouseIds.includes(w.id);
                      return (
                        <label key={w.id}
                          className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm transition ${checked ? 'bg-brand-navy/5' : 'hover:bg-stone-50'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleWarehouse(w.id)}
                            className="w-4 h-4 accent-brand-navy shrink-0" />
                          <span className="flex-1">{w.name}</span>
                          {checked && <span className="text-brand-navy text-xs font-bold">✓</span>}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1.5">
                    {form.warehouseIds.length > 0
                      ? `سيُرسَل طلب انضمام لـ ${form.warehouseIds.length} مستودع — يوافق عليه مدير كلّ مستودع`
                      : 'اختر مستودعاً واحداً على الأقل'}
                  </p>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-l from-brand-navy to-brand-purple text-white py-3 rounded-lg text-sm font-bold hover:shadow-lg transition disabled:opacity-50 mt-2 shadow-md">
                  {loading ? 'جاري الإرسال...' : 'إرسال طلب الانضمام'}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-stone-200 text-center">
                <Link to="/login" className="text-sm text-brand-navy font-medium hover:text-brand-pink transition">→ الرجوع لتسجيل الدخول</Link>
              </div>
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
