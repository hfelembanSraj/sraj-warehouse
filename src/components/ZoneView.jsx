import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { shelfDisplayName } from '../lib/helpers';
import CheckoutModal from './CheckoutModal';
import AddBoxModal from './AddBoxModal';
import { AddShelfForm, EditZoneForm, EditShelfForm, AddBoxForm, ConfirmDelete, StatusToast, FormModal, useFlash } from './BuilderForms';
import { CardboardBoxMini } from './CardboardBox';
import {
  rpcAddShelf, rpcUpdateShelf, rpcDeleteShelf,
  rpcUpdateZone, rpcDeleteZone, rpcAddBox, deleteBox, moveBoxToShelf
} from '../lib/warehouseOps';

export default function ZoneView({ zone, data, onBack, onShelfClick, onItemClick, onRefresh }) {
  const { can, isFounder } = useAuth();
  const [highlightedBox, setHighlightedBox] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);

  // وضع العرض: rack (الرف المرئي) | items (قائمة كل الأغراض في المساحة)
  const [zoneViewMode, setZoneViewMode] = useState('rack');

  // وضع التعديل التفاعلي على الرفّ
  const [editMode, setEditMode] = useState(false);

  // حالة السحب والإفلات (للديسكتوب) + النقر للاختيار (للجوال)
  const [draggedBox, setDraggedBox] = useState(null);
  const [selectedBoxForMove, setSelectedBoxForMove] = useState(null);
  const [dragOverShelfId, setDragOverShelfId] = useState(null);
  const [dragOverTrash, setDragOverTrash] = useState(false);
  // الصندوق المُضاف حديثاً (لإبرازه بصرياً)
  const [recentlyAddedBoxId, setRecentlyAddedBoxId] = useState(null);

  // الصندوق "النشط" للسحب أو النقل (سواء بالماوس أو اللمس)
  const activeBoxForMove = draggedBox || selectedBoxForMove;
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

  // إضافة صندوق في موقع محدّد على الرف (يشغّل add_box_at_position إذا تم تمرير position)
  async function handleQuickAddBox(shelf, position = null) {
    const currentBoxes = data.boxes.filter(b => b.code.startsWith(`${fresh.letter}-${shelf.shelf_index}-`)).length;
    setBusy(true);
    if (currentBoxes >= shelf.max_boxes || (position && position > shelf.max_boxes)) {
      const newMax = Math.max(shelf.max_boxes + 1, position || 0);
      const { error: upErr } = await rpcUpdateShelf(shelf.id, { max_boxes: newMax });
      if (upErr) {
        setBusy(false);
        return flash('فشل: ' + upErr.message, 'error');
      }
    }
    const { data: newId, error } = await rpcAddBox(shelf.id, {
      description: '',
      width_cm: 50,
      height_cm: 65,
      position
    });
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    const expectedCode = `${fresh.letter}-${shelf.shelf_index}-${position || (currentBoxes + 1)}`;
    flash(position
      ? `✅ صندوق جديد في الموقع ${position} (الرمز: ${expectedCode})`
      : `✅ تمت إضافة صندوق (${expectedCode})`);
    // ميّز الصندوق الجديد لمدّة 3 ثوانٍ
    if (newId) {
      setRecentlyAddedBoxId(newId);
      setTimeout(() => setRecentlyAddedBoxId(null), 3000);
    }
    await onRefresh();
  }

  async function handleQuickRenameShelf(shelf, newLabel) {
    if (newLabel === (shelf.label || '')) return;
    setBusy(true);
    const { error } = await rpcUpdateShelf(shelf.id, { label: newLabel.trim() || null });
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم تغيير الاسم');
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

  // ====== السحب والإفلات + النقر للاختيار ======
  function handleBoxDragStart(e, box) {
    setDraggedBox(box);
    setSelectedBoxForMove(null); // إلغاء أيّ اختيار سابق
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', box.id);
    // أيقونة سحب مخصّصة (اختياريّ)
    if (e.currentTarget) {
      try { e.dataTransfer.setDragImage(e.currentTarget, 0, 0); } catch {}
    }
  }

  function handleBoxDragEnd() {
    setDraggedBox(null);
    setDragOverShelfId(null);
    setDragOverTrash(false);
  }

  // اختيار/إلغاء اختيار صندوق بالنقر (للأجهزة اللمسيّة أو من لا يستطيع السحب)
  function handleBoxClickToSelect(box, e) {
    if (!editMode || !isFounder) return;
    e?.stopPropagation();
    if (selectedBoxForMove?.id === box.id) {
      setSelectedBoxForMove(null);  // إلغاء
    } else {
      setSelectedBoxForMove(box);
    }
  }

  async function handleDropOnShelf(shelf) {
    const box = activeBoxForMove;
    if (!box) return;
    const currentShelfIndex = parseInt(box.code.split('-')[1]);
    if (currentShelfIndex === shelf.shelf_index) {
      setDraggedBox(null);
      setSelectedBoxForMove(null);
      setDragOverShelfId(null);
      return;
    }
    setBusy(true);
    const { error } = await moveBoxToShelf(box.id, shelf.id);
    setBusy(false);
    setDraggedBox(null);
    setSelectedBoxForMove(null);
    setDragOverShelfId(null);
    if (error) return flash('فشل النقل: ' + error.message, 'error');
    flash(`✅ نُقل إلى ${shelfDisplayName(shelf, shelves)}`);
    await onRefresh();
  }

  async function handleDropOnTrash() {
    const box = activeBoxForMove;
    if (!box) return;
    setConfirming({ type: 'box', box });
    setDraggedBox(null);
    setSelectedBoxForMove(null);
    setDragOverTrash(false);
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

        {/* نموذج تعديل المساحة — مودال يبقى ظاهراً أثناء التمرير */}
        {isFounder && editingZone && (
          <FormModal
            title={`✏️ تعديل المساحة ${fresh.letter}`}
            subtitle={fresh.name}
            onClose={() => setEditingZone(false)}
            maxWidth="max-w-lg"
          >
            <EditZoneForm
              zone={fresh}
              busy={busy}
              onCancel={() => setEditingZone(false)}
              onSave={handleUpdateZone}
            />
          </FormModal>
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
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-900 flex items-start gap-2">
            <span className="text-base">🔧</span>
            <div className="flex-1 space-y-0.5">
              <p>• اضغط على المربّعات الخضراء لإضافة صندوق · اضغط ➕ لإضافة بلا حدّ</p>
              <p>• <strong>اسحب أيّ صندوق</strong> إلى رف آخر لنقله، أو إلى 🗑 لحذفه</p>
              <p>• اضغط على اسم الرف ✏️ لإعادة تسميته · اضغط × لحذف عنصر</p>
            </div>
          </div>
        )}

        {/* سلّة الحذف — تعمل بالسحب أو بالنقر بعد اختيار صندوق */}
        {editMode && isFounder && (
          <div
            onDragOver={(e) => { if (activeBoxForMove) { e.preventDefault(); setDragOverTrash(true); } }}
            onDragLeave={() => setDragOverTrash(false)}
            onDrop={(e) => { e.preventDefault(); handleDropOnTrash(); }}
            onClick={() => activeBoxForMove && handleDropOnTrash()}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl border-4 border-dashed transition shadow-2xl cursor-pointer ${
              dragOverTrash
                ? 'bg-red-600 border-red-800 text-white scale-110'
                : activeBoxForMove
                  ? 'bg-red-100 border-red-500 text-red-800 animate-pulse'
                  : 'bg-white/95 border-red-300 text-red-600'
            }`}
          >
            <div className="text-3xl text-center mb-1">🗑</div>
            <div className="text-xs font-bold whitespace-nowrap">
              {dragOverTrash ? '⬇ أفلت للحذف' : activeBoxForMove ? 'اضغط هنا أو اسحب الصندوق للحذف' : 'سلّة الحذف'}
            </div>
          </div>
        )}

        {/* لوحة الإرشاد عند اختيار صندوق بالنقر */}
        {selectedBoxForMove && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-2xl border-2 border-blue-800 animate-fade-in">
            <p className="text-xs font-bold flex items-center gap-2">
              <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">{selectedBoxForMove.code}</span>
              <span>← اضغط على الرف الهدف أو السلّة. أو اضغط الصندوق مرّة أخرى للإلغاء.</span>
            </p>
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
                  // أعلى موقع موجود (لتقدير عدد الـ slots المعروضة)
                  const maxBoxIdx = shelfBoxes.length > 0
                    ? Math.max(...shelfBoxes.map(b => b.box_index || 0))
                    : 0;
                  const totalSlots = Math.max(shelf.max_boxes, maxBoxIdx);
                  // الرف يصير drop target حتى خارج edit mode إن كان فيه سحب نشط
                  const dragModeActive = !!activeBoxForMove;
                  const isDropTarget = dragOverShelfId === shelf.id;
                  // نستخدم div دائماً (لتجنّب button-in-button) — مع onClick على الـ div
                  return (
                    <div
                      key={shelf.id}
                      onClick={(e) => {
                        if (dragModeActive) { e.stopPropagation(); handleDropOnShelf(shelf); return; }
                        // تجاهل النقر إن كان من زرّ داخلي (الزرّ الداخلي يعالج نفسه عبر stopPropagation)
                        if (!editMode) onShelfClick(shelf);
                      }}
                      onDragOver={(e) => { if (activeBoxForMove) { e.preventDefault(); setDragOverShelfId(shelf.id); } }}
                      onDragLeave={() => setDragOverShelfId(null)}
                      onDrop={(e) => { if (activeBoxForMove) { e.preventDefault(); handleDropOnShelf(shelf); } }}
                      role={editMode ? undefined : 'button'}
                      className={`flex-1 bg-stone-50 border-2 rounded p-1 flex gap-1 relative text-right transition ${
                        (editMode || dragModeActive) ? '' : 'hover:bg-blue-50 hover:border-brand-blue cursor-pointer'
                      } ${isDropTarget ? 'ring-4 ring-blue-400 bg-blue-50' : ''}`}
                      style={{ borderColor: isDropTarget ? '#2563eb' : fresh.color }}
                    >
                      <span className="absolute top-0 right-0 text-white text-[9px] px-1.5 py-0.5 rounded-bl rounded-tr font-medium pointer-events-none" style={{ backgroundColor: fresh.color }}>
                        {shelfDisplayName(shelf, shelves)}
                      </span>
                      {!editMode && (
                        <span className="absolute top-0 left-0 bg-blue-600 text-white text-[8px] px-1 py-0.5 rounded-tr rounded-bl pointer-events-none">
                          ادخل ←
                        </span>
                      )}

                      {/* أيقونة "اسحب" واضحة في الزاوية للدلالة */}
                      {editMode && isFounder && shelfBoxes.length > 0 && (
                        <span className="absolute bottom-0 right-1 text-[8px] text-stone-500 italic pointer-events-none">
                          اسحب الصندوق ⇄
                        </span>
                      )}

                      {/* رسم الـ slots على أساس الموقع — كل slot = موقع 1, 2, 3... */}
                      {Array.from({ length: totalSlots }).map((_, idx) => {
                        const position = idx + 1;
                        const box = shelfBoxes.find(b => b.box_index === position);
                        if (box) {
                          const items = getBoxItems(box.id);
                          const isOut = isCheckedOut(box.id);
                          const isHighlighted = highlightedBox === box.code;
                          const isDragging = draggedBox?.id === box.id;
                          const isSelected = selectedBoxForMove?.id === box.id;
                          const isRecentlyAdded = recentlyAddedBoxId === box.id;
                          // المقبض الظاهر دائماً للمؤسّس (سواء edit mode أم لا)
                          const showHandle = isFounder;
                          return (
                            <div key={`box-${position}`}
                              className={`flex-1 relative ${isDragging ? 'opacity-30 scale-95' : ''} ${isSelected ? 'ring-4 ring-blue-500 ring-offset-1 scale-105' : ''} ${isRecentlyAdded ? 'ring-4 ring-green-500 ring-offset-1 animate-pulse' : ''} transition`}>
                              <CardboardBoxMini
                                code={box.code}
                                itemCount={items.length}
                                isHighlighted={isHighlighted}
                                isOut={isOut}
                                photoUrl={box.photo_url}
                              />
                              {/* مقبض السحب — ظاهر دائماً للمؤسّس، يُفعّل السحب عند الإمساك */}
                              {showHandle && (
                                <div
                                  draggable={true}
                                  onDragStart={(e) => handleBoxDragStart(e, box)}
                                  onDragEnd={handleBoxDragEnd}
                                  onClick={(e) => { e.stopPropagation(); handleBoxClickToSelect(box, e); }}
                                  className="absolute top-1 right-1 w-7 h-7 bg-white/95 border-2 border-amber-700 rounded shadow-md hover:bg-amber-50 cursor-grab active:cursor-grabbing flex items-center justify-center z-20"
                                  title="اسحب أو اضغط لنقل الصندوق"
                                >
                                  <span className="text-xs text-amber-800 font-bold leading-none">⊞</span>
                                </div>
                              )}
                              {isSelected && (
                                <span className="absolute bottom-0.5 left-0.5 text-[9px] text-white bg-blue-600 px-1 py-0.5 rounded pointer-events-none z-10">
                                  مختار · اضغط الهدف
                                </span>
                              )}
                              {editMode && isFounder && (
                                <button onClick={(e) => { e.stopPropagation(); setConfirming({ type: 'box', box }); }}
                                  className="absolute top-1 left-1 bg-white border border-red-300 text-red-600 text-[9px] w-5 h-5 rounded shadow-sm hover:bg-red-50 leading-none flex items-center justify-center z-20"
                                  title="حذف الصندوق">×</button>
                              )}
                            </div>
                          );
                        }
                        // الخانات الفارغة قابلة للنقر دائماً للمؤسّس (حتى خارج وضع التعديل)
                        return isFounder ? (
                          <button
                            key={`empty-${position}`}
                            onClick={(e) => { e.stopPropagation(); handleQuickAddBox(shelf, position); }}
                            disabled={busy}
                            className="flex-1 border-2 border-dashed border-green-400 bg-green-50 hover:bg-green-100 hover:border-green-500 rounded text-green-800 font-bold flex flex-col items-center justify-center gap-0.5 transition"
                            title={`اضغط لإضافة صندوق هنا (موقع ${position})`}>
                            <span className="text-lg leading-none">+</span>
                            <span className="text-[10px] leading-none">صندوق</span>
                            <span className="text-[8px] opacity-50 leading-none">#{position}</span>
                          </button>
                        ) : (
                          <div key={`empty-${position}`} className="flex-1 border border-dashed border-stone-300 rounded text-[9px] text-stone-400 flex items-center justify-center pointer-events-none">
                            فارغ
                          </div>
                        );
                      })}

                      {/* زر "إضافة موقع جديد" بعد كل المواقع — يضيف موقعاً جديداً */}
                      {editMode && isFounder && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleQuickAddBox(shelf, totalSlots + 1); }}
                          disabled={busy}
                          className="border-2 border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 rounded text-[9px] text-blue-700 font-bold flex flex-col items-center justify-center px-2"
                          title="إضافة موقع جديد في نهاية الرف"
                          style={{ minWidth: '40px' }}>
                          <span className="text-base leading-none">➕</span>
                          <span className="text-[8px]">جديد</span>
                        </button>
                      )}
                    </div>
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

        {/* (أُزيل الفورم المكرّر — التحرير الآن في قسم إدارة الأرفف بالأسفل) */}

        {/* قسم "إدارة الأرفف" — يظهر دائماً للمؤسّس (تسمية وحذف وإضافة من خارج الرف المرئي) */}
        {isFounder && (
          <div className="border-t border-stone-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-display font-bold text-stone-700">📚 إدارة الأرفف ({shelves.length})</h4>
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

            {/* قائمة الأرفف بأزرار إعادة تسمية ظاهرة */}
            {shelves.length > 0 && (
              <div className="space-y-1.5">
                {shelves.map(s => (
                  <div key={s.id} className="bg-stone-50 border border-stone-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between gap-2 p-2.5 text-xs">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-sm flex-shrink-0">📚</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{shelfDisplayName(s, shelves)}</div>
                          <div className="text-[10px] text-stone-500">
                            ارتفاع {s.height_cm}سم · يسع {s.max_boxes} · فيه {getShelfBoxes(s.shelf_index).length} صناديق
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setEditingShelfId(editingShelfId === s.id ? null : s.id)} disabled={busy}
                        className="text-[10px] bg-white border border-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100">
                        ✏️ تسمية وتعديل
                      </button>
                      <button onClick={() => setConfirming({ type: 'shelf', shelf: s })} disabled={busy}
                        className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100">
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* مودال تعديل الرف — يبقى ظاهراً أثناء التمرير */}
        {editingShelfId && (() => {
          const s = shelves.find(x => x.id === editingShelfId);
          if (!s) return null;
          return (
            <FormModal
              title={`✏️ تعديل ${shelfDisplayName(s, shelves)}`}
              onClose={() => setEditingShelfId(null)}
              maxWidth="max-w-md"
            >
              <EditShelfForm
                shelf={s}
                busy={busy}
                onCancel={() => setEditingShelfId(null)}
                onSave={(patch) => handleUpdateShelf(s, patch)}
              />
            </FormModal>
          );
        })()}
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
