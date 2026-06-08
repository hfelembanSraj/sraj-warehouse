import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';

export default function AddBoxModal({ slotCode, shelfId, onClose, onSaved }) {
  const { warehouseId } = useAuth();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await supabase.from('boxes').insert({
        warehouse_id: warehouseId,
        shelf_id: shelfId || null,
        code: slotCode,
        description: description.trim() || null
      });
      await logActivity('إضافة صندوق', description.trim() || 'صندوق فارغ', slotCode);
      onSaved();
    } catch (e) {
      alert('حدث خطأ: ' + e.message);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl max-w-sm w-full p-5">
        <h3 className="text-sm font-display font-bold mb-3 dark:text-stone-200">إنشاء صندوق {slotCode}</h3>
        <div className="mb-4">
          <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">وصف الصندوق (اختياري)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="مثال: صندوق أدوات احتياطية"
            className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 bg-brand-blue text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-800 disabled:opacity-50">
            {loading ? 'جاري الإنشاء...' : 'إنشاء'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
