import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { todayStr } from '../lib/helpers';
import { DEFAULT_RETURN_DAYS } from '../lib/constants';

export default function CheckoutModal({ item, onClose, onSaved }) {
  const { user, profile, warehouseId } = useAuth();
  const [qty, setQty] = useState(1);
  const [purpose, setPurpose] = useState('initiative');
  const [initiative, setInitiative] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const n = Number(qty);
    // حارس الكمية: لا تسمح بإخراج أقل من 1 أو أكثر من المتاح
    if (!Number.isFinite(n) || n < 1) {
      alert('أدخل كميّة صحيحة (1 على الأقل)');
      return;
    }
    setLoading(true);
    try {
      // قراءة الكميّة المتاحة فعلياً الآن (تقلّل خطر التزامن وتمنع تجاوز المتاح)
      const { data: fresh, error: freshErr } = await supabase
        .from('items').select('quantity').eq('id', item.id).single();
      if (freshErr || !fresh) {
        setLoading(false);
        return alert('تعذّر التحقّق من الكميّة المتاحة. حاول مجدّداً.');
      }
      if (n > fresh.quantity) {
        setLoading(false);
        return alert(`الكميّة المتاحة ${fresh.quantity} فقط — لا يمكن إخراج ${n}.`);
      }

      // إنشاء سجل الإخراج
      await supabase.from('checkouts').insert({
        warehouse_id: warehouseId,
        box_id: item.boxId,
        box_code: item.boxCode,
        item_id: item.id,
        item_name: item.name,
        quantity: n,
        user_id: user.id,
        user_name: profile?.full_name || 'مستخدم',
        purpose,
        initiative: purpose === 'initiative' ? (initiative.trim() || 'غير محدّد') : null,
        date_out: todayStr()
      });

      // تخفيض الكمية في الصندوق (بناءً على القيمة المحدّثة)
      const newQty = fresh.quantity - n;
      if (newQty <= 0) {
        await supabase.from('items').delete().eq('id', item.id);
      } else {
        await supabase.from('items').update({ quantity: newQty }).eq('id', item.id);
      }

      await logActivity('إخراج', `${item.name} × ${qty}` + (purpose === 'personal' ? ' (شخصي)' : ''), item.boxCode);
      onSaved();
    } catch (e) {
      console.error(e);
      alert('حدث خطأ: ' + e.message);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl max-w-md w-full p-5 animate-fade-in">
        <h3 className="text-sm font-display font-bold mb-3 dark:text-stone-200">إخراج: {item.name}</h3>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">الكمية (متاح: {item.quantity})</label>
            <input type="number" min={1} max={item.quantity} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
          </div>
          <div>
            <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">الغرض من الإخراج</label>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-xs bg-white dark:bg-stone-800 dark:text-stone-200">
              <option value="initiative">مبادرة / فعالية</option>
              <option value="personal">غرض شخصي (لن تُرجَع)</option>
            </select>
          </div>
          {purpose === 'initiative' && (
            <div>
              <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">اسم المبادرة / الفعالية</label>
              <input type="text" value={initiative} onChange={(e) => setInitiative(e.target.value)}
                placeholder="مثال: مبادرة فعاليات عمال المصانع"
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
            </div>
          )}
        </div>

        {purpose === 'initiative' && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs p-2.5 rounded-lg mb-3">
            📅 المهلة الافتراضية للإرجاع: <strong>{DEFAULT_RETURN_DAYS} أيام</strong> من تاريخ اليوم. سيظهر تنبيه شديد عند تجاوز المهلة.
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm">
            {loading ? 'جاري الحفظ...' : 'تأكيد الإخراج'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
