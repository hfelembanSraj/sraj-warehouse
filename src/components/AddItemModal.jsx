import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { suggestLocation } from '../lib/helpers';
import PhotoUploader from './PhotoUploader';

export default function AddItemModal({ data, onClose, onSaved }) {
  const { warehouseId } = useAuth();
  const zones = data.zones || [];
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [zoneLetter, setZoneLetter] = useState(zones[0]?.letter || 'A');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (zones.length > 0 && !zones.find(z => z.letter === zoneLetter)) {
      setZoneLetter(zones[0].letter);
    }
  }, [zones, zoneLetter]);

  const suggestion = useMemo(() => suggestLocation(zoneLetter, data.boxes, zones), [zoneLetter, data.boxes, zones]);
  const suggestedCode = typeof suggestion === 'string' ? suggestion : suggestion.code;
  const suggestedShelfId = typeof suggestion === 'string' ? null : suggestion.shelfId;

  async function handleSubmit() {
    if (!name.trim()) { alert('الرجاء إدخال اسم الأداة'); return; }
    setLoading(true);
    try {
      let { data: existingBox } = await supabase.from('boxes').select('*').eq('warehouse_id', warehouseId).eq('code', suggestedCode).is('deleted_at', null).maybeSingle();
      if (!existingBox) {
        const { data: newBox } = await supabase.from('boxes')
          .insert({ warehouse_id: warehouseId, code: suggestedCode, shelf_id: suggestedShelfId })
          .select().single();
        existingBox = newBox;
      }
      await supabase.from('items').insert({
        box_id: existingBox.id,
        name: name.trim(),
        quantity: qty,
        status: 'ok',
        photo_url: photoUrl
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
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl max-w-md w-full p-5 animate-fade-in">
        <h3 className="text-sm font-display font-bold mb-3 dark:text-stone-200">إضافة أداة جديدة</h3>

        {zones.length === 0 ? (
          <>
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs p-3 rounded-lg mb-4">
              ⚠️ لا توجد مساحات تخزين في هذا المستودع. اطلب من المؤسّس إنشاء مساحات أوّلاً.
            </div>
            <button onClick={onClose} className="w-full px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
              إغلاق
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">اسم الأداة</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: حبال تجاذب"
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
              </div>
              <div>
                <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">الكمية</label>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
              </div>
              <div>
                <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">المساحة</label>
                <select value={zoneLetter} onChange={(e) => setZoneLetter(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-xs bg-white dark:bg-stone-800 dark:text-stone-200">
                  {zones.map(z => (
                    <option key={z.id} value={z.letter}>{z.name} ({z.letter})</option>
                  ))}
                </select>
              </div>
              <PhotoUploader
                value={photoUrl}
                onChange={setPhotoUrl}
                prefix="items"
                label="صورة الأداة (اختياريّة)"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs p-3 rounded-lg mb-4">
              🤖 <strong>اقتراح ذكي:</strong> الموقع الأنسب هو <strong className="text-blue-950 dark:text-blue-100">{suggestedCode}</strong>
            </div>

            <div className="flex gap-2">
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-brand-blue text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-800 disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={onClose} className="px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
                إلغاء
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
