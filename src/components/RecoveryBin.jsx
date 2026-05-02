import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import {
  restoreBox, restoreItem, permanentDeleteBox, permanentDeleteItem,
  bulkRestoreBoxes, bulkRestoreItems, bulkPermanentDeleteBoxes, bulkPermanentDeleteItems
} from '../lib/warehouseOps';

export default function RecoveryBin({ onRefresh }) {
  const { isFounder, warehouses } = useAuth();
  const [boxes, setBoxes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [tab, setTab] = useState('boxes');
  const [msg, flash] = useFlash();
  // مجموعات المعرّفات المختارة (لكلّ تبويب)
  const [selectedBoxIds, setSelectedBoxIds] = useState(() => new Set());
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set());

  useEffect(() => {
    if (isFounder) loadDeleted();
  }, [isFounder]);

  async function loadDeleted() {
    setLoading(true);
    const [boxesR, itemsR] = await Promise.all([
      supabase.from('boxes').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('items').select('*, boxes(code, warehouse_id)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
    ]);
    setBoxes(boxesR.data || []);
    setItems(itemsR.data || []);
    setSelectedBoxIds(new Set());
    setSelectedItemIds(new Set());
    setLoading(false);
  }

  function whName(whId) { return warehouses.find(w => w.id === whId)?.name || '—'; }
  function daysSince(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)); }

  // ====== تحديد فردي وجماعي ======
  function toggleBoxId(id) {
    setSelectedBoxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleItemId(id) {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAllBoxes() {
    setSelectedBoxIds(new Set(boxes.map(b => b.id)));
  }
  function selectAllItems() {
    setSelectedItemIds(new Set(items.map(i => i.id)));
  }
  function clearBoxSelection() { setSelectedBoxIds(new Set()); }
  function clearItemSelection() { setSelectedItemIds(new Set()); }

  // ====== العمليّات الفرديّة ======
  async function handleRestoreBox(box) {
    setBusy(true);
    const { error } = await restoreBox(box.id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تم استرجاع ${box.code}`);
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
    if (confirming.type === 'box') ({ error } = await permanentDeleteBox(confirming.box.id));
    else if (confirming.type === 'item') ({ error } = await permanentDeleteItem(confirming.item.id));
    else if (confirming.type === 'bulk-restore-boxes') ({ error } = await bulkRestoreBoxes(confirming.ids));
    else if (confirming.type === 'bulk-restore-items') ({ error } = await bulkRestoreItems(confirming.ids));
    else if (confirming.type === 'bulk-perm-boxes') ({ error } = await bulkPermanentDeleteBoxes(confirming.ids));
    else if (confirming.type === 'bulk-perm-items') ({ error } = await bulkPermanentDeleteItems(confirming.ids));
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمّ بنجاح');
    await loadDeleted();
    await onRefresh();
  }

  // ====== العمليّات الجماعيّة ======
  async function handleBulkRestoreBoxes() {
    const ids = Array.from(selectedBoxIds);
    setBusy(true);
    const { error } = await bulkRestoreBoxes(ids);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ استُرجع ${ids.length} صندوق`);
    await loadDeleted();
    await onRefresh();
  }
  async function handleBulkRestoreItems() {
    const ids = Array.from(selectedItemIds);
    setBusy(true);
    const { error } = await bulkRestoreItems(ids);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ استُرجع ${ids.length} صنف`);
    await loadDeleted();
    await onRefresh();
  }

  if (!isFounder) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-sm text-stone-500">
        هذه الصفحة للمؤسّس فقط.
      </div>
    );
  }

  // العناصر النشطة في التبويب الحالي
  const currentSelected = tab === 'boxes' ? selectedBoxIds : selectedItemIds;
  const currentList = tab === 'boxes' ? boxes : items;

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

        {/* شريط أدوات التحديد الجماعي */}
        {currentList.length > 0 && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={currentSelected.size === currentList.length && currentList.length > 0}
                onChange={() => {
                  if (currentSelected.size === currentList.length) {
                    tab === 'boxes' ? clearBoxSelection() : clearItemSelection();
                  } else {
                    tab === 'boxes' ? selectAllBoxes() : selectAllItems();
                  }
                }}
                className="w-4 h-4 accent-brand-navy cursor-pointer"
              />
              <span className="font-medium text-blue-900">
                {currentSelected.size === currentList.length && currentList.length > 0
                  ? '✓ تحديد الكلّ مُفعَّل'
                  : `تحديد الكلّ (${currentList.length})`}
              </span>
            </label>
            {currentSelected.size > 0 && (
              <span className="text-[11px] text-blue-700">
                {currentSelected.size} مختار
              </span>
            )}
          </div>
        )}

        <div className="p-4">
          {loading ? (
            <p className="text-center text-sm text-stone-400 py-12">جاري التحميل...</p>
          ) : tab === 'boxes' ? (
            boxes.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-12">سلّة الصناديق فارغة</p>
            ) : (
              <div className="space-y-2">
                {boxes.map(b => {
                  const isSelected = selectedBoxIds.has(b.id);
                  return (
                    <div key={b.id} className={`bg-stone-50 border rounded-lg p-3 flex items-center gap-3 transition ${isSelected ? 'border-brand-navy ring-2 ring-brand-navy/20 bg-blue-50' : 'border-stone-200'}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleBoxId(b.id)}
                        className="w-4 h-4 accent-brand-navy cursor-pointer flex-shrink-0"
                      />
                      {b.photo_url ? (
                        <img src={b.photo_url} alt={b.code} className="w-12 h-12 object-cover rounded border border-stone-200" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-amber-100 flex items-center justify-center text-xl">📦</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-display font-bold">{b.code}</h4>
                        {b.description && <p className="text-[11px] text-stone-600 truncate">{b.description}</p>}
                        <p className="text-[10px] text-stone-500 mt-0.5">{whName(b.warehouse_id)} · حُذف منذ {daysSince(b.deleted_at)} يوم</p>
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
                  );
                })}
              </div>
            )
          ) : (
            items.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-12">سلّة الأصناف فارغة</p>
            ) : (
              <div className="space-y-2">
                {items.map(it => {
                  const isSelected = selectedItemIds.has(it.id);
                  return (
                    <div key={it.id} className={`bg-stone-50 border rounded-lg p-3 flex items-center gap-3 transition ${isSelected ? 'border-brand-navy ring-2 ring-brand-navy/20 bg-blue-50' : 'border-stone-200'}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemId(it.id)}
                        className="w-4 h-4 accent-brand-navy cursor-pointer flex-shrink-0"
                      />
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
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* شريط الإجراءات الجماعيّة العائم */}
      {currentSelected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-navy text-white px-5 py-3 rounded-2xl shadow-2xl border-2 border-brand-purple animate-fade-in max-w-[95vw]">
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <span className="text-xs font-bold whitespace-nowrap bg-white/20 px-2.5 py-1 rounded">
              {currentSelected.size} {tab === 'boxes' ? (currentSelected.size === 1 ? 'صندوق' : 'صناديق') : 'صنف'} مختار
            </span>
            <button onClick={() => tab === 'boxes' ? handleBulkRestoreBoxes() : handleBulkRestoreItems()} disabled={busy}
              className="text-[11px] bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded font-bold">
              ♻️ استرجاع الكلّ
            </button>
            <button onClick={() => setConfirming({
              type: tab === 'boxes' ? 'bulk-perm-boxes' : 'bulk-perm-items',
              ids: Array.from(currentSelected),
              count: currentSelected.size
            })} disabled={busy}
              className="text-[11px] bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded font-bold">
              ❌ حذف نهائي للكلّ
            </button>
            <button onClick={() => tab === 'boxes' ? clearBoxSelection() : clearItemSelection()}
              className="text-[11px] bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded">
              ✕ إلغاء
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDelete
          message={
            confirming.type === 'box' ? `سيُحذف ${confirming.box.code} نهائياً ولن يُمكن استرجاعه.`
            : confirming.type === 'item' ? `سيُحذف "${confirming.item.name}" نهائياً ولن يُمكن استرجاعه.`
            : confirming.type === 'bulk-perm-boxes' ? `سيُحذف ${confirming.count} صناديق نهائياً ولن يُمكن استرجاعها.`
            : confirming.type === 'bulk-perm-items' ? `سيُحذف ${confirming.count} أصناف نهائياً ولن يُمكن استرجاعها.`
            : ''
          }
          busy={busy}
          onConfirm={handlePermanentDelete}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
