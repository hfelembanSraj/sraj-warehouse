import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import { restoreBox, restoreItem, permanentDeleteBox, permanentDeleteItem } from '../lib/warehouseOps';

export default function RecoveryBin({ onRefresh }) {
  const { isFounder, warehouses } = useAuth();
  const [boxes, setBoxes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [tab, setTab] = useState('boxes');
  const [msg, flash] = useFlash();

  useEffect(() => {
    if (isFounder) loadDeleted();
  }, [isFounder]);

  async function loadDeleted() {
    setLoading(true);
    const [boxesR, itemsR] = await Promise.all([
      supabase.from('boxes')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase.from('items')
        .select('*, boxes(code, warehouse_id)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
    ]);
    setBoxes(boxesR.data || []);
    setItems(itemsR.data || []);
    setLoading(false);
  }

  function whName(whId) {
    return warehouses.find(w => w.id === whId)?.name || '—';
  }

  function daysSince(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  async function handleRestoreBox(box) {
    setBusy(true);
    const { error } = await restoreBox(box.id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تم استرجاع الصندوق ${box.code}`);
    await loadDeleted();
    await onRefresh();
  }

  async function handleRestoreItem(item) {
    setBusy(true);
    const { error } = await restoreItem(item.id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تم استرجاع "${item.name}"`);
    await loadDeleted();
    await onRefresh();
  }

  async function handlePermanentDelete() {
    setBusy(true);
    let error;
    if (confirming.type === 'box') {
      ({ error } = await permanentDeleteBox(confirming.box.id));
    } else if (confirming.type === 'item') {
      ({ error } = await permanentDeleteItem(confirming.item.id));
    }
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحذف نهائياً');
    await loadDeleted();
  }

  if (!isFounder) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-sm text-stone-500">
        هذه الصفحة للمؤسّس فقط.
      </div>
    );
  }

  return (
    <>
      <StatusToast msg={msg} />

      <div className="bg-gradient-to-l from-red-50 to-orange-50 border border-red-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-2xl">🗑</div>
          <div>
            <h2 className="text-base font-display font-bold text-red-900">سلّة المحذوفات</h2>
            <p className="text-xs text-red-700">العناصر المحذوفة قابلة للاسترجاع. الحذف النهائي لا رجعة فيه.</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="bg-stone-50 border-b border-stone-200 p-1 flex gap-1">
          <button onClick={() => setTab('boxes')}
            className={`flex-1 text-xs px-3 py-2 rounded transition ${tab === 'boxes' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:bg-stone-100'}`}>
            📦 الصناديق ({boxes.length})
          </button>
          <button onClick={() => setTab('items')}
            className={`flex-1 text-xs px-3 py-2 rounded transition ${tab === 'items' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:bg-stone-100'}`}>
            🔧 الأصناف ({items.length})
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-center text-sm text-stone-400 py-12">جاري التحميل...</p>
          ) : tab === 'boxes' ? (
            boxes.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-12">سلّة الصناديق فارغة</p>
            ) : (
              <div className="space-y-2">
                {boxes.map(b => (
                  <div key={b.id} className="bg-stone-50 border border-stone-200 rounded-lg p-3 flex items-center gap-3">
                    {b.photo_url ? (
                      <img src={b.photo_url} alt={b.code} className="w-12 h-12 object-cover rounded border border-stone-200" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-amber-100 flex items-center justify-center text-xl">📦</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-display font-bold">{b.code}</h4>
                      {b.description && <p className="text-[11px] text-stone-600 truncate">{b.description}</p>}
                      <p className="text-[10px] text-stone-500 mt-0.5">
                        {whName(b.warehouse_id)} · حُذف منذ {daysSince(b.deleted_at)} يوم
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleRestoreBox(b)} disabled={busy}
                        className="text-[11px] bg-green-100 border border-green-300 text-green-800 px-3 py-1.5 rounded hover:bg-green-200">
                        ♻️ استرجاع
                      </button>
                      <button onClick={() => setConfirming({ type: 'box', box: b })} disabled={busy}
                        className="text-[11px] bg-red-100 border border-red-300 text-red-800 px-3 py-1.5 rounded hover:bg-red-200">
                        ❌ حذف نهائي
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            items.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-12">سلّة الأصناف فارغة</p>
            ) : (
              <div className="space-y-2">
                {items.map(it => (
                  <div key={it.id} className="bg-stone-50 border border-stone-200 rounded-lg p-3 flex items-center gap-3">
                    {it.photo_url ? (
                      <img src={it.photo_url} alt={it.name} className="w-12 h-12 object-cover rounded border border-stone-200" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-stone-100 flex items-center justify-center text-xl">🔧</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-display font-bold">{it.name}</h4>
                      <p className="text-[11px] text-stone-600">الكميّة: {it.quantity}</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">
                        {whName(it.boxes?.warehouse_id)} ← {it.boxes?.code || '—'} · حُذف منذ {daysSince(it.deleted_at)} يوم
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleRestoreItem(it)} disabled={busy}
                        className="text-[11px] bg-green-100 border border-green-300 text-green-800 px-3 py-1.5 rounded hover:bg-green-200">
                        ♻️ استرجاع
                      </button>
                      <button onClick={() => setConfirming({ type: 'item', item: it })} disabled={busy}
                        className="text-[11px] bg-red-100 border border-red-300 text-red-800 px-3 py-1.5 rounded hover:bg-red-200">
                        ❌ حذف نهائي
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDelete
          message={`سيُحذف ${confirming.type === 'box' ? `الصندوق ${confirming.box.code}` : `الصنف "${confirming.item.name}"`} نهائياً ولن يُمكن استرجاعه.`}
          busy={busy}
          onConfirm={handlePermanentDelete}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
