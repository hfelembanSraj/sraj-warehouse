import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { AddBoxForm, EditShelfForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import { rpcAddBox, rpcUpdateShelf, rpcDeleteShelf, deleteBox, fetchBoxesForShelf, moveItemToBox } from '../lib/warehouseOps';

export default function ShelfView({ zone, shelf, onBackToMap, onBackToZone, onBoxClick, onRefresh }) {
  const { isFounder, can } = useAuth();
  const [boxes, setBoxes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddBox, setShowAddBox] = useState(false);
  const [editingShelf, setEditingShelf] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  // أوضاع العرض: boxes (الصناديق) | items (قائمة الأغراض) | organize (الترتيب بالسحب)
  const [viewMode, setViewMode] = useState('boxes');

  useEffect(() => {
    loadAll();
  }, [shelf.id]);

  async function loadAll() {
    setLoading(true);
    const { data: boxesData } = await fetchBoxesForShelf(shelf.id);
    setBoxes(boxesData || []);
    // جمع كل الأصناف داخل صناديق هذا الرف
    const itemsList = [];
    (boxesData || []).forEach(b => {
      (b.items || []).filter(it => !it.deleted_at).forEach(it => {
        itemsList.push({ ...it, boxCode: b.code });
      });
    });
    setItems(itemsList);
    setLoading(false);
  }

  const canAddMore = boxes.length < shelf.max_boxes;

  // ====== العمليات ======
  async function handleAddBox(values) {
    setBusy(true);
    const { error } = await rpcAddBox(shelf.id, values);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمت إضافة الصندوق');
    setShowAddBox(false);
    await loadAll();
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
    flash('✅ تم حذف الصندوق وأصنافه (سلّة المحذوفات)');
    await loadAll();
    await onRefresh();
  }

  async function handleMoveItem(itemId, targetBoxId) {
    setBusy(true);
    const { error } = await moveItemToBox(itemId, targetBoxId);
    setBusy(false);
    if (error) return flash('فشل النقل: ' + error.message, 'error');
    flash('✅ تم نقل الصنف');
    await loadAll();
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
              ارتفاع {shelf.height_cm}سم · يسع {shelf.max_boxes} صناديق · يحتوي {boxes.length} صندوقاً · {items.length} صنف
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

        {/* مبدّل وضع العرض */}
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap border-t border-stone-200 pt-4">
          <div className="bg-stone-100 rounded-lg p-0.5 flex">
            <button onClick={() => setViewMode('boxes')}
              className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'boxes' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
              📦 الصناديق ({boxes.length})
            </button>
            <button onClick={() => setViewMode('items')}
              className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'items' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
              📋 قائمة الأغراض ({items.length})
            </button>
            <button onClick={() => setViewMode('organize')}
              className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'organize' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
              🗂 ترتيب الأغراض
            </button>
          </div>
          {(isFounder || can('add')) && viewMode === 'boxes' && (
            <button onClick={() => setShowAddBox(s => !s)}
              disabled={busy || !canAddMore}
              title={!canAddMore ? 'الرف ممتلئ — زد الحدّ الأقصى أو احذف صندوقاً' : ''}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-30 font-medium">
              + إضافة صندوق
            </button>
          )}
        </div>

        {showAddBox && viewMode === 'boxes' && (
          <div className="mb-3">
            <AddBoxForm
              busy={busy}
              onCancel={() => setShowAddBox(false)}
              onSave={handleAddBox}
            />
          </div>
        )}

        {/* العرض الفعلي */}
        {loading ? (
          <p className="text-center text-sm text-stone-400 py-12">جاري التحميل...</p>
        ) : viewMode === 'boxes' ? (
          <BoxesView boxes={boxes} isFounder={isFounder} busy={busy}
            onBoxClick={onBoxClick}
            onDeleteBox={(b) => setConfirming({ type: 'box', box: b })}
          />
        ) : viewMode === 'items' ? (
          <ItemsListView items={items} boxes={boxes} onBoxClick={onBoxClick} />
        ) : (
          <OrganizeView
            boxes={boxes}
            items={items}
            busy={busy}
            onMoveItem={handleMoveItem}
          />
        )}
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
          message={(() => {
            const itemCount = (confirming.box.items || []).filter(it => !it.deleted_at).length;
            return itemCount > 0
              ? `⚠️ يحتوي الصندوق ${confirming.box.code} على ${itemCount} ${itemCount === 1 ? 'صنف' : 'أصناف'}. سيُحذف الصندوق وكل ما بداخله (يمكن استرجاعها من سلّة المحذوفات).`
              : `سيُحذف الصندوق ${confirming.box.code} الفارغ. هل أنت متأكّد؟`;
          })()}
          busy={busy}
          onConfirm={handleDeleteBox}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}

// ====== عرض الصناديق (الافتراضي) ======
function BoxesView({ boxes, isFounder, busy, onBoxClick, onDeleteBox }) {
  if (boxes.length === 0) {
    return <p className="text-center text-sm text-stone-400 py-12">لا توجد صناديق في هذا الرف بعد</p>;
  }
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {boxes.map(b => {
        const itemCount = (b.items || []).filter(it => !it.deleted_at).length;
        return (
          <div key={b.id} className="bg-amber-50 border border-amber-300 rounded-lg overflow-hidden">
            <div className="p-3 flex items-center justify-between gap-2">
              <button onClick={() => onBoxClick(b)} className="flex-1 text-right hover:bg-amber-100 -m-3 p-3 rounded-lg transition flex items-center gap-2">
                {b.photo_url ? (
                  <img src={b.photo_url} alt={b.code} className="w-12 h-12 object-cover rounded border border-amber-200" />
                ) : (
                  <div className="w-12 h-12 rounded bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-base">📦</div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-display font-bold">{b.code}</h4>
                  {b.description && <p className="text-[11px] text-stone-600 truncate">{b.description}</p>}
                  <p className="text-[10px] text-stone-500 mt-0.5">{b.width_cm}×{b.height_cm}سم · {itemCount} صنف</p>
                </div>
                <span className="text-stone-400">→</span>
              </button>
              {isFounder && (
                <button onClick={() => onDeleteBox(b)} disabled={busy}
                  className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded hover:bg-red-100">
                  🗑
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ====== عرض قائمة الأغراض ======
function ItemsListView({ items, boxes, onBoxClick }) {
  const [search, setSearch] = useState('');
  const filtered = items.filter(it => !search.trim() || `${it.name} ${it.boxCode}`.toLowerCase().includes(search.toLowerCase()));

  if (items.length === 0) {
    return <p className="text-center text-sm text-stone-400 py-12">لا توجد أغراض في صناديق هذا الرف</p>;
  }

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 ابحث في الأغراض..."
        className="w-full mb-3 px-3 py-2 border border-stone-300 rounded-lg text-xs"
      />
      <div className="text-[11px] text-stone-500 mb-2">عرض {filtered.length} من {items.length}</div>
      <div className="space-y-1.5">
        {filtered.map(it => {
          const box = boxes.find(b => b.id === it.box_id);
          return (
            <div key={it.id} className="bg-white border border-stone-200 rounded-lg p-2.5 flex items-center gap-3">
              {it.photo_url ? (
                <img src={it.photo_url} alt={it.name} className="w-12 h-12 object-cover rounded border border-stone-200" />
              ) : (
                <div className="w-12 h-12 rounded bg-stone-100 flex items-center justify-center text-xl">🔧</div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium truncate">{it.name}</h4>
                <p className="text-[10px] text-stone-500">الكميّة: {it.quantity}</p>
              </div>
              <button onClick={() => box && onBoxClick(box)}
                className="text-[10px] bg-amber-100 border border-amber-300 text-amber-900 px-2 py-1 rounded hover:bg-amber-200 font-mono font-bold">
                {it.boxCode} →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ====== عرض الترتيب (السحب والإفلات) ======
function OrganizeView({ boxes, items, busy, onMoveItem }) {
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverBoxId, setDragOverBoxId] = useState(null);

  function handleDragStart(e, item) {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
  }

  function handleDragEnd() {
    setDraggedItem(null);
    setDragOverBoxId(null);
  }

  function handleDragOver(e, boxId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverBoxId(boxId);
  }

  function handleDragLeave() {
    setDragOverBoxId(null);
  }

  function handleDrop(e, targetBoxId) {
    e.preventDefault();
    setDragOverBoxId(null);
    if (!draggedItem || draggedItem.box_id === targetBoxId) return;
    onMoveItem(draggedItem.id, targetBoxId);
    setDraggedItem(null);
  }

  if (boxes.length === 0) {
    return <p className="text-center text-sm text-stone-400 py-12">أضف صناديق أوّلاً للترتيب</p>;
  }

  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs text-blue-900">
        🗂 <strong>وضع الترتيب:</strong> اضغط على غرض من أيّ صندوق واسحبه إلى الصندوق الذي تريد نقله إليه. التغيير يُحفظ تلقائياً.
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {boxes.map(b => {
          const boxItems = items.filter(it => it.box_id === b.id);
          const isDropTarget = dragOverBoxId === b.id && draggedItem?.box_id !== b.id;
          return (
            <div
              key={b.id}
              onDragOver={(e) => handleDragOver(e, b.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, b.id)}
              className={`bg-amber-50 border-2 rounded-lg p-3 transition min-h-[200px] ${
                isDropTarget ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300' : 'border-amber-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-200">
                {b.photo_url ? (
                  <img src={b.photo_url} alt={b.code} className="w-10 h-10 object-cover rounded" />
                ) : (
                  <div className="w-10 h-10 rounded bg-amber-200 flex items-center justify-center text-base">📦</div>
                )}
                <div>
                  <h4 className="text-sm font-display font-bold">{b.code}</h4>
                  <p className="text-[10px] text-stone-500">{boxItems.length} صنف</p>
                </div>
              </div>
              {boxItems.length === 0 ? (
                <p className="text-center text-[11px] text-stone-400 py-6 italic">
                  {isDropTarget ? '⬇ أفلت الصنف هنا' : 'صندوق فارغ'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {boxItems.map(it => (
                    <div
                      key={it.id}
                      draggable={!busy}
                      onDragStart={(e) => handleDragStart(e, it)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white border border-stone-200 rounded p-2 flex items-center gap-2 cursor-grab active:cursor-grabbing select-none transition ${
                        draggedItem?.id === it.id ? 'opacity-30' : 'hover:border-blue-400 hover:shadow-sm'
                      }`}
                    >
                      {it.photo_url ? (
                        <img src={it.photo_url} alt="" className="w-9 h-9 object-cover rounded flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-stone-100 flex items-center justify-center text-base flex-shrink-0">🔧</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{it.name}</p>
                        <p className="text-[10px] text-stone-500">×{it.quantity}</p>
                      </div>
                      <span className="text-stone-300 text-base">⋮⋮</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
