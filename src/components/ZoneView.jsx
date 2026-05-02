import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { shelfDisplayName } from '../lib/helpers';
import CheckoutModal from './CheckoutModal';
import AddBoxModal from './AddBoxModal';
import { AddShelfForm, EditZoneForm, EditShelfForm, AddBoxForm, ConfirmDelete, StatusToast, FormModal, useFlash } from './BuilderForms';
import { CardboardBoxMini } from './CardboardBox';
import WarehouseMiniMap from './WarehouseMiniMap';
import LocationPicker from './LocationPicker';
import {
  rpcAddShelf, rpcUpdateShelf, rpcDeleteShelf,
  rpcUpdateZone, rpcDeleteZone, rpcAddBox, deleteBox, moveBoxToShelf,
  bulkMoveBoxes, bulkDeleteBoxes, bulkUpdateBoxes, bulkMoveBoxesToZone, assignItemToBox,
  moveBoxToPosition
} from '../lib/warehouseOps';

export default function ZoneView({ zone, data, onBack, onShelfClick, onItemClick, onZoneSwitch, onRefresh }) {
  const { can, isFounder, activeWarehouse } = useAuth();
  const [highlightedBox, setHighlightedBox] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);

  // وضع العرض: rack (الرف المرئي) | items (قائمة كل الأغراض في المساحة)
  const [zoneViewMode, setZoneViewMode] = useState('rack');

  // وضع التعديل التفاعلي على الرفّ
  const [editMode, setEditMode] = useState(false);

  // حالة السحب والإفلات (للديسكتوب) + النقر للاختيار المتعدّد (للجوال أو لتحرّكات جماعيّة)
  const [draggedBox, setDraggedBox] = useState(null);
  // مجموعة معرّفات الصناديق المختارة (تدعم التحديد المتعدّد)
  const [selectedBoxIds, setSelectedBoxIds] = useState(() => new Set());
  const [dragOverShelfId, setDragOverShelfId] = useState(null);
  const [dragOverTrash, setDragOverTrash] = useState(false);
  // الصندوق المُضاف حديثاً (لإبرازه بصرياً)
  const [recentlyAddedBoxId, setRecentlyAddedBoxId] = useState(null);
  // مودال تعديل الوصف الجماعي
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  // مُنتقي مستودع آخر لنقل الصناديق إليه
  const [showCrossWhMove, setShowCrossWhMove] = useState(false);

  // قائمة الصناديق "النشطة" للنقل/الحذف:
  //   - إذا في وضع سحب → الصندوق المسحوب (مع كلّ ما هو مختار معه إن كان ضمن الاختيار)
  //   - وإلا → جميع المختار
  const selectedBoxesArray = (data.boxes || []).filter(b => selectedBoxIds.has(b.id));
  const activeBoxesForMove = draggedBox
    ? (selectedBoxIds.has(draggedBox.id) ? selectedBoxesArray : [draggedBox])
    : selectedBoxesArray;
  const hasActiveSelection = activeBoxesForMove.length > 0;
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
  // الأغراض غير المحدّدة في هذه المساحة (box_id = null, zone_id = هذه المساحة)
  const unassignedItems = data.items.filter(it => it.box_id == null && it.zone_id === fresh.id);
  // مودال تحديد مكان غرض غير محدّد
  const [assigningItem, setAssigningItem] = useState(null);
  // مُنتقي بصريّ لنقل صندوق إلى مساحة أخرى — يحفظ {box, targetZone}
  const [pickingPositionFor, setPickingPositionFor] = useState(null);

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

  function getBoxItemCount(box_id) {
    return data.items.filter(it => it.box_id === box_id).length;
  }

  async function handleDeleteBox(keepItems = false) {
    setBusy(true);
    const { error } = await deleteBox(confirming.box.id, { keepItems });
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(keepItems ? '✅ حُذف الصندوق وبقيت الأغراض في المساحة' : '✅ حُذف الصندوق وأغراضه');
    await onRefresh();
  }

  async function handleAssignItem(target_box_id) {
    if (!assigningItem || !target_box_id) return;
    setBusy(true);
    const { error } = await assignItemToBox(assigningItem.id, target_box_id);
    setBusy(false);
    setAssigningItem(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمّ تحديد مكان الغرض');
    await onRefresh();
  }

  // إنشاء صندوق جديد فوراً وتحديد الغرض بداخله (لمساحات بدون صناديق)
  async function handleCreateBoxAndAssign() {
    if (!assigningItem) return;
    if (shelves.length === 0) {
      return flash('هذه المساحة بدون أرفف — أضِف رفّاً أوّلاً من قسم إدارة الأرفف', 'error');
    }
    setBusy(true);
    // أنشئ صندوقاً في أوّل موقع متاح في أوّل رفّ
    const firstShelf = shelves[0];
    const { data: newBoxId, error: bErr } = await rpcAddBox(firstShelf.id, {
      description: `(لـ${assigningItem.name})`,
      width_cm: 50, height_cm: 65
    });
    if (bErr) {
      setBusy(false);
      return flash('فشل إنشاء صندوق: ' + bErr.message, 'error');
    }
    // ضع الغرض في الصندوق الجديد
    const { error: aErr } = await assignItemToBox(assigningItem.id, newBoxId);
    setBusy(false);
    setAssigningItem(null);
    if (aErr) return flash('فشل: ' + aErr.message, 'error');
    flash('✅ أُنشئ صندوق جديد ووُضع فيه الغرض');
    await onRefresh();
  }

  // حذف غرض غير محدّد (نقل لسلّة المحذوفات)
  async function handleDeleteUnassigned(item) {
    if (!confirm(`حذف "${item.name}"؟ يمكن استرجاعه من سلّة المحذوفات لاحقاً.`)) return;
    setBusy(true);
    const { error } = await supabase.from('items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', item.id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ نُقل لسلّة المحذوفات');
    await onRefresh();
  }

  // إفلات على موقع محدّد داخل رفّ (للنقل بترتيب دقيق، أو الإضافة بدون اختيار)
  async function handleDropOrClickOnPosition(shelf, position) {
    if (hasActiveSelection) {
      // نقل الصندوق المختار إلى هذا الموقع بالضبط
      const boxes = activeBoxesForMove;
      if (boxes.length !== 1) {
        return flash('لاختيار موقع دقيق، اختر صندوقاً واحداً فقط', 'error');
      }
      setBusy(true);
      const { error } = await moveBoxToPosition(boxes[0].id, shelf.id, position);
      setBusy(false);
      clearSelection();
      if (error) return flash('فشل النقل: ' + error.message, 'error');
      flash(`✅ نُقل إلى الموقع ${position}`);
      await onRefresh();
    } else {
      // لا يوجد اختيار → السلوك القديم: إضافة صندوق جديد في هذا الموقع
      handleQuickAddBox(shelf, position);
    }
  }

  // إفلات على مساحة من الخريطة المصغّرة
  async function handleDropOnZone(targetZone) {
    if (targetZone.id === fresh.id) {
      clearSelection();
      return;
    }
    const boxes = activeBoxesForMove;
    if (boxes.length === 0) return;

    // فحص "ممتلئة"
    const targetShelves = targetZone.shelves || [];
    if (targetShelves.length === 0) {
      return flash(`المساحة ${targetZone.letter} لا تحوي أرففاً — أنشئ رفّاً أوّلاً`, 'error');
    }
    const targetCapacity = targetShelves.reduce((s, sh) => s + (sh.max_boxes || 0), 0);
    const targetUsed = data.boxes.filter(b => b.code.startsWith(targetZone.letter + '-')).length;
    const targetAvailable = targetCapacity - targetUsed;
    if (targetAvailable < boxes.length) {
      return flash(`المساحة ${targetZone.letter} ممتلئة — متاح ${targetAvailable} فقط من أصل ${boxes.length} مطلوب`, 'error');
    }

    // صندوق واحد → افتح المُنتقي البصريّ ليختار المستخدم الموقع بنفسه
    if (boxes.length === 1) {
      setPickingPositionFor({ box: boxes[0], targetZone });
      return;
    }

    // أكثر من صندوق → نقل جماعي تلقائي (ضع في أوّل المواقع المتاحة)
    setBusy(true);
    const { error } = await bulkMoveBoxesToZone(boxes.map(b => b.id), targetZone.id);
    setBusy(false);
    clearSelection();
    if (error) return flash('فشل النقل: ' + error.message, 'error');
    flash(`✅ نُقل ${boxes.length} صناديق إلى مساحة ${targetZone.letter}`);
    await onRefresh();
  }

  // عند اختيار الموقع الدقيق من المُنتقي البصريّ
  async function handlePickedPositionForMove({ shelf, position }) {
    if (!pickingPositionFor) return;
    const { box, targetZone } = pickingPositionFor;
    setBusy(true);
    const { error } = await moveBoxToPosition(box.id, shelf.id, position);
    setBusy(false);
    setPickingPositionFor(null);
    clearSelection();
    if (error) return flash('فشل النقل: ' + error.message, 'error');
    flash(`✅ نُقل إلى ${targetZone.letter}-${shelf.shelf_index}-${position}`);
    await onRefresh();
  }

  // نقل الصناديق المختارة إلى مستودع آخر (ربّما يحتاج اختيار موقع لكل صندوق على حدة)
  async function handleCrossWarehouseMove({ shelf, position, warehouse, isCrossWh }) {
    const boxes = activeBoxesForMove;
    if (boxes.length === 0) return;
    if (boxes.length === 1) {
      // صندوق واحد → موقع محدّد
      setBusy(true);
      const { error } = await moveBoxToPosition(boxes[0].id, shelf.id, position);
      setBusy(false);
      setShowCrossWhMove(false);
      clearSelection();
      if (error) return flash('فشل النقل: ' + error.message, 'error');
      flash(`✅ نُقل إلى ${warehouse.name} · ${position}`);
      await onRefresh();
    } else {
      // عدّة صناديق → نقل جماعي إلى الرفّ المختار (يأخذ مواقع متسلسلة من الموقع المختار)
      setBusy(true);
      const { error } = await bulkMoveBoxes(boxes.map(b => b.id), shelf.id);
      setBusy(false);
      setShowCrossWhMove(false);
      clearSelection();
      if (error) return flash('فشل النقل: ' + error.message, 'error');
      flash(`✅ نُقل ${boxes.length} ${boxes.length === 1 ? 'صندوق' : 'صناديق'} إلى ${warehouse.name}`);
      await onRefresh();
    }
  }

  // ====== السحب والإفلات + النقر للاختيار المتعدّد ======
  function handleBoxDragStart(e, box) {
    // إن لم يكن الصندوق ضمن الاختيار الحالي → اعتبره وحيداً (يستبدل الاختيار)
    if (!selectedBoxIds.has(box.id)) {
      setSelectedBoxIds(new Set([box.id]));
    }
    setDraggedBox(box);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', box.id);
    if (e.currentTarget) {
      try { e.dataTransfer.setDragImage(e.currentTarget, 0, 0); } catch {}
    }
  }

  function handleBoxDragEnd() {
    setDraggedBox(null);
    setDragOverShelfId(null);
    setDragOverTrash(false);
  }

  // تبديل الاختيار: نقر يضيف/يزيل من الاختيار المتعدّد
  function handleBoxClickToSelect(box, e) {
    if (!isFounder) return;
    e?.stopPropagation();
    setSelectedBoxIds(prev => {
      const next = new Set(prev);
      if (next.has(box.id)) next.delete(box.id);
      else next.add(box.id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedBoxIds(new Set());
    setDraggedBox(null);
  }

  // تحديد كل صناديق رف معيّن
  function selectAllInShelf(shelfIndex) {
    const ids = zoneBoxes.filter(b => b.code.split('-')[1] === String(shelfIndex)).map(b => b.id);
    setSelectedBoxIds(new Set(ids));
  }

  // تحديد كل صناديق المساحة
  function selectAllInZone() {
    setSelectedBoxIds(new Set(zoneBoxes.map(b => b.id)));
  }

  async function handleDropOnShelf(shelf) {
    const boxes = activeBoxesForMove;
    if (boxes.length === 0) return;

    // فلترة الصناديق التي بالفعل في الرف الهدف (no-op لها)
    const toMove = boxes.filter(b => {
      const currentShelfIndex = parseInt(b.code.split('-')[1]);
      return currentShelfIndex !== shelf.shelf_index;
    });

    if (toMove.length === 0) {
      clearSelection();
      setDragOverShelfId(null);
      return;
    }

    setBusy(true);
    const { error } = await bulkMoveBoxes(toMove.map(b => b.id), shelf.id);
    setBusy(false);
    clearSelection();
    setDragOverShelfId(null);
    if (error) return flash('فشل النقل: ' + error.message, 'error');
    flash(toMove.length === 1
      ? `✅ نُقل إلى ${shelfDisplayName(shelf, shelves)}`
      : `✅ نُقل ${toMove.length} صناديق إلى ${shelfDisplayName(shelf, shelves)}`);
    await onRefresh();
  }

  async function handleDropOnTrash() {
    const boxes = activeBoxesForMove;
    if (boxes.length === 0) return;
    if (boxes.length === 1) {
      setConfirming({ type: 'box', box: boxes[0] });
    } else {
      setConfirming({ type: 'bulk-delete', boxes });
    }
    setDraggedBox(null);
    setDragOverTrash(false);
  }

  async function handleBulkDelete(keepItems = false) {
    const ids = confirming.boxes.map(b => b.id);
    setBusy(true);
    const { error } = await bulkDeleteBoxes(ids, { keepItems });
    setBusy(false);
    setConfirming(null);
    clearSelection();
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(keepItems
      ? `✅ حُذف ${ids.length} صناديق وبقيت أغراضها`
      : `✅ حُذف ${ids.length} صناديق وأغراضها`);
    await onRefresh();
  }

  async function handleBulkUpdateDescription(newDescription) {
    const ids = Array.from(selectedBoxIds);
    setBusy(true);
    const { error } = await bulkUpdateBoxes(ids, { description: newDescription });
    setBusy(false);
    setShowBulkEdit(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تمّ تعديل وصف ${ids.length} صناديق`);
    clearSelection();
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
                {zoneBoxes.length > 0 && (
                  <button onClick={selectAllInZone} disabled={busy}
                    className="text-[11px] bg-blue-50 border border-blue-300 text-blue-800 px-2.5 py-1.5 rounded hover:bg-blue-100 font-medium">
                    ✓ حدّد كل الصناديق ({zoneBoxes.length})
                  </button>
                )}
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

        {/* سلّة الحذف — تعمل بالسحب أو بالنقر بعد اختيار صناديق (تظهر دائماً للمؤسّس عند وجود اختيار) */}
        {isFounder && hasActiveSelection && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverTrash(true); }}
            onDragLeave={() => setDragOverTrash(false)}
            onDrop={(e) => { e.preventDefault(); handleDropOnTrash(); }}
            onClick={() => handleDropOnTrash()}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl border-4 border-dashed transition shadow-2xl cursor-pointer ${
              dragOverTrash
                ? 'bg-red-600 border-red-800 text-white scale-110'
                : 'bg-red-100 border-red-500 text-red-800 animate-pulse'
            }`}
          >
            <div className="text-3xl text-center mb-1">🗑</div>
            <div className="text-xs font-bold whitespace-nowrap">
              {dragOverTrash
                ? '⬇ أفلت للحذف'
                : activeBoxesForMove.length > 1
                  ? `حذف ${activeBoxesForMove.length} صناديق`
                  : 'حذف الصندوق'}
            </div>
          </div>
        )}

        {/* شريط التحديد المتعدّد العائم */}
        {selectedBoxIds.size > 0 && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-3 rounded-xl shadow-2xl border-2 border-blue-800 animate-fade-in max-w-[95vw]">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="bg-white/20 px-2.5 py-1 rounded text-xs font-bold whitespace-nowrap">
                {selectedBoxIds.size} {selectedBoxIds.size === 1 ? 'صندوق مختار' : 'صناديق مختارة'}
              </span>
              <span className="text-[10px] opacity-90 hidden sm:inline">اضغط على رف لنقل الكلّ، أو على السلّة للحذف</span>
              <div className="flex items-center gap-1.5 mr-2">
                <button onClick={() => setShowCrossWhMove(true)}
                  className="text-[11px] bg-amber-500/30 hover:bg-amber-500/40 px-2.5 py-1 rounded font-medium border border-amber-200/30">
                  🔄 نقل لمستودع آخر
                </button>
                <button onClick={() => setShowBulkEdit(true)}
                  className="text-[11px] bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded font-medium">
                  ✏️ تعديل الوصف
                </button>
                <button onClick={clearSelection}
                  className="text-[11px] bg-white/30 hover:bg-white/40 px-2.5 py-1 rounded font-medium">
                  ✕ إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* قسم الأغراض غير المحدّدة المكان (إن وُجدت) */}
        {unassignedItems.length > 0 && (
          <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h4 className="text-xs font-display font-bold text-amber-900 flex items-center gap-1.5">
                📍 أغراض غير محدّدة المكان ({unassignedItems.length})
              </h4>
              <span className="text-[10px] text-amber-700">اضغط "حدّد المكان" لتخصيص صندوق لكلّ غرض</span>
            </div>
            <div className="space-y-1.5">
              {unassignedItems.map(it => (
                <div key={it.id} className="bg-white border border-amber-200 rounded-lg p-2 flex items-center gap-2.5">
                  {it.photo_url ? (
                    <img src={it.photo_url} alt={it.name} className="w-10 h-10 object-cover rounded border border-stone-200 flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-stone-100 flex items-center justify-center text-lg flex-shrink-0">🔧</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{it.name}</div>
                    <div className="text-[10px] text-stone-500">الكميّة: {it.quantity} · بدون صندوق</div>
                  </div>
                  {isFounder && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setAssigningItem(it)}
                        className="text-[10px] bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 rounded font-medium whitespace-nowrap">
                        📍 حدّد المكان
                      </button>
                      <button onClick={() => handleDeleteUnassigned(it)}
                        className="text-[10px] bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 px-2 py-1.5 rounded"
                        title="حذف الغرض">
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
                  // الرف يصير drop target حتى خارج edit mode إن كان فيه سحب أو اختيار نشط
                  const dragModeActive = hasActiveSelection;
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
                      onDragOver={(e) => { if (hasActiveSelection) { e.preventDefault(); setDragOverShelfId(shelf.id); } }}
                      onDragLeave={() => setDragOverShelfId(null)}
                      onDrop={(e) => { if (hasActiveSelection) { e.preventDefault(); handleDropOnShelf(shelf); } }}
                      role={editMode ? undefined : 'button'}
                      className={`flex-1 bg-stone-50 border-2 rounded p-1 flex gap-1 relative text-right transition ${
                        (editMode || dragModeActive) ? '' : 'hover:bg-blue-50 hover:border-brand-blue cursor-pointer'
                      } ${isDropTarget ? 'ring-4 ring-blue-400 bg-blue-50' : ''}`}
                      style={{ borderColor: isDropTarget ? '#2563eb' : fresh.color }}
                    >
                      <span className="absolute -top-2.5 right-2 text-white text-[10px] px-2 py-0.5 rounded-md font-bold shadow-md pointer-events-none z-30" style={{ backgroundColor: fresh.color }}>
                        {shelfDisplayName(shelf, shelves)}
                      </span>
                      {!editMode && (
                        <span className="absolute -top-2.5 left-2 bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-md font-medium shadow-md pointer-events-none z-30">
                          ادخل ←
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
                          const isSelected = selectedBoxIds.has(box.id);
                          const isRecentlyAdded = recentlyAddedBoxId === box.id;
                          // المقبض الظاهر دائماً للمؤسّس (سواء edit mode أم لا)
                          const showHandle = isFounder;
                          // الصندوق هدف إفلات إن كان هناك اختيار من صندوق آخر
                          const isPositionDropTarget = hasActiveSelection && !activeBoxesForMove.find(b => b.id === box.id);
                          return (
                            <div key={`box-${position}`}
                              onDragOver={(e) => { if (isPositionDropTarget) { e.preventDefault(); e.stopPropagation(); } }}
                              onDrop={(e) => {
                                if (isPositionDropTarget) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDropOrClickOnPosition(shelf, position);
                                }
                              }}
                              className={`flex-1 relative ${isDragging ? 'opacity-30 scale-95' : ''} ${isSelected ? 'ring-4 ring-blue-500 ring-offset-1 scale-105' : ''} ${isRecentlyAdded ? 'ring-4 ring-green-500 ring-offset-1 animate-pulse' : ''} ${isPositionDropTarget ? 'ring-2 ring-purple-400 ring-offset-1' : ''} transition`}>
                              <CardboardBoxMini
                                code={box.code}
                                itemCount={items.length}
                                isHighlighted={isHighlighted}
                                isOut={isOut}
                                photoUrl={box.photo_url}
                              />
                              {isPositionDropTarget && (
                                <div className="absolute inset-0 bg-purple-500/25 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none rounded-lg ring-2 ring-purple-500 ring-offset-1 animate-pulse">
                                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-purple-700 fill-current drop-shadow">
                                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                  </svg>
                                </div>
                              )}
                              {/* مقبض السحب — أيقونة "نقاط الإمساك" المعتمدة عالمياً */}
                              {showHandle && (
                                <div
                                  draggable={true}
                                  onDragStart={(e) => handleBoxDragStart(e, box)}
                                  onDragEnd={handleBoxDragEnd}
                                  onClick={(e) => { e.stopPropagation(); handleBoxClickToSelect(box, e); }}
                                  className={`absolute top-1 right-1 w-7 h-7 rounded-lg shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center z-20 transition ${
                                    isSelected
                                      ? 'bg-blue-600 border-2 border-blue-700 hover:bg-blue-700'
                                      : 'bg-white/95 border-2 border-amber-700 hover:bg-amber-50'
                                  }`}
                                  title="اسحب أو اضغط لنقل الصندوق"
                                >
                                  <svg viewBox="0 0 24 24" className={`w-4 h-4 ${isSelected ? 'fill-white' : 'fill-amber-800'}`}>
                                    <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/>
                                  </svg>
                                </div>
                              )}
                              {isSelected && (
                                <span className="absolute bottom-0.5 left-0.5 text-[9px] text-white bg-blue-600 px-1.5 py-0.5 rounded pointer-events-none z-10 font-bold shadow">
                                  ✓ مختار
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
                        // وتقبل الإفلات إن كان هناك اختيار → نقل إلى هذا الموقع بالضبط
                        return isFounder ? (
                          <button
                            key={`empty-${position}`}
                            onClick={(e) => { e.stopPropagation(); handleDropOrClickOnPosition(shelf, position); }}
                            onDragOver={(e) => { if (hasActiveSelection) { e.preventDefault(); e.stopPropagation(); } }}
                            onDrop={(e) => {
                              if (hasActiveSelection) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDropOrClickOnPosition(shelf, position);
                              }
                            }}
                            disabled={busy}
                            className={`flex-1 border-2 border-dashed rounded-lg font-bold flex flex-col items-center justify-center gap-0.5 transition ${
                              hasActiveSelection
                                ? 'border-purple-500 bg-purple-50 hover:bg-purple-100 hover:border-purple-700 text-purple-800'
                                : 'border-green-400 bg-green-50 hover:bg-green-100 hover:border-green-500 text-green-800'
                            }`}
                            title={hasActiveSelection
                              ? `أفلت هنا لنقل الصندوق إلى الموقع ${position}`
                              : `اضغط لإضافة صندوق هنا (موقع ${position})`}>
                            {hasActiveSelection ? (
                              <>
                                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current drop-shadow-sm">
                                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                </svg>
                                <span className="text-[9px] opacity-70 leading-none">#{position}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-lg leading-none">+</span>
                                <span className="text-[10px] leading-none">صندوق</span>
                                <span className="text-[8px] opacity-50 leading-none">#{position}</span>
                              </>
                            )}
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
              <FormModal
                title="+ رفّ جديد"
                subtitle={`في مساحة ${fresh.letter} — ${fresh.name}`}
                onClose={() => setShowAddShelfForm(false)}
                maxWidth="max-w-md"
              >
                <AddShelfForm
                  busy={busy}
                  hasExistingShelves={shelves.length > 0}
                  onCancel={() => setShowAddShelfForm(false)}
                  onSave={handleAddShelf}
                />
              </FormModal>
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
      {confirming?.type === 'box' && (() => {
        const itemCount = getBoxItemCount(confirming.box.id);
        if (itemCount === 0) {
          return (
            <ConfirmDelete
              message={`سيُحذف الصندوق ${confirming.box.code} (فارغ). هل أنت متأكّد؟`}
              busy={busy}
              onConfirm={() => handleDeleteBox(false)}
              onCancel={() => setConfirming(null)}
            />
          );
        }
        return (
          <DeleteBoxWithItemsModal
            boxCode={confirming.box.code}
            itemCount={itemCount}
            busy={busy}
            onDeleteAll={() => handleDeleteBox(false)}
            onKeepItems={() => handleDeleteBox(true)}
            onCancel={() => setConfirming(null)}
          />
        );
      })()}
      {confirming?.type === 'bulk-delete' && (() => {
        const totalItems = confirming.boxes.reduce((sum, b) => sum + getBoxItemCount(b.id), 0);
        if (totalItems === 0) {
          return (
            <ConfirmDelete
              message={`سيُحذف ${confirming.boxes.length} صناديق فارغة. هل أنت متأكّد؟`}
              busy={busy}
              onConfirm={() => handleBulkDelete(false)}
              onCancel={() => setConfirming(null)}
            />
          );
        }
        return (
          <DeleteBoxWithItemsModal
            boxCode={`${confirming.boxes.length} صناديق`}
            itemCount={totalItems}
            isBulk={true}
            busy={busy}
            onDeleteAll={() => handleBulkDelete(false)}
            onKeepItems={() => handleBulkDelete(true)}
            onCancel={() => setConfirming(null)}
          />
        );
      })()}

      {/* مودال تحديد مكان غرض غير محدّد */}
      {assigningItem && (
        <FormModal
          title={`📍 تحديد مكان "${assigningItem.name}"`}
          subtitle={`الكميّة: ${assigningItem.quantity} · في مساحة ${fresh.letter}`}
          onClose={() => setAssigningItem(null)}
          maxWidth="max-w-lg"
        >
          {zoneBoxes.length === 0 ? (
            <div className="text-center py-4 space-y-3">
              <div className="text-3xl">📭</div>
              <p className="text-sm text-stone-700">لا توجد صناديق في هذه المساحة بعد</p>
              <p className="text-[11px] text-stone-500">يمكنك إنشاء صندوق جديد فوراً ووضع الغرض فيه</p>
              <button
                onClick={handleCreateBoxAndAssign}
                disabled={busy || shelves.length === 0}
                className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg text-xs font-bold disabled:opacity-50">
                + 📦 أنشئ صندوقاً جديداً وضع الغرض فيه
              </button>
              {shelves.length === 0 && (
                <p className="text-[10px] text-red-600 mt-2">⚠ لا يمكن إنشاء صندوق — أضِف رفّاً أولاً من قسم "إدارة الأرفف"</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-stone-600">اختر الصندوق الذي يُحفَظ فيه هذا الغرض، أو أنشئ صندوقاً جديداً:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {zoneBoxes.map(b => (
                  <button key={b.id}
                    onClick={() => handleAssignItem(b.id)}
                    disabled={busy}
                    className="bg-white border-2 border-stone-200 rounded-lg p-2.5 text-center hover:border-amber-500 hover:bg-amber-50 transition disabled:opacity-50">
                    <div className="text-xs font-mono font-bold" style={{ color: fresh.color }}>{b.code}</div>
                    {b.description && <div className="text-[9px] text-stone-500 mt-0.5 truncate">{b.description}</div>}
                  </button>
                ))}
                <button
                  onClick={handleCreateBoxAndAssign}
                  disabled={busy}
                  className="bg-amber-50 border-2 border-dashed border-amber-400 rounded-lg p-2.5 text-center hover:bg-amber-100 hover:border-amber-600 transition disabled:opacity-50 text-amber-800">
                  <div className="text-lg leading-none">+</div>
                  <div className="text-[10px] font-bold mt-1">صندوق جديد</div>
                  <div className="text-[8px] opacity-70">ضع الغرض هنا</div>
                </button>
              </div>
            </div>
          )}
        </FormModal>
      )}

      {/* الخريطة المصغّرة العائمة — للنقل بالسحب أو الانتقال السريع بين المساحات */}
      <WarehouseMiniMap
        zones={data.zones || []}
        currentZoneId={fresh.id}
        hasActiveSelection={hasActiveSelection}
        selectionLabel={`${activeBoxesForMove.length} ${activeBoxesForMove.length === 1 ? 'صندوق' : 'صناديق'}`}
        onDropOnZone={handleDropOnZone}
        onZoneNavigate={onZoneSwitch}
      />

      {/* مُنتقي الموقع الدقيق عند نقل صندوق إلى مساحة أخرى */}
      {pickingPositionFor && (
        <LocationPicker
          mode="box"
          data={data}
          initialZone={pickingPositionFor.targetZone}
          lockZone={true}
          onCancel={() => setPickingPositionFor(null)}
          onSelect={handlePickedPositionForMove}
          title={`📍 نقل ${pickingPositionFor.box.code}`}
          subtitle={`اختر الموقع الدقيق في مساحة ${pickingPositionFor.targetZone.letter} — ${pickingPositionFor.targetZone.name}`}
        />
      )}

      {/* مُنتقي مستودع آخر — لنقل الصناديق المختارة بين المستودعات */}
      {showCrossWhMove && (
        <LocationPicker
          mode="box"
          data={data}
          activeWarehouse={activeWarehouse}
          onCancel={() => setShowCrossWhMove(false)}
          onSelect={handleCrossWarehouseMove}
          title={`🔄 نقل ${activeBoxesForMove.length} ${activeBoxesForMove.length === 1 ? 'صندوق' : 'صناديق'} لمستودع آخر`}
          subtitle="اختر المستودع الهدف ثمّ المساحة ثمّ الموقع"
        />
      )}

      {/* مودال تعديل الوصف الجماعي */}
      {showBulkEdit && (
        <FormModal
          title={`✏️ تعديل وصف ${selectedBoxIds.size} صناديق`}
          subtitle="سيُطبَّق نفس الوصف على كلّ الصناديق المختارة"
          onClose={() => setShowBulkEdit(false)}
          maxWidth="max-w-md"
        >
          <BulkDescriptionForm
            count={selectedBoxIds.size}
            busy={busy}
            onCancel={() => setShowBulkEdit(false)}
            onSave={handleBulkUpdateDescription}
          />
        </FormModal>
      )}
    </>
  );
}

// ============ مودال حذف الصندوق مع/بدون أغراضه ============
function DeleteBoxWithItemsModal({ boxCode, itemCount, isBulk = false, busy, onDeleteAll, onKeepItems, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
        <div className="bg-gradient-to-l from-red-50 to-amber-50 px-5 py-4 border-b border-stone-200">
          <h3 className="text-sm font-display font-bold flex items-center gap-2">
            ⚠️ {isBulk ? 'حذف صناديق فيها أغراض' : `حذف الصندوق ${boxCode}`}
          </h3>
          <p className="text-xs text-stone-600 mt-1">
            {isBulk
              ? `الصناديق المختارة تحتوي على ${itemCount} ${itemCount === 1 ? 'غرض' : 'أغراض'}. ماذا تفعل بها؟`
              : `هذا الصندوق يحتوي على ${itemCount} ${itemCount === 1 ? 'غرض' : 'أغراض'}. ماذا تفعل بها؟`
            }
          </p>
        </div>

        <div className="p-4 space-y-2">
          <button
            onClick={onKeepItems}
            disabled={busy}
            className="w-full text-right bg-white border-2 border-amber-300 hover:border-amber-500 hover:bg-amber-50 rounded-xl p-3 transition disabled:opacity-50">
            <div className="flex items-start gap-2">
              <span className="text-xl">📍</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-amber-900">احتفظ بالأغراض في المساحة</div>
                <div className="text-[11px] text-stone-600 mt-0.5">
                  يُحذَف الصندوق فقط. الأغراض تبقى داخل المساحة كـ"غير محدّدة" — وعليك تحديد صندوق جديد لها لاحقاً.
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={onDeleteAll}
            disabled={busy}
            className="w-full text-right bg-white border-2 border-red-300 hover:border-red-500 hover:bg-red-50 rounded-xl p-3 transition disabled:opacity-50">
            <div className="flex items-start gap-2">
              <span className="text-xl">🗑</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-red-900">احذف الصندوق والأغراض معاً</div>
                <div className="text-[11px] text-stone-600 mt-0.5">
                  يُمكن استرجاع الكلّ من سلّة المحذوفات لاحقاً.
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="px-4 pb-4 flex justify-end">
          <button onClick={onCancel} disabled={busy}
            className="text-xs px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-100">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// نموذج بسيط لتعديل الوصف الجماعي
function BulkDescriptionForm({ count, busy, onCancel, onSave }) {
  const [description, setDescription] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(description); }} className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1">الوصف الجديد</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="مثال: عُدّة الفعاليّات الصيفيّة"
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs"
          autoFocus
        />
        <p className="text-[10px] text-stone-500 mt-1">سيستبدل وصف كلّ الـ{count} صناديق المختارة</p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy}
          className="text-xs px-4 py-1.5 border border-stone-300 rounded hover:bg-stone-50">
          إلغاء
        </button>
        <button type="submit" disabled={busy}
          className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {busy ? '...' : '💾 حفظ على الكلّ'}
        </button>
      </div>
    </form>
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
