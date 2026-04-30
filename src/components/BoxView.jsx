import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import CheckoutModal from './CheckoutModal';
import { EditBoxForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import { updateBox, deleteBox } from '../lib/warehouseOps';

export default function BoxView({ zone, shelf, box, onBackToMap, onBackToZone, onBackToShelf, onRefresh }) {
  const { isFounder, can } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  useEffect(() => {
    loadItems();
  }, [box.id]);

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase.from('items').select('*').eq('box_id', box.id);
    setItems(data || []);
    setLoading(false);
  }

  async function handleUpdate(patch) {
    setBusy(true);
    const { error } = await updateBox(box.id, patch);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditing(false);
    await onRefresh();
  }

  async function handleDelete() {
    setBusy(true);
    const { error } = await deleteBox(box.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف الصندوق');
    await onRefresh();
    onBackToShelf();
  }

  return (
    <>
      <StatusToast msg={msg} />

      {/* شريط التنقّل */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-xs">
        <button onClick={onBackToShelf} className="px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100">→ الرجوع للرف</button>
        <div className="text-stone-500 flex items-center gap-1">
          <button onClick={onBackToMap} className="hover:underline">المستودع</button>
          <span className="text-stone-300">‹</span>
          <button onClick={onBackToZone} className="hover:underline" style={{ color: zone.color }}>مساحة {zone.letter}</button>
          <span className="text-stone-300">‹</span>
          <button onClick={onBackToShelf} className="hover:underline">رف {shelf.shelf_index}</button>
          <span className="text-stone-300">‹</span>
          <span className="font-medium text-amber-700">صندوق {box.code}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-2xl">📦</div>
            <div>
              <h2 className="text-sm font-display font-bold">صندوق {box.code}</h2>
              {box.description && <p className="text-xs text-stone-500">{box.description}</p>}
              <p className="text-[10px] text-stone-400 mt-0.5">
                {box.width_cm}×{box.height_cm}سم · في رف {shelf.shelf_index} من مساحة {zone.letter}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isFounder && (
              <>
                <button onClick={() => setEditing(e => !e)} disabled={busy}
                  className="text-[11px] border border-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100">
                  ✏️ تعديل
                </button>
                <button onClick={() => setConfirming({ type: 'box' })} disabled={busy}
                  className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100">
                  🗑 حذف
                </button>
              </>
            )}
          </div>
        </div>

        {isFounder && editing && (
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mb-4">
            <h4 className="text-xs font-display font-bold mb-2">✏️ تعديل بيانات الصندوق</h4>
            <EditBoxForm
              box={box}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={handleUpdate}
            />
          </div>
        )}

        {/* الأصناف داخل الصندوق */}
        <div className="border-t border-stone-200 pt-4">
          <h3 className="text-xs font-display font-bold mb-3 text-stone-700">📋 الأصناف داخل الصندوق ({items.length})</h3>
          {loading ? (
            <p className="text-center text-sm text-stone-400 py-8">جاري التحميل...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-stone-400 py-8">الصندوق فارغ</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-stone-50">
                <tr>
                  <th className="text-center p-2 font-medium text-stone-600">م</th>
                  <th className="text-center p-2 font-medium text-stone-600">الأداة</th>
                  <th className="text-center p-2 font-medium text-stone-600">الكمية</th>
                  <th className="text-center p-2 font-medium text-stone-600">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className="border-t border-stone-100">
                    <td className="p-2 text-center">{i + 1}</td>
                    <td className="p-2 text-center">{it.name}</td>
                    <td className="p-2 text-center">{it.quantity}</td>
                    <td className="p-2 text-center">
                      {can('checkout') && (
                        <button onClick={() => setCheckoutItem({ ...it, boxCode: box.code, boxId: box.id })}
                          className="text-[10px] bg-brand-blue text-white px-2 py-1 rounded hover:bg-blue-800">
                          إخراج
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} onSaved={() => { loadItems(); onRefresh(); }} />}
      {confirming?.type === 'box' && (
        <ConfirmDelete
          message={`سيُحذف الصندوق ${box.code} مع كل أصنافه. هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
