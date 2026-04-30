import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError('بيانات الدخول غير صحيحة');
    } else {
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 to-orange-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-brand-blue text-white mb-3 font-display text-2xl font-bold">س</div>
            <h1 className="text-xl font-display font-bold text-stone-900">جمعية المسؤولية الاجتماعية</h1>
            <p className="text-sm text-stone-500 mt-1">نظام إدارة المستودعات</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-stone-600 mb-1.5">البريد الإلكتروني</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-blue outline-none transition"
                placeholder="example@sra.org"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-600 mb-1.5">كلمة المرور</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:border-brand-blue outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-blue text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50"
            >
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-stone-200 text-center">
            <Link to="/signup" className="text-sm text-brand-blue hover:underline">
              ليس لديك حساب؟ سجّل الآن
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">© 2026 جمعية المسؤولية الاجتماعية</p>
      </div>
    </div>
  );
}
