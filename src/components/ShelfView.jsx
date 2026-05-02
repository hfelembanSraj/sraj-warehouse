import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { shelfDisplayName } from '../lib/helpers';
import { AddBoxForm, EditShelfForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import CardboardBox from './CardboardBox';
import { rpcAddBox, rpcUpdateShelf, rpcDeleteShelf, deleteBox, fetchBoxesForShelf, moveItemToBox } from '../lib/warehouseOps';

export default function ShelfView({ zone, shelf, onBackToMap, onBackToZone, onBoxClick, onRefresh }) {
  const { isFounder, can } = useAuth();
  const [boxes, setBoxes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addBoxAt, setAddBoxAt] = useState(null);  // الموقع الذي سيُضاف فيه الصندوق
  const [editingShelf, setEditingShelf] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  const [viewMode, setViewMode] = useState('shelf');  // shelf | items | organize

  useEffect(() => {
    loadAll();
  }, [shelf.id]);

  async function loadAll() {
    setLoading(true);
    const { data: boxesData } = await fetchBoxesForShelf(shelf.id);
    setBoxes(boxesData || []);
    const itemsList = [];
    (boxesData || []).forEach(b => {
      (b.items || []).filter(it => !it.deleted_at).forEach(it => {
        itemsList.push({ ...it, boxCode: b.code });
      });
    });
    setItems(itemsList);
    setLoading(false);
  }

  // ====== العمليات ======
  async function handleAddBoxAtPosition(values) {
    setBusy(true);
    const { error } = await rpcAddBox(shelf.id, {
      ...values,
      position: addBoxAt
    });
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تمت إضافة الصندوق في الموقع ${addBoxAt}`);
    setAddBoxAt(null);
    await loadAll();
    await onRefresh();
  }

  async function handleQuickAddAtPosition(position) {
    // إذا كان الرف ممتلئ، نزيد max_boxes
    if (boxes.length >= shelf.max_boxes) {
      const { error: upErr } = await rpcUpdateShelf(shelf.id, { max_boxes: shelf.max_boxes + 1 });
      if (upErr) return flash('فشل: ' + upErr.message, 'error');
    }
    setBusy(true);
    const { error } = await rpcAddBox(shelf.id, {
      position,
      description: '',
      width_cm: 50,
      height_cm: 65
    });
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ صندوق جديد في الموقع ${position}`);
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
    flash('✅ تم نقل الصندوق للسلّة');
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
          <span className="font-medium text-blue-700">{shelfDisplayName(shelf, zone?.shelves || [])}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-bold mb-1">
              📚 {shelfDisplayName(shelf, zone?.shelves || [])}
            </h2>
            <p className="text-xs text-stone-500">
              ارتفاع {shelf.height_cm}سم · يسع {shelf.max_boxes} صناديق · يحتوي حالياً {boxes.length} · {items.length} صنف
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
            <EditShelfForm shelf={shelf} busy={busy} onCancel={() => setEditingShelf(false)} onSave={handleUpdateShelf} />
          </div>
        )}

        {/* مبدّل وضع العرض */}
        <div className="bg-stone-100 rounded-lg p-0.5 inline-flex mb-4">
          <button onClick={() => setViewMode('shelf')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'shelf' ? 'bg-white shadow-sm font-medium' : 'text-stone-600'}`}>
            🗄 الرف المرئي
          </button>
          <button onClick={() => setViewMode('items')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'items' ? 'bg-white shadow-sm font-medium' : 'text-stone-600'}`}>
            📋 قائمة الأغراض ({items.length})
          </button>
          <button onClick={() => setViewMode('organize')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'organize' ? 'bg-white shadow-sm font-medium' : 'text-stone-600'}`}>
            🗂 ترتيب الأغراض
          </button>
        </div>

        {/* العرض */}
        {loading ? (
          <p className="text-center text-sm text-stone-400 py-12">جاري التحميل...</p>
        ) : viewMode === 'shelf' ? (
          <RealisticShelfView
            shelf={shelf}
            zone={zone}
            boxes={boxes}
            isFounder={isFounder}
            canAdd={!!can('add')}
            busy={busy}
            onBoxClick={onBoxClick}
            onAddAtPosition={handleQuickAddAtPosition}
            onDeleteBox={(b) => setConfirming({ type: 'box', box: b })}
          />
        ) : viewMode === 'items' ? (
          <ItemsListView items={items} boxes={boxes} onBoxClick={onBoxClick} />
        ) : (
          <OrganizeView boxes={boxes} items={items} busy={busy} onMoveItem={handleMoveItem} />
        )}
      </div>

      {addBoxAt !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5">
            <h3 className="text-sm font-display font-bold mb-2">+ صندوق في الموقع {addBoxAt}</h3>
            <p className="text-[11px] text-stone-600 mb-3">
              الصناديق الموجودة في الموقع {addBoxAt} وما بعده ستتزحزح للأمام تلقائياً.
            </p>
            <AddBoxForm
              busy={busy}
              onCancel={() => setAddBoxAt(null)}
              onSave={handleAddBoxAtPosition}
            />
          </div>
        </div>
      )}

      {confirming?.type === 'shelf' && (
        <ConfirmDelete
          message={`سيُحذف ${shelfDisplayName(shelf, zone?.shelves || [])} مع كل صناديقه. هل أنت متأكّد؟`}
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
              ? `⚠️ يحتوي الصندوق ${confirming.box.code} على ${itemCount} ${itemCount === 1 ? 'صنف' : 'أصناف'}. سيُحذف الصندوق وكل ما بداخله.`
              : `سيُحذف الصندوق ${confirming.box.code}.`;
          })()}
          busy={busy}
          onConfirm={handleDeleteBox}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}

// ====== العرض الواقعي للرف (الرف بحجم كبير + صناديق وفراغات قابلة للنقر) ======
function RealisticShelfView({ shelf, zone, boxes, isFounder, canAdd, busy, onBoxClick, onAddAtPosition, onDeleteBox }) {
  // لِنُظهر slots بطول max_boxes (على الأقل) بحيث الفراغات تكون ظاهرة
  const totalSlots = Math.max(shelf.max_boxes, boxes.length + 1);
  const slots = [];
  for (let i = 1; i <= totalSlots; i++) {
    const box = boxes.find(b => b.box_index === i);
    slots.push({ position: i, box });
  }

  return (
    <div>
      <div className="text-center text-[10px] text-stone-500 mb-2">عرض الرف بالحجم الفعلي · العرض: {zone?.width_cm || 200} سم</div>

      {/* الإطار الخارجي للرف — تماماً كالـ rack بحجم أكبر */}
      <div className="bg-stone-100 rounded-lg p-3">
        <div
          className="relative w-full bg-white border-4 rounded-md p-2"
          style={{
            borderColor: zone?.color || '#888',
            minHeight: '180px'
          }}
        >
          {/* شارة اسم الرف في الزاوية */}
          <div className="absolute top-0 right-0 text-white text-xs px-2 py-1 rounded-bl rounded-tr font-medium z-10"
            style={{ backgroundColor: zone?.color || '#888' }}>
            {shelfDisplayName(shelf, zone?.shelves || [])}
          </div>

          {/* الصناديق والفراغات — أفقياً */}
          <div className="flex gap-2 h-full" style={{ minHeight: '160px' }}>
            {slots.map(({ position, box }) => (
              <div key={position} className="flex-1 flex flex-col">
                {box ? (
                  <div className="flex-1 relative group">
                    <BigBox box={box} onClick={() => onBoxClick(box)} />
                    {isFounder && (
                      <button onClick={(e) => { e.stopPropagation(); onDeleteBox(box); }} disabled={busy}
                        className="absolute top-1 left-1 text-[10px] bg-white border border-red-300 text-red-700 w-6 h-6 rounded-full shadow-sm hover:bg-red-50 leading-none flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition"
                        title="حذف الصندوق">×</button>
                    )}
                  </div>
                ) : (
                  canAdd ? (
                    <button
                      onClick={() => onAddAtPosition(position)}
                      disabled={busy}
                      className="flex-1 border-2 border-dashed border-green-400 bg-green-50 hover:bg-green-100 rounded text-green-800 font-bold flex flex-col items-center justify-center gap-1 transition"
                      title={`إضافة صندوق في الموقع ${position}`}
                    >
                      <span className="text-2xl">+</span>
                      <span className="text-[10px]">صندوق</span>
                      <span className="text-[9px] opacity-70">الموقع {position}</span>
                    </button>
                  ) : (
                    <div className="flex-1 border border-dashed border-stone-300 rounded text-[10px] text-stone-400 flex items-center justify-center">
                      فارغ
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {boxes.length === 0 && (
        <p className="text-center text-xs text-stone-500 mt-3 italic">
          الرف فارغ. اضغط على أيّ موقع لإضافة صندوق فيه.
        </p>
      )}
    </div>
  );
}

// ====== صندوق كبير (يستخدم في عرض الرف الواقعي) ======
function BigBox({ box, onClick }) {
  const items = box.items?.filter(it => !it.deleted_at) || [];
  return (
    <button
      onClick={onClick}
      className="relative w-full h-full rounded-md overflow-hidden border-2 border-amber-700/70 shadow-md hover:shadow-lg transition cursor-pointer text-right"
      style={{
        background: 'linear-gradient(135deg, #d4a574 0%, #c19661 30%, #b08754 60%, #a07a4a 100%)',
        boxShadow: '0 4px 6px rgba(120,80,40,0.4), inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.15)'
      }}
    >
      {/* الشريط الأعلى — لاصق */}
      <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-amber-200/80 to-amber-300/60 border-b border-amber-700/40"></div>
      {/* خط الطيّ المركزي */}
      <div className="absolute top-3 bottom-0 left-1/2 w-px bg-amber-900/20 -translate-x-1/2 pointer-events-none"></div>

      {box.photo_url && (
        <img src={box.photo_url} alt={box.code}
          className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-multiply" />
      )}

      <div className="relative pt-4 pb-2 px-2 h-full flex flex-col justify-between">
        <div>
          <div className="text-base font-display font-bold text-amber-950 drop-shadow-sm">{box.code}</div>
          {box.description && (
            <div className="text-[10px] text-amber-900/80 truncate mt-0.5">{box.description}</div>
          )}
        </div>
        <div className="text-[10px] text-amber-900/70 flex items-center justify-between">
          <span className="font-bold">{items.length} صنف</span>
          <span className="text-amber-900/50">→</span>
        </div>
      </div>
    </button>
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
      <input type="search" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 ابحث في الأغراض..."
        className="w-full mb-3 px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      <div className="text-[11px] text-stone-500 mb-2">عرض {filtered.length} من {items.length}</div>
      <div className="space-y-1.5">
        {filtered.map(it => {
          const box = boxes.find(b => b.id === it.box_id);
          return (
            <div key={it.id} className="bg-white border border-stone-200 rounded-lg p-2.5 flex items-center gap-3">
              {it.photo_url ? (
                <img src={it.photo_url} alt={it.name} className="w-12 h-12 object-cover rounded border border-stone-200" />
              ) : (
                <div className="w-12 h-12 rounded bg-gradient-to-br from-amber-50 to-stone-100 border border-stone-200 flex items-center justify-center text-[9px] font-bold text-stone-700 text-center p-1 leading-tight overflow-hidden"><span className="line-clamp-2">{it.name}</span></div>
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

// ====== عرض الترتيب (السحب والإفلات) — كما هو ======
function OrganizeView({ boxes, items, busy, onMoveItem }) {
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverBoxId, setDragOverBoxId] = useState(null);

  function handleDragStart(e, item) {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
  }
  function handleDragEnd() { setDraggedItem(null); setDragOverBoxId(null); }
  function handleDragOver(e, boxId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverBoxId(boxId); }
  function handleDragLeave() { setDragOverBoxId(null); }
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
            <div key={b.id}
              onDragOver={(e) => handleDragOver(e, b.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, b.id)}
              className={`bg-amber-50 border-2 rounded-lg p-3 transition min-h-[200px] ${isDropTarget ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300' : 'border-amber-300'}`}>
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
                <p className="text-center text-[11px] text-stone-400 py-6 italic">{isDropTarget ? '⬇ أفلت الصنف هنا' : 'صندوق فارغ'}</p>
              ) : (
                <div className="space-y-1.5">
                  {boxItems.map(it => (
                    <div key={it.id} draggable={!busy}
                      onDragStart={(e) => handleDragStart(e, it)} onDragEnd={handleDragEnd}
                      className={`bg-white border border-stone-200 rounded p-2 flex items-center gap-2 cursor-grab active:cursor-grabbing select-none transition ${draggedItem?.id === it.id ? 'opacity-30' : 'hover:border-blue-400 hover:shadow-sm'}`}>
                      {it.photo_url ? (
                        <img src={it.photo_url} alt="" className="w-9 h-9 object-cover rounded flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-gradient-to-br from-amber-50 to-stone-100 border border-stone-200 flex items-center justify-center text-[8px] font-bold text-stone-700 text-center p-0.5 flex-shrink-0 leading-tight overflow-hidden"><span className="line-clamp-2">{it.name}</span></div>
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
