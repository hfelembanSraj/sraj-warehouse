import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', warehouseId: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('warehouses').select('id, name').then(({ data }) => {
      if (data) {
        setWarehouses(data);
        if (data.length > 0) setForm(f => ({ ...f, warehouseId: data[0].id }));
      }
    });
  }, []);

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signUp(form.email, form.password, form.fullName, form.warehouseId);
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
          <p className="text-sm text-stone-600 mb-4">ستتلقّى إشعاراً عند موافقة مدير المستودع على طلبك.</p>
          <p className="text-xs text-stone-400">جاري التحويل لصفحة الدخول...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 to-orange-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-display font-bold text-stone-900">إنشاء حساب جديد</h1>
            <p className="text-sm text-stone-500 mt-1">طلب الانضمام لمستودع</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-lg text-sm mb-4">{error}</div>
          )}

          <form onSubmit={handleSignup} className="space-y-3">
            <div>
              <label className="block text-xs text-stone-600 mb-1.5">الاسم الكامل</label>
              <input type="text" required value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})}
                className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-blue outline-none" />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1.5">البريد الإلكتروني</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
                className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-blue outline-none" />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1.5">كلمة المرور (6 أحرف على الأقل)</label>
              <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({...form, password: e.target.value})}
                className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-blue outline-none" />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1.5">المستودع المطلوب</label>
              <select required value={form.warehouseId} onChange={(e) => setForm({...form, warehouseId: e.target.value})}
                className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-blue outline-none bg-white">
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-brand-blue text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50 mt-2">
              {loading ? 'جاري الإرسال...' : 'إرسال طلب الانضمام'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-stone-200 text-center">
            <Link to="/login" className="text-sm text-brand-blue hover:underline">→ الرجوع لتسجيل الدخول</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
