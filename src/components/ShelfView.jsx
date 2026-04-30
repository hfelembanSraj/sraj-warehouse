import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { AddBoxForm, EditShelfForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import { rpcAddBox, rpcUpdateShelf, rpcDeleteShelf, deleteBox, fetchBoxesForShelf } from '../lib/warehouseOps';

export default function ShelfView({ zone, shelf, onBackToMap, onBackToZone, onBoxClick, onRefresh }) {
  const { isFounder, can } = useAuth();
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddBox, setShowAddBox] = useState(false);
  const [editingShelf, setEditingShelf] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  useEffect(() => {
    loadBoxes();
  }, [shelf.id]);

  async function loadBoxes() {
    setLoading(true);
    const { data } = await fetchBoxesForShelf(shelf.id);
    setBoxes(data || []);
    setLoading(false);
  }

  const canAddMore = boxes.length < shelf.max_boxes;

  // ====== عمليات المؤسّس ======
  async function handleAddBox(values) {
    setBusy(true);
    const { error } = await rpcAddBox(shelf.id, values);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمت إضافة الصندوق');
    setShowAddBox(false);
    await loadBoxes();
    await onRefresh();
  }

  async function handleUpdateShelf(patch) {
    setBusy(true);
    const { error } = await rpcUpdateShelf(shelf.id, patch);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditingShelf(false);
    await onRefresh();
  }

  async function handleDeleteShelf() {
    setBusy(true);
    const { error } = await rpcDeleteShelf(shelf.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف الرف');
    await onRefresh();
    onBackToZone();
  }

  async function handleDeleteBox() {
    setBusy(true);
    const { error } = await deleteBox(confirming.box.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف الصندوق');
    await loadBoxes();
    await onRefresh();
  }

  return (
    <>
      <StatusToast msg={msg} />

      {/* شريط التنقّل */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-xs">
        <button onClick={onBackToZone} className="px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100">→ الرجوع للمساحة</button>
        <div className="text-stone-500 flex items-center gap-1">
          <button onClick={onBackToMap} className="hover:underline">المستودع</button>
          <span className="text-stone-300">‹</span>
          <button onClick={onBackToZone} className="hover:underline" style={{ color: zone.color }}>مساحة {zone.letter}</button>
          <span className="text-stone-300">‹</span>
          <span className="font-medium text-blue-700">رف {shelf.shelf_index}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-bold mb-1">
              📚 رف {shelf.shelf_index}{shelf.label ? ` — ${shelf.label}` : ''}
            </h2>
            <p className="text-xs text-stone-500">
              ارتفاع {shelf.height_cm}سم · يسع {shelf.max_boxes} صناديق · يحتوي حالياً {boxes.length}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {isFounder && (
              <>
                <button onClick={() => setEditingShelf(e => !e)} disabled={busy}
                  className="text-[11px] border border-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100">
                  ✏️ تعديل الرف
                </button>
                <button onClick={() => setConfirming({ type: 'shelf' })} disabled={busy}
                  className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100">
                  🗑 حذف
                </button>
              </>
            )}
          </div>
        </div>

        {isFounder && editingShelf && (
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mb-4">
            <h4 className="text-xs font-display font-bold mb-2">✏️ تعديل بيانات الرف</h4>
            <EditShelfForm
              shelf={shelf}
              busy={busy}
              onCancel={() => setEditingShelf(false)}
              onSave={handleUpdateShelf}
            />
          </div>
        )}

        {/* الصناديق */}
        <div className="border-t border-stone-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-display font-bold text-stone-700">📦 الصناديق ({boxes.length}/{shelf.max_boxes})</h3>
            {(isFounder || can('add')) && (
              <button onClick={() => setShowAddBox(s => !s)}
                disabled={busy || !canAddMore}
                title={!canAddMore ? 'الرف ممتلئ — زد الحدّ الأقصى أو احذف صندوقاً' : ''}
                className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-30 font-medium">
                + إضافة صندوق
              </button>
            )}
          </div>

          {showAddBox && (
            <div className="mb-3">
              <AddBoxForm
                busy={busy}
                onCancel={() => setShowAddBox(false)}
                onSave={handleAddBox}
              />
            </div>
          )}

          {loading ? (
            <p className="text-center text-sm text-stone-400 py-12">جاري التحميل...</p>
          ) : boxes.length === 0 ? (
            <p className="text-center text-sm text-stone-400 py-12">لا توجد صناديق في هذا الرف بعد</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {boxes.map(b => (
                <div key={b.id} className="bg-amber-50 border border-amber-300 rounded-lg overflow-hidden">
                  <div className="p-3 flex items-center justify-between gap-2">
                    <button onClick={() => onBoxClick(b)} className="flex-1 text-right hover:bg-amber-100 -m-3 p-3 rounded-lg transition flex items-center gap-2">
                      {b.photo_url ? (
                        <img src={b.photo_url} alt={b.code}
                          className="w-12 h-12 object-cover rounded border border-amber-200" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-base">📦</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-display font-bold">{b.code}</h4>
                        {b.description && <p className="text-[11px] text-stone-600 truncate">{b.description}</p>}
                        <p className="text-[10px] text-stone-500 mt-0.5">
                          {b.width_cm}×{b.height_cm}سم · {(b.items || []).length} صنف
                        </p>
                      </div>
                      <span className="text-stone-400">→</span>
                    </button>
                    {isFounder && (
                      <button onClick={() => setConfirming({ type: 'box', box: b })} disabled={busy}
                        className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded hover:bg-red-100">
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirming?.type === 'shelf' && (
        <ConfirmDelete
          message={`سيُحذف الرف ${shelf.shelf_index} مع كل صناديقه. هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={handleDeleteShelf}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming?.type === 'box' && (
        <ConfirmDelete
          message={`سيُحذف الصندوق ${confirming.box.code}. هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={handleDeleteBox}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
