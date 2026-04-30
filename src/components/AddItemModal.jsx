import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { suggestLocation } from '../lib/helpers';
import { ZONE_CATEGORIES } from '../lib/constants';

export default function AddItemModal({ data, onClose, onSaved }) {
  const { warehouseId } = useAuth();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [category, setCategory] = useState('events');
  const [loading, setLoading] = useState(false);

  const suggestedCode = useMemo(() => suggestLocation(category, data.boxes), [category, data.boxes]);

  async function handleSubmit() {
    if (!name.trim()) { alert('الرجاء إدخال اسم الأداة'); return; }
    setLoading(true);
    try {
      // ابحث عن الصندوق المقترح أو أنشئه
      let { data: existingBox } = await supabase.from('boxes').select('*').eq('warehouse_id', warehouseId).eq('code', suggestedCode).maybeSingle();
      if (!existingBox) {
        const { data: newBox } = await supabase.from('boxes').insert({ warehouse_id: warehouseId, code: suggestedCode }).select().single();
        existingBox = newBox;
      }
      // أضف الأداة
      await supabase.from('items').insert({
        box_id: existingBox.id,
        name: name.trim(),
        quantity: qty,
        status: 'ok'
      });
      await logActivity('إضافة', `${name.trim()} × ${qty}`, suggestedCode);
      onSaved();
    } catch (e) {
      alert('حدث خطأ: ' + e.message);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 animate-fade-in">
        <h3 className="text-sm font-display font-bold mb-3">إضافة أداة جديدة</h3>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs text-stone-600 mb-1">اسم الأداة</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="مثال: حبال تجاذب"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
          </div>
          <div>
            <label className="block text-xs text-stone-600 mb-1">الكمية</label>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
          </div>
          <div>
            <label className="block text-xs text-stone-600 mb-1">الفئة</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white">
              {Object.entries(ZONE_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v.name} ({v.letter})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3 rounded-lg mb-4">
          🤖 <strong>اقتراح ذكي:</strong> الموقع الأنسب هو <strong className="text-blue-950">{suggestedCode}</strong>
        </div>

        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 bg-brand-blue text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-800 disabled:opacity-50">
            {loading ? 'جاري الحفظ...' : 'حفظ'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
