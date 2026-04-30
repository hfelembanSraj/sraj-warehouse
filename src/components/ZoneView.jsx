import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { shelfDisplayName } from '../lib/helpers';
import CheckoutModal from './CheckoutModal';
import AddBoxModal from './AddBoxModal';
import { AddShelfForm, EditZoneForm, EditShelfForm, AddBoxForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import {
  rpcAddShelf, rpcUpdateShelf, rpcDeleteShelf,
  rpcUpdateZone, rpcDeleteZone, rpcAddBox, deleteBox
} from '../lib/warehouseOps';

export default function ZoneView({ zone, data, onBack, onShelfClick, onItemClick, onRefresh }) {
  const { can, isFounder } = useAuth();
  const [highlightedBox, setHighlightedBox] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);

  // وضع العرض: rack (الرف المرئي) | items (قائمة كل الأغراض في المساحة)
  const [zoneViewMode, setZoneViewMode] = useState('rack');

  // وضع التعديل التفاعلي على الرفّ
  const [editMode, setEditMode] = useState(false);
  // نموذج إضافة صندوق على رف معيّن
  const [addBoxOnShelf, setAddBoxOnShelf] = useState(null);
  // نموذج إضافة رف
  const [showAddShelfForm, setShowAddShelfForm] = useState(false);
  // تعديل الرف فردياً
  const [editingShelfId, setEditingShelfId] = useState(null);
  // تعديل المساحة كاملةً
  const [editingZone, setEditingZone] = useState(false);
  // تأكيد الحذف
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

  function getBoxItems(boxId) { return data.items.filter(it => it.box_id === boxId); }
  function isCheckedOut(boxId) { return data.checkouts.some(c => c.box_id === boxId); }
  function getShelfBoxes(shelfIndex) {
    return zoneBoxes.filter(b => b.code.split('-')[1] === String(shelfIndex));
  }

  // ====== العمليات ======
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
    setShowAddShelfForm(false);
    await onRefresh();
  }

  async function handleQuickAddShelf() {
    // إضافة سريعة برف افتراضي (3 أرفف × 4 صناديق)
    setBusy(true);
    const { error } = await rpcAddShelf(fresh.id, { height_cm: 70, max_boxes: 4 });
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمت إضافة رف جديد');
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

  async function handleAddBox(values) {
    setBusy(true);
    const { error } = await rpcAddBox(addBoxOnShelf.id, values);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمت إضافة صندوق');
    setAddBoxOnShelf(null);
    await onRefresh();
  }

  async function handleQuickAddBox(shelf) {
    setBusy(true);
    const { error } = await rpcAddBox(shelf.id, { description: '', width_cm: 50, height_cm: 65 });
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمت إضافة صندوق');
    await onRefresh();
  }

  async function handleDeleteBox() {
    setBusy(true);
    const { error } = await deleteBox(confirming.box.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف الصندوق');
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
              {fresh.width_cm}×{fresh.height_cm} سم · {shelves.length} رف
              {!editMode && shelves.length > 0 && ' · اضغط على الرف للدخول إليه'}
              {editMode && ' · 🔧 وضع التعديل مفعّل'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {isFounder && (
              <>
                <button onClick={() => setEditMode(e => !e)} disabled={busy}
                  className={`text-[11px] px-3 py-1.5 rounded-lg font-medium border transition ${
                    editMode
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                  }`}>
                  {editMode ? '✓ إنهاء التعديل' : '🔧 وضع التعديل'}
                </button>
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

        {/* مبدّل وضع العرض */}
        <div className="bg-stone-100 rounded-lg p-0.5 inline-flex mb-4">
          <button onClick={() => setZoneViewMode('rack')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${zoneViewMode === 'rack' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
            🗄 الرف المرئي
          </button>
          <button onClick={() => setZoneViewMode('items')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${zoneViewMode === 'items' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
            📋 كل أغراض المساحة ({allItems.length})
          </button>
        </div>

        {/* البحث عن غرض (في وضع الرف المرئي) */}
        {zoneViewMode === 'rack' && !editMode && allItems.length > 0 && (
          <div className="bg-stone-50 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium mb-2">البحث عن غرض</p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {allItems.map((it, i) => (
                <button key={i}
                  onClick={() => setHighlightedBox(highlightedBox === it.boxCode ? null : it.boxCode)}
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

        {/* عرض كل الأغراض في المساحة */}
        {zoneViewMode === 'items' && (
          <ZoneItemsList items={allItems} zoneBoxes={zoneBoxes} zone={fresh} onItemClick={onItemClick} />
        )}

        {/* بانر وضع التعديل */}
        {editMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-900 flex items-center gap-2">
            <span className="text-base">🔧</span>
            <p className="flex-1">اضغط على المربّعات الفارغة لإضافة صناديق · اضغط على المساحة الفارغة في الأسفل لإضافة رف · اضغط × لحذف عنصر</p>
          </div>
        )}

        {/* العرض الأمامي للأرفف */}
        {zoneViewMode === 'rack' && (
        <div className="flex justify-center mb-3">
          <div className="w-full max-w-md bg-stone-100 rounded-lg p-4">
            <div
              className="relative w-full bg-white border-4 rounded-md p-2 flex flex-col gap-1.5"
              style={{
                aspectRatio: editMode ? `${fresh.width_cm}/${fresh.height_cm + 80}` : `${fresh.width_cm}/${fresh.height_cm}`,
                borderColor: fresh.color
              }}
            >
              {shelves.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-stone-400">
                  لا توجد أرفف في هذه المساحة
                </div>
              ) : (
                shelves.map(shelf => {
                  const shelfBoxes = getShelfBoxes(shelf.shelf_index);
                  const emptySlots = Math.max(0, shelf.max_boxes - shelfBoxes.length);
                  const ShelfWrap = editMode ? 'div' : 'button';
                  return (
                    <ShelfWrap
                      key={shelf.id}
                      onClick={editMode ? undefined : () => onShelfClick(shelf)}
                      className={`flex-1 bg-stone-50 border-2 rounded p-1 flex gap-1 relative text-right ${
                        editMode ? '' : 'hover:bg-blue-50 hover:border-brand-blue transition cursor-pointer'
                      }`}
                      style={{ borderColor: fresh.color }}
                    >
                      <span className="absolute top-0 right-0 text-white text-[9px] px-1.5 py-0.5 rounded-bl rounded-tr font-medium pointer-events-none" style={{ backgroundColor: fresh.color }}>
                        {shelfDisplayName(shelf, shelves)}
                      </span>
                      {!editMode && (
                        <span className="absolute top-0 left-0 bg-blue-600 text-white text-[8px] px-1 py-0.5 rounded-tr rounded-bl pointer-events-none">
                          ادخل ←
                        </span>
                      )}
                      {/* أزرار التعديل في وضع التعديل */}
                      {editMode && isFounder && (
                        <div className="absolute top-0 left-0 flex gap-0.5 z-10">
                          <button onClick={(e) => { e.stopPropagation(); setEditingShelfId(editingShelfId === shelf.id ? null : shelf.id); }}
                            className="bg-white border border-stone-300 text-[9px] px-1 py-0.5 rounded shadow-sm hover:bg-stone-100"
                            title="تعديل الرف">✏️</button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirming({ type: 'shelf', shelf }); }}
                            className="bg-white border border-red-300 text-red-600 text-[9px] px-1 py-0.5 rounded shadow-sm hover:bg-red-50"
                            title="حذف الرف">🗑</button>
                        </div>
                      )}
                      {shelfBoxes.map(box => {
                        const items = getBoxItems(box.id);
                        const isOut = isCheckedOut(box.id);
                        const isHighlighted = highlightedBox === box.code;
                        let bgClass = 'bg-amber-50 border-amber-600 text-amber-900';
                        if (isHighlighted) bgClass = 'bg-green-100 border-green-600 text-green-900';
                        else if (isOut) bgClass = 'bg-red-100 border-red-500 text-red-900';
                        return (
                          <div key={box.id} className={`flex-1 border rounded flex flex-col items-center justify-center gap-0.5 relative ${bgClass}`}>
                            <span className="text-[10px] font-bold leading-none">{box.code}</span>
                            <span className="text-[8px] opacity-75 leading-none">{items.length} أصناف</span>
                            {editMode && isFounder && (
                              <button onClick={(e) => { e.stopPropagation(); setConfirming({ type: 'box', box }); }}
                                className="absolute top-0.5 left-0.5 bg-white border border-red-300 text-red-600 text-[9px] w-4 h-4 rounded shadow-sm hover:bg-red-50 leading-none"
                                title="حذف الصندوق">×</button>
                            )}
                          </div>
                        );
                      })}
                      {Array.from({ length: emptySlots }).map((_, i) => (
                        editMode && isFounder ? (
                          <button
                            key={i}
                            onClick={(e) => { e.stopPropagation(); handleQuickAddBox(shelf); }}
                            disabled={busy}
                            className="flex-1 border-2 border-dashed border-green-400 bg-green-50 hover:bg-green-100 rounded text-[10px] text-green-800 font-bold flex items-center justify-center"
                            title="إضافة صندوق إلى هذا الرف">
                            + صندوق
                          </button>
                        ) : (
                          <div key={i} className="flex-1 border border-dashed border-stone-300 rounded text-[9px] text-stone-400 flex items-center justify-center pointer-events-none">
                            فارغ
                          </div>
                        )
                      ))}
                    </ShelfWrap>
                  );
                })
              )}

              {/* في وضع التعديل: زر إضافة رف جديد ضمن الإطار */}
              {editMode && isFounder && (
                <button
                  onClick={handleQuickAddShelf}
                  disabled={busy}
                  className="border-2 border-dashed border-green-400 bg-green-50 hover:bg-green-100 rounded p-3 text-xs text-green-800 font-bold transition"
                  style={{ minHeight: '40px' }}
                  title="إضافة رف جديد"
                >
                  + رف جديد
                </button>
              )}
            </div>
            <div className="text-center text-[10px] text-stone-400 mt-2">العرض: {fresh.width_cm} سم</div>
          </div>
        </div>
        )}

        {/* تعديل رف معيّن (يظهر تحت الرفّ في وضع التعديل) */}
        {editMode && editingShelfId && (
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mt-3">
            {(() => {
              const s = shelves.find(s2 => s2.id === editingShelfId);
              if (!s) return null;
              return (
                <>
                  <h4 className="text-xs font-display font-bold mb-2">✏️ تعديل رف {s.shelf_index}</h4>
                  <EditShelfForm
                    shelf={s}
                    busy={busy}
                    onCancel={() => setEditingShelfId(null)}
                    onSave={(patch) => handleUpdateShelf(s, patch)}
                  />
                </>
              );
            })()}
          </div>
        )}

        {/* خارج وضع التعديل: قسم إدارة الأرفف الكلاسيكي للمؤسّس */}
        {!editMode && isFounder && (
          <div className="border-t border-stone-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-display font-bold text-stone-700">📚 الأرفف</h4>
              <button onClick={() => setShowAddShelfForm(s => !s)} disabled={busy}
                className="text-[11px] bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-200">
                + 👑 رف جديد
              </button>
            </div>

            {showAddShelfForm && (
              <div className="mb-3">
                <AddShelfForm
                  busy={busy}
                  hasExistingShelves={shelves.length > 0}
                  onCancel={() => setShowAddShelfForm(false)}
                  onSave={handleAddShelf}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} onSaved={onRefresh} />}

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

// ====== قائمة كل أغراض المساحة ======
function ZoneItemsList({ items, zoneBoxes, zone, onItemClick }) {
  const [search, setSearch] = useState('');

  const filtered = items.filter(it => {
    if (!search.trim()) return true;
    return `${it.name} ${it.boxCode}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 ابحث في أغراض المساحة..."
        className="w-full mb-3 px-3 py-2 border border-stone-300 rounded-lg text-xs"
      />
      <div className="text-[11px] text-stone-500 mb-2">
        عرض {filtered.length} من {items.length} صنف · اضغط أيّ صنف للذهاب لمكانه مباشرة
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-stone-400 py-12">
          {items.length === 0 ? 'لا توجد أغراض في هذه المساحة بعد' : 'لا توجد نتائج'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(it => (
            <button
              key={it.id}
              onClick={() => onItemClick && onItemClick(it.boxCode)}
              className="w-full text-right bg-white border border-stone-200 rounded-lg p-2.5 flex items-center gap-3 hover:shadow-md hover:border-blue-400 transition"
            >
              {it.photo_url ? (
                <img src={it.photo_url} alt={it.name} className="w-12 h-12 object-cover rounded border border-stone-200 flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded bg-stone-100 flex items-center justify-center text-xl flex-shrink-0">🔧</div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium truncate">{it.name}</h4>
                <p className="text-[10px] text-stone-500">الكميّة: {it.quantity}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ color: zone.color, backgroundColor: zone.color + '15' }}>
                  {it.boxCode}
                </span>
                <span className="text-stone-400">→</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
