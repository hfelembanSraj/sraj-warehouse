import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import CheckoutModal from './CheckoutModal';
import PhotoUploader from './PhotoUploader';
import { shelfDisplayName } from '../lib/helpers';
import { EditBoxForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import { updateBox, deleteBox, softDeleteItem } from '../lib/warehouseOps';

export default function BoxView({ zone, shelf, box, onBackToMap, onBackToZone, onBackToShelf, onRefresh }) {
  const { isFounder, can } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  // الصندوق الحديث (يُحدَّث محليّاً بعد التعديل)
  const [currentBox, setCurrentBox] = useState(box);

  useEffect(() => {
    setCurrentBox(box);
    loadItems();
  }, [box.id]);

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase.from('items').select('*').eq('box_id', box.id).is('deleted_at', null).order('name');
    setItems(data || []);
    setLoading(false);
  }

  async function refreshBox() {
    const { data } = await supabase.from('boxes').select('*').eq('id', box.id).single();
    if (data) setCurrentBox(data);
  }

  async function handleUpdate(patch) {
    setBusy(true);
    const { error } = await updateBox(box.id, patch);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditing(false);
    await refreshBox();
    await onRefresh();
  }

  async function handleDeleteBox() {
    setBusy(true);
    const { error } = await deleteBox(box.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف الصندوق');
    await onRefresh();
    onBackToShelf();
  }

  async function handleUpdateItem(item, patch) {
    setBusy(true);
    const { error } = await supabase.from('items').update(patch).eq('id', item.id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditingItemId(null);
    await loadItems();
    await onRefresh();
  }

  async function handleDeleteItem(item) {
    setBusy(true);
    const { error } = await softDeleteItem(item.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم النقل لسلّة المحذوفات');
    await loadItems();
    await onRefresh();
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
          <button onClick={onBackToShelf} className="hover:underline">{shelfDisplayName(shelf, zone?.shelves || [])}</button>
          <span className="text-stone-300">‹</span>
          <span className="font-medium text-amber-700">صندوق {currentBox.code}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-3">
            {currentBox.photo_url ? (
              <img src={currentBox.photo_url} alt={currentBox.code}
                className="w-20 h-20 object-cover rounded-lg border border-amber-200 cursor-zoom-in"
                onClick={() => window.open(currentBox.photo_url, '_blank')} />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-3xl">📦</div>
            )}
            <div>
              <h2 className="text-sm font-display font-bold">صندوق {currentBox.code}</h2>
              {currentBox.description && <p className="text-xs text-stone-500">{currentBox.description}</p>}
              <p className="text-[10px] text-stone-400 mt-0.5">
                {currentBox.width_cm}×{currentBox.height_cm}سم · في {shelfDisplayName(shelf, zone?.shelves || [])} من مساحة {zone.letter}
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
              box={currentBox}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={handleUpdate}
            />
          </div>
        )}

        {/* الأصناف */}
        <div className="border-t border-stone-200 pt-4">
          <h3 className="text-xs font-display font-bold mb-3 text-stone-700">📋 الأصناف ({items.length})</h3>
          {loading ? (
            <p className="text-center text-sm text-stone-400 py-8">جاري التحميل...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-stone-400 py-8">الصندوق فارغ</p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                  <div className="p-3 flex items-center gap-3">
                    {it.photo_url ? (
                      <img src={it.photo_url} alt={it.name}
                        className="w-14 h-14 object-cover rounded border border-stone-200 cursor-zoom-in"
                        onClick={() => window.open(it.photo_url, '_blank')} />
                    ) : (
                      <div className="w-14 h-14 rounded bg-stone-100 flex items-center justify-center text-xl">🔧</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium truncate">{it.name}</h4>
                      <p className="text-[10px] text-stone-500">الكميّة: {it.quantity}</p>
                    </div>
                    <div className="flex gap-1">
                      {can('checkout') && (
                        <button onClick={() => setCheckoutItem({ ...it, boxCode: currentBox.code, boxId: currentBox.id })}
                          className="text-[10px] bg-brand-blue text-white px-2.5 py-1.5 rounded hover:bg-blue-800">
                          إخراج
                        </button>
                      )}
                      {(isFounder || can('edit')) && (
                        <button onClick={() => setEditingItemId(editingItemId === it.id ? null : it.id)} disabled={busy}
                          className="text-[10px] border border-stone-300 px-2 py-1.5 rounded hover:bg-stone-100">
                          ✏️
                        </button>
                      )}
                      {(isFounder || can('delete')) && (
                        <button onClick={() => setConfirming({ type: 'item', item: it })} disabled={busy}
                          className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded hover:bg-red-100">
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                  {editingItemId === it.id && (
                    <div className="bg-stone-50 border-t border-stone-200 p-3">
                      <EditItemInline
                        item={it}
                        busy={busy}
                        onCancel={() => setEditingItemId(null)}
                        onSave={(patch) => handleUpdateItem(it, patch)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} onSaved={() => { loadItems(); onRefresh(); }} />}
      {confirming?.type === 'box' && (
        <ConfirmDelete
          message={items.length > 0
            ? `⚠️ يحتوي هذا الصندوق على ${items.length} ${items.length === 1 ? 'صنف' : 'أصناف'}. سيُحذف الصندوق وكل الأصناف بداخله (يمكن استرجاعها من سلّة المحذوفات لاحقاً).`
            : `سيُحذف الصندوق ${currentBox.code}. هل أنت متأكّد؟`
          }
          busy={busy}
          onConfirm={handleDeleteBox}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming?.type === 'item' && (
        <ConfirmDelete
          message={`سيُحذف الصنف "${confirming.item.name}". هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={() => handleDeleteItem(confirming.item)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}

// نموذج تعديل صنف داخل الصندوق
function EditItemInline({ item, busy, onCancel, onSave }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [photoUrl, setPhotoUrl] = useState(item.photo_url || null);
  const dirty =
    name !== item.name ||
    Number(quantity) !== Number(item.quantity) ||
    photoUrl !== (item.photo_url || null);

  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الاسم</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الكميّة</label>
          <input type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <PhotoUploader
            value={photoUrl}
            onChange={setPhotoUrl}
            prefix="items"
            label="صورة الصنف"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ name: name.trim(), quantity: Number(quantity), photo_url: photoUrl })}
          disabled={busy || !dirty || !name.trim()}
          className="flex-1 bg-brand-blue text-white py-1.5 rounded text-xs font-medium hover:bg-blue-800 disabled:opacity-30">
          💾 حفظ
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}
