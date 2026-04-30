import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CheckoutModal from './CheckoutModal';
import AddBoxModal from './AddBoxModal';
import { AddShelfForm, EditZoneForm, EditShelfForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import { rpcAddShelf, rpcUpdateShelf, rpcDeleteShelf, rpcUpdateZone, rpcDeleteZone } from '../lib/warehouseOps';

export default function ZoneView({ zone, data, onBack, onShelfClick, onRefresh }) {
  const { can, isFounder } = useAuth();
  const [selectedBox, setSelectedBox] = useState(null);
  const [highlightedBox, setHighlightedBox] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [addBoxSlot, setAddBoxSlot] = useState(null);

  const [showAddShelf, setShowAddShelf] = useState(false);
  const [editingZone, setEditingZone] = useState(false);
  const [editingShelfId, setEditingShelfId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  // ضمان وجود الزون من بيانات حديثة
  const fresh = (data.zones || []).find(z => z.id === zone.id) || zone;
  const shelves = fresh?.shelves || [];
  const zoneLetter = fresh.letter;
  const zoneBoxes = data.boxes.filter(b => b.code.startsWith(zoneLetter + '-'));
  const allItems = [];
  zoneBoxes.forEach(box => {
    data.items.filter(it => it.box_id === box.id).forEach(it => {
      allItems.push({ ...it, boxCode: box.code });
    });
  });

  function getBoxItems(boxId) {
    return data.items.filter(it => it.box_id === boxId);
  }

  function isCheckedOut(boxId) {
    return data.checkouts.some(c => c.box_id === boxId);
  }

  function getShelfBoxes(shelfIndex) {
    return zoneBoxes.filter(b => b.code.split('-')[1] === String(shelfIndex));
  }

  // ====== عمليات المؤسّس ======
  async function handleUpdateZone(patch) {
    setBusy(true);
    const { error } = await rpcUpdateZone(fresh, patch);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditingZone(false);
    await onRefresh();
  }

  async function handleDeleteZone() {
    setBusy(true);
    const { error } = await rpcDeleteZone(fresh.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف المساحة');
    await onRefresh();
    onBack();
  }

  async function handleAddShelf(values) {
    setBusy(true);
    const { error } = await rpcAddShelf(fresh.id, values);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمت إضافة الرف');
    setShowAddShelf(false);
    await onRefresh();
  }

  async function handleUpdateShelf(shelf, patch) {
    setBusy(true);
    const { error } = await rpcUpdateShelf(shelf.id, patch);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditingShelfId(null);
    await onRefresh();
  }

  async function handleDeleteShelf() {
    setBusy(true);
    const { error } = await rpcDeleteShelf(confirming.shelf.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف الرف');
    await onRefresh();
  }

  return (
    <>
      <StatusToast msg={msg} />

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button onClick={onBack} className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100">→ الرجوع للمستودع</button>
        <div className="text-xs text-stone-500 flex items-center gap-1">
          <button onClick={onBack} className="hover:underline">المستودع</button>
          <span className="text-stone-300">‹</span>
          <span className="font-medium" style={{ color: fresh.color }}>مساحة {fresh.letter}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-bold mb-1" style={{ color: fresh.color }}>
              مساحة {fresh.letter} — {fresh.name}
            </h2>
            <p className="text-xs text-stone-500">
              {fresh.width_cm}×{fresh.height_cm} سم · {shelves.length} رف · اضغط على الرف للدخول إليه
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {isFounder && (
              <>
                <button onClick={() => setEditingZone(e => !e)} disabled={busy}
                  className="text-[11px] border border-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100">
                  ✏️ تعديل المساحة
                </button>
                <button onClick={() => setConfirming({ type: 'zone' })} disabled={busy}
                  className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100">
                  🗑 حذف
                </button>
              </>
            )}
          </div>
        </div>

        {/* نموذج تعديل المساحة */}
        {isFounder && editingZone && (
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mb-4">
            <h4 className="text-xs font-display font-bold mb-2">✏️ تعديل بيانات المساحة</h4>
            <EditZoneForm
              zone={fresh}
              busy={busy}
              onCancel={() => setEditingZone(false)}
              onSave={handleUpdateZone}
            />
          </div>
        )}

        {/* البحث عن غرض */}
        {allItems.length > 0 && (
          <div className="bg-stone-50 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium mb-2">البحث عن غرض</p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {allItems.map((it, i) => (
                <button key={i}
                  onClick={() => { setHighlightedBox(highlightedBox === it.boxCode ? null : it.boxCode); setSelectedBox(null); }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                    highlightedBox === it.boxCode
                      ? 'bg-green-100 border-green-400 text-green-800'
                      : 'bg-white border-stone-300 hover:bg-orange-50 hover:border-orange-400'
                  }`}>
                  {it.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* العرض الأمامي للأرفف */}
        <div className="flex justify-center mb-3">
          <div className="w-full max-w-md bg-stone-100 rounded-lg p-4">
            <div
              className="relative w-full bg-white border-4 rounded-md p-2 flex flex-col gap-1.5"
              style={{ aspectRatio: `${fresh.width_cm}/${fresh.height_cm}`, borderColor: fresh.color }}
            >
              {shelves.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-stone-400">
                  لا توجد أرفف في هذه المساحة
                </div>
              ) : (
                shelves.map(shelf => {
                  const shelfBoxes = getShelfBoxes(shelf.shelf_index);
                  const emptySlots = Math.max(0, shelf.max_boxes - shelfBoxes.length);
                  return (
                    <button
                      key={shelf.id}
                      onClick={() => onShelfClick(shelf)}
                      className="flex-1 bg-stone-50 border-2 rounded p-1 flex gap-1 relative hover:bg-blue-50 hover:border-brand-blue transition cursor-pointer text-right"
                      style={{ borderColor: fresh.color }}
                    >
                      <span className="absolute top-0 right-0 text-white text-[9px] px-1.5 py-0.5 rounded-bl rounded-tr font-medium pointer-events-none" style={{ backgroundColor: fresh.color }}>
                        {shelf.label || `رف ${shelf.shelf_index}`}
                      </span>
                      <span className="absolute top-0 left-0 bg-blue-600 text-white text-[8px] px-1 py-0.5 rounded-tr rounded-bl pointer-events-none">
                        ادخل ←
                      </span>
                      {shelfBoxes.map(box => {
                        const items = getBoxItems(box.id);
                        const isOut = isCheckedOut(box.id);
                        const isHighlighted = highlightedBox === box.code;
                        let bgClass = 'bg-amber-50 border-amber-600 text-amber-900';
                        if (isHighlighted) bgClass = 'bg-green-100 border-green-600 text-green-900';
                        else if (isOut) bgClass = 'bg-red-100 border-red-500 text-red-900';
                        return (
                          <div key={box.id} className={`flex-1 border rounded flex flex-col items-center justify-center gap-0.5 ${bgClass} pointer-events-none`}>
                            <span className="text-[10px] font-bold leading-none">{box.code}</span>
                            <span className="text-[8px] opacity-75 leading-none">{items.length} أصناف</span>
                          </div>
                        );
                      })}
                      {Array.from({ length: emptySlots }).map((_, i) => (
                        <div key={i} className="flex-1 border border-dashed border-stone-300 rounded text-[9px] text-stone-400 flex items-center justify-center pointer-events-none">
                          فارغ
                        </div>
                      ))}
                    </button>
                  );
                })
              )}
            </div>
            <div className="text-center text-[10px] text-stone-400 mt-2">العرض: {fresh.width_cm} سم</div>
          </div>
        </div>

        {/* قسم إدارة الأرفف للمؤسّس */}
        {isFounder && (
          <div className="border-t border-stone-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-display font-bold text-stone-700">📚 إدارة الأرفف</h4>
              <button onClick={() => setShowAddShelf(s => !s)} disabled={busy}
                className="text-[11px] bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-200">
                + 👑 رف جديد
              </button>
            </div>

            {showAddShelf && (
              <div className="mb-3">
                <AddShelfForm
                  busy={busy}
                  onCancel={() => setShowAddShelf(false)}
                  onSave={handleAddShelf}
                />
              </div>
            )}

            <div className="space-y-2">
              {shelves.map(s => (
                <div key={s.id} className="bg-stone-50 border border-stone-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between gap-2 p-2 text-xs">
                    <button onClick={() => onShelfClick(s)} className="flex-1 text-right hover:underline">
                      📚 رف {s.shelf_index}{s.label ? ` — ${s.label}` : ''}
                      <span className="text-[10px] text-stone-500 mr-2">
                        ارتفاع {s.height_cm}سم · يسع {s.max_boxes}
                      </span>
                    </button>
                    <button onClick={() => setEditingShelfId(editingShelfId === s.id ? null : s.id)} disabled={busy}
                      className="text-[10px] border border-stone-300 px-2 py-1 rounded hover:bg-stone-100">
                      ✏️
                    </button>
                    <button onClick={() => setConfirming({ type: 'shelf', shelf: s })} disabled={busy}
                      className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded hover:bg-red-100">
                      🗑
                    </button>
                  </div>
                  {editingShelfId === s.id && (
                    <div className="bg-white border-t border-stone-200 p-3">
                      <EditShelfForm
                        shelf={s}
                        busy={busy}
                        onCancel={() => setEditingShelfId(null)}
                        onSave={(patch) => handleUpdateShelf(s, patch)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} onSaved={onRefresh} />}
      {addBoxSlot && <AddBoxModal slotCode={addBoxSlot.slotCode} shelfId={addBoxSlot.shelfId} onClose={() => setAddBoxSlot(null)} onSaved={onRefresh} />}

      {confirming?.type === 'zone' && (
        <ConfirmDelete
          message={`سيُحذف ${fresh.letter} — ${fresh.name} مع كل أرففه وصناديقه. هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={handleDeleteZone}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming?.type === 'shelf' && (
        <ConfirmDelete
          message={`سيُحذف الرف ${confirming.shelf.shelf_index} مع صناديقه. هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={handleDeleteShelf}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
