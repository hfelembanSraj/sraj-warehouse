import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { shelfDisplayName } from '../lib/helpers';
import CheckoutModal from './CheckoutModal';
import AddBoxModal from './AddBoxModal';
import { AddShelfForm, EditZoneForm, EditShelfForm, AddBoxForm, ConfirmDelete, StatusToast, FormModal, useFlash } from './BuilderForms';
import { CardboardBoxMini } from './CardboardBox';
import PhotoUploader from './PhotoUploader';
import WarehouseMiniMap from './WarehouseMiniMap';
import LocationPicker from './LocationPicker';
import {
  rpcAddShelf, rpcUpdateShelf, rpcDeleteShelf,
  rpcUpdateZone, rpcDeleteZone, rpcAddBox, deleteBox, moveBoxToShelf,
  bulkMoveBoxes, bulkDeleteBoxes, bulkUpdateBoxes, bulkMoveBoxesToZone, assignItemToBox,
  moveBoxToPosition, addStackedBox
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
  // قسم إدارة الأرفف مخفيّ افتراضياً — يظهر بالضغط على زرّه
  const [shelvesAdminOpen, setShelvesAdminOpen] = useState(false);
  // إضافة غرض من قائمة "كل أغراض المساحة" — يفتح اختيار صندوق ثمّ تفاصيل الغرض
  const [addingItemInZone, setAddingItemInZone] = useState(false);
  const [pickedBoxForNewItem, setPickedBoxForNewItem] = useState(null);

  async function handleSubmitNewItemInZone(values) {
    if (!pickedBoxForNewItem || !values.name?.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('items').insert({
      box_id: pickedBoxForNewItem.id,
      name: values.name.trim(),
      quantity: Number(values.quantity) || 1,
      status: 'ok',
      photo_url: values.photo_url || null
    });
    setBusy(false);
    setPickedBoxForNewItem(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ أُضيف "${values.name}" إلى ${pickedBoxForNewItem.code}`);
    await onRefresh();
  }

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
  // أغراض هذه المساحة بدون صندوق:
  //   - shelf_id مضبوط → غرض كبير يشغل موقع صندوق على الرفّ
  //   - بدون shelf_id → "غير محدّد المكان" (يُعرَض في القائمة)
  const shelfIdSet = new Set(shelves.map(s => s.id));
  const zoneNoBox = data.items.filter(it => it.box_id == null && it.zone_id === fresh.id);
  const shelfItems = zoneNoBox.filter(it => it.shelf_id && shelfIdSet.has(it.shelf_id));
  const unassignedItems = zoneNoBox.filter(it => !it.shelf_id);
  // اختيار "صندوق أم غرض كبير" عند النقر على موقع فارغ — { shelf, position }
  const [slotChoice, setSlotChoice] = useState(null);
  // نموذج تفاصيل الغرض الكبير بعد اختيار "غرض كبير" — { shelf, position }
  const [addItemAtSlot, setAddItemAtSlot] = useState(null);
  // مودال تعديل غرض كبير على الرفّ
  const [editingShelfItem, setEditingShelfItem] = useState(null);
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
    const { error, photoError } = await rpcAddBox(addBoxOnShelf.id, values);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    if (photoError) { flash('تمّ إنشاء الصندوق لكن تعذّر حفظ الصورة — أعد رفعها من تعديل الصندوق', 'error'); setAddBoxOnShelf(null); await onRefresh(); return; }
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

  // إضافة صندوق مُكدَّس فوق صندوق موجود (نفس الموقع، stack_index أعلى)
  async function handleStackBox(belowBox) {
    setBusy(true);
    const { data: newId, error } = await addStackedBox(belowBox.id, {
      description: '', width_cm: belowBox.width_cm || 50, height_cm: 30
    });
    setBusy(false);
    if (error) return flash('فشل التكديس: ' + error.message, 'error');
    flash(`✅ صندوق مُكدَّس فوق ${belowBox.code}`);
    if (newId) {
      setRecentlyAddedBoxId(newId);
      setTimeout(() => setRecentlyAddedBoxId(null), 3000);
    }
    await onRefresh();
  }

  // ====== أغراض كبيرة تشغل موقع صندوق على الرفّ ======
  // تُنشأ بعد اختيار "غرض كبير" من نافذة الخيار، وتأخذ نفس موقع/حجم الصندوق
  async function handleAddItemAtSlot(values) {
    if (!addItemAtSlot) return;
    if (!values.name?.trim()) return flash('اسم الغرض مطلوب', 'error');
    const { shelf, position, stack } = addItemAtSlot;
    // عند التكديس: ضع الغرض فوق آخر عنصر في الموقع (stack_index الأعلى + 1)
    let stackIndex = 0;
    if (stack) {
      const occupants = [
        ...data.boxes.filter(b => b.shelf_id === shelf.id && b.box_index === position),
        ...shelfItems.filter(it => it.shelf_id === shelf.id && it.box_index === position)
      ];
      stackIndex = occupants.length
        ? Math.max(...occupants.map(o => o.stack_index || 0)) + 1
        : 0;
    }
    setBusy(true);
    const { data: newItem, error } = await supabase.from('items').insert({
      zone_id: fresh.id,
      shelf_id: shelf.id,
      box_index: position,
      stack_index: stackIndex,
      box_id: null,
      name: values.name.trim(),
      quantity: Number(values.quantity) || 1,
      status: 'ok',
      photo_url: values.photo_url || null
    }).select().single();
    setBusy(false);
    setAddItemAtSlot(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    if (newItem) await logActivity('إضافة', `${values.name.trim()} × ${values.quantity}`,
      `${fresh.letter}-${shelf.shelf_index}-${position} (غرض كبير)`, 'item', newItem.id);
    flash(`✅ أُضيف "${values.name}" في الموقع ${position}`);
    await onRefresh();
  }

  async function handleSaveShelfItemEdit(patch) {
    if (!editingShelfItem) return;
    setBusy(true);
    const { error } = await supabase.from('items').update({
      name: patch.name?.trim(),
      quantity: Number(patch.quantity) || 1,
      photo_url: patch.photo_url || null
    }).eq('id', editingShelfItem.id);
    setBusy(false);
    setEditingShelfItem(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمّ التعديل');
    await onRefresh();
  }

  async function handleDeleteShelfItem(it) {
    if (!confirm(`حذف "${it.name}"؟ يمكن استرجاعه من سلّة المحذوفات.`)) return;
    setBusy(true);
    const { error } = await supabase.from('items')
      .update({ deleted_at: new Date().toISOString() }).eq('id', it.id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ نُقل لسلّة المحذوفات');
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
      // لا يوجد اختيار → اسأل: صندوق أم غرض كبير؟
      setSlotChoice({ shelf, position });
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

      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-bold mb-1" style={{ color: fresh.color }}>
              مساحة {fresh.letter} — {fresh.name}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {fresh.width_cm}×{fresh.height_cm} سم · {shelves.length} رف
              {!editMode && shelves.length > 0 && ' · اضغط أيّ صندوق لفتحه مباشرة'}
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
          <ZoneItemsList
            items={allItems}
            zoneBoxes={zoneBoxes}
            zone={fresh}
            onItemClick={onItemClick}
            onRefresh={onRefresh}
            onAddItem={() => setAddingItemInZone(true)}
            isFounder={isFounder}
            can={can}
          />
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
                    <div className="w-10 h-10 rounded bg-gradient-to-br from-amber-50 to-stone-100 border border-stone-200 flex items-center justify-center text-[8px] font-bold text-stone-700 text-center p-1 flex-shrink-0 leading-tight overflow-hidden"><span className="line-clamp-2">{it.name}</span></div>
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
              className={`relative w-full border-4 rounded-md p-2 flex flex-col gap-1.5 ${fresh.color === '#8B6F3F' ? 'wood-grain' : 'bg-white'}`}
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
                        if (dragModeActive) { e.stopPropagation(); handleDropOnShelf(shelf); }
                        // لا انتقال لشاشة الرفّ — الصناديق/المواقع تعالج نقراتها بنفسها
                      }}
                      onDragOver={(e) => { if (hasActiveSelection) { e.preventDefault(); setDragOverShelfId(shelf.id); } }}
                      onDragLeave={() => setDragOverShelfId(null)}
                      onDrop={(e) => { if (hasActiveSelection) { e.preventDefault(); handleDropOnShelf(shelf); } }}
                      className={`flex-1 border-2 rounded p-1 flex gap-1 relative text-right transition ${
                        fresh.color === '#8B6F3F' ? 'wood-grain-soft' : 'bg-stone-50'
                      } ${isDropTarget ? 'ring-4 ring-blue-400 bg-blue-50' : ''}`}
                      style={{ borderColor: isDropTarget ? '#2563eb' : fresh.color }}
                    >
                      <span className="absolute -top-2.5 right-2 text-white text-[10px] px-2 py-0.5 rounded-md font-bold shadow-md pointer-events-none z-30" style={{ backgroundColor: fresh.color }}>
                        {shelfDisplayName(shelf, shelves)}
                      </span>

                      {/* رسم الـ slots على أساس الموقع — كل slot = موقع 1, 2, 3... */}
                      {Array.from({ length: totalSlots }).map((_, idx) => {
                        const position = idx + 1;
                        // كل الصناديق في هذا الموقع — مرتّبة تنازلياً (الأعلى stack_index أوّلاً = يظهر فوق)
                        const boxesAtPos = shelfBoxes
                          .filter(b => b.box_index === position)
                          .sort((a, b) => (b.stack_index || 0) - (a.stack_index || 0));
                        // الأغراض الكبيرة التي تشغل نفس الموقع على هذا الرفّ
                        const itemsAtPos = shelfItems
                          .filter(it => it.shelf_id === shelf.id && it.box_index === position)
                          .sort((a, b) => (b.stack_index || 0) - (a.stack_index || 0));
                        if (boxesAtPos.length > 0 || itemsAtPos.length > 0) {
                          const topBox = boxesAtPos[0]; // قد يكون undefined لو الموقع فيه غرض فقط
                          return (
                            <div key={`stack-${position}`} className="flex-1 flex flex-col gap-0.5 relative">
                              {/* زرّ التكديس — وضع التعديل · يكدّس صندوقاً أو غرضاً فوق ما في الموقع */}
                              {isFounder && editMode && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSlotChoice({ shelf, position, stack: true }); }}
                                  disabled={busy}
                                  className="absolute -top-2 right-1/2 translate-x-1/2 z-30 w-6 h-6 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-md flex items-center justify-center transition hover:scale-110"
                                  title="كدّس صندوقاً أو غرضاً فوق هذا الموقع"
                                >
                                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                                  </svg>
                                </button>
                              )}
                              {itemsAtPos.map((it) => (
                                <div key={`it-${it.id}`}
                                  onClick={(e) => { if (!editMode && !hasActiveSelection) { e.stopPropagation(); setEditingShelfItem(it); } }}
                                  className="flex-1 relative group rounded-sm border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/40 overflow-hidden shadow-sm"
                                  title={`${it.name} (الكميّة: ${it.quantity}) — غرض كبير`}>
                                  {it.photo_url ? (
                                    <img src={it.photo_url} alt={it.name} draggable={false}
                                      className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-800 dark:to-amber-900 pointer-events-none">
                                      <span className="text-[9px] font-bold text-amber-900 dark:text-amber-100 text-center px-0.5 leading-tight line-clamp-3">{it.name}</span>
                                    </div>
                                  )}
                                  <span className="absolute top-0.5 right-0.5 bg-amber-600 text-white text-[8px] font-bold px-1 rounded pointer-events-none">×{it.quantity}</span>
                                  {(isFounder || can('edit')) && (
                                    <div className="absolute bottom-0.5 left-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition z-10">
                                      <button onClick={(e) => { e.stopPropagation(); setEditingShelfItem(it); }}
                                        className="w-4 h-4 rounded bg-white text-stone-700 text-[8px] hover:bg-stone-100 shadow flex items-center justify-center" title="تعديل">✏️</button>
                                      <button onClick={(e) => { e.stopPropagation(); handleDeleteShelfItem(it); }}
                                        className="w-4 h-4 rounded bg-red-500 text-white text-[8px] hover:bg-red-600 shadow flex items-center justify-center" title="حذف">🗑</button>
                                    </div>
                                  )}
                                </div>
                              ))}
                              {boxesAtPos.map((box) => {
                                const items = getBoxItems(box.id);
                                const isOut = isCheckedOut(box.id);
                                const isHighlighted = highlightedBox === box.code;
                                const isDragging = draggedBox?.id === box.id;
                                const isSelected = selectedBoxIds.has(box.id);
                                const isRecentlyAdded = recentlyAddedBoxId === box.id;
                                const showHandle = isFounder;
                                const isPositionDropTarget = hasActiveSelection && !activeBoxesForMove.find(b => b.id === box.id);
                                const canOpenBox = !editMode && !hasActiveSelection;
                                return (
                                  <div key={box.id}
                                    onClick={(e) => {
                                      // ضغط الصندوق (خارج وضع التعديل/الاختيار) يفتحه مباشرة — يتجاوز عرض الرفّ
                                      if (!canOpenBox) return;
                                      e.stopPropagation();
                                      onItemClick?.(box.code);
                                    }}
                                    onDragOver={(e) => { if (isPositionDropTarget) { e.preventDefault(); e.stopPropagation(); } }}
                                    onDrop={(e) => {
                                      if (isPositionDropTarget) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDropOrClickOnPosition(shelf, position);
                                      }
                                    }}
                                    title={canOpenBox ? `افتح صندوق ${box.code}` : undefined}
                                    className={`flex-1 relative group ${canOpenBox ? 'cursor-pointer' : ''} ${isDragging ? 'opacity-30 scale-95' : ''} ${isSelected ? 'ring-4 ring-blue-500 ring-offset-1 scale-105' : ''} ${isRecentlyAdded ? 'ring-4 ring-green-500 ring-offset-1 animate-pulse' : ''} ${isPositionDropTarget ? 'ring-2 ring-purple-400 ring-offset-1' : ''} transition`}>
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
                                    {showHandle && (
                                      <div
                                        draggable={true}
                                        onDragStart={(e) => handleBoxDragStart(e, box)}
                                        onDragEnd={handleBoxDragEnd}
                                        onClick={(e) => { e.stopPropagation(); handleBoxClickToSelect(box, e); }}
                                        className={`absolute top-1 right-1 w-6 h-6 rounded-lg shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center z-20 transition ${
                                          isSelected
                                            ? 'bg-blue-600 border-2 border-blue-700 hover:bg-blue-700'
                                            : 'bg-white/95 border-2 border-amber-700 hover:bg-amber-50'
                                        }`}
                                        title="اسحب أو اضغط لنقل الصندوق"
                                      >
                                        <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 ${isSelected ? 'fill-white' : 'fill-amber-800'}`}>
                                          <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/>
                                        </svg>
                                      </div>
                                    )}
                                    {(box.stack_index || 0) > 0 && (
                                      <span className="absolute top-1 left-1 bg-purple-600 text-white text-[8px] font-bold px-1 rounded pointer-events-none">
                                        #{(box.stack_index || 0) + 1}
                                      </span>
                                    )}
                                    {isSelected && (
                                      <span className="absolute bottom-0.5 left-0.5 text-[9px] text-white bg-blue-600 px-1.5 py-0.5 rounded pointer-events-none z-10 font-bold shadow">
                                        ✓ مختار
                                      </span>
                                    )}
                                    {editMode && isFounder && (
                                      <button onClick={(e) => { e.stopPropagation(); setConfirming({ type: 'box', box }); }}
                                        className="absolute bottom-1 left-1 bg-white border border-red-300 text-red-600 text-[9px] w-5 h-5 rounded shadow-sm hover:bg-red-50 leading-none flex items-center justify-center z-20"
                                        title="حذف الصندوق">×</button>
                                    )}
                                  </div>
                                );
                              })}
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

        {/* قسم "إدارة الأرفف" — مخفيّ افتراضياً، يظهر بالضغط على زرّ التبديل */}
        {isFounder && (
          <div className="border-t border-stone-200 pt-3 mt-4">
            <button
              onClick={() => setShelvesAdminOpen(s => !s)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-stone-50 hover:bg-stone-100 rounded-lg transition text-xs font-display font-bold text-stone-700">
              <span className="flex items-center gap-2">
                <span className="text-base">📚</span>
                إدارة الأرفف ({shelves.length})
              </span>
              <span className={`text-stone-500 transition-transform ${shelvesAdminOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {shelvesAdminOpen && (
              <div className="mt-3 animate-fade-in">
                <div className="flex items-center justify-end mb-2">
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

                {shelves.length === 0 ? (
                  <p className="text-center text-xs text-stone-400 py-3">لا توجد أرفف بعد — اضغط "رف جديد"</p>
                ) : (
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

      {/* اختيار: صندوق أم غرض كبير — عند النقر على موقع فارغ أو زرّ التكديس */}
      {slotChoice && (
        <FormModal
          title={slotChoice.stack ? 'ماذا تكدّس فوق هذا الموقع؟' : 'ماذا تضيف هنا؟'}
          subtitle={`${slotChoice.stack ? 'سيوضَع فوق ما هو موجود · ' : ''}الموقع ${slotChoice.position} في ${shelfDisplayName(slotChoice.shelf, shelves)} — مساحة ${fresh.letter}`}
          onClose={() => setSlotChoice(null)}
          maxWidth="max-w-md"
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                const s = slotChoice;
                setSlotChoice(null);
                if (s.stack) {
                  // كدّس صندوقاً فوق أعلى صندوق في الموقع (إن وُجد) وإلّا أنشئ صندوقاً في الموقع
                  const topB = data.boxes
                    .filter(b => b.shelf_id === s.shelf.id && b.box_index === s.position)
                    .sort((a, b) => (b.stack_index || 0) - (a.stack_index || 0))[0];
                  if (topB) handleStackBox(topB);
                  else handleQuickAddBox(s.shelf, s.position);
                } else {
                  handleQuickAddBox(s.shelf, s.position);
                }
              }}
              disabled={busy}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-stone-200 hover:border-brand-navy hover:bg-blue-50 transition disabled:opacity-50">
              <span className="text-4xl">📦</span>
              <span className="text-sm font-bold">صندوق</span>
              <span className="text-[10px] text-stone-500 text-center">صندوق كرتوني يحوي أصنافاً بداخله</span>
            </button>
            <button
              onClick={() => { setAddItemAtSlot(slotChoice); setSlotChoice(null); }}
              disabled={busy}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-stone-200 hover:border-amber-500 hover:bg-amber-50 transition disabled:opacity-50">
              <span className="text-4xl">🧊</span>
              <span className="text-sm font-bold">غرض كبير</span>
              <span className="text-[10px] text-stone-500 text-center">ثلاجة/طاولة كبيرة — يأخذ نفس مكان الصندوق</span>
            </button>
          </div>
        </FormModal>
      )}

      {/* تفاصيل الغرض الكبير بعد اختيار "غرض كبير" */}
      {addItemAtSlot && (
        <FormModal
          title="🧊 غرض كبير في موقع الصندوق"
          subtitle={`الموقع ${addItemAtSlot.position} — مساحة ${fresh.letter}`}
          onClose={() => setAddItemAtSlot(null)}
          maxWidth="max-w-md"
        >
          <ZoneItemEditForm
            item={{ name: '', quantity: 1, photo_url: null }}
            busy={busy}
            onCancel={() => setAddItemAtSlot(null)}
            onSave={handleAddItemAtSlot}
          />
        </FormModal>
      )}

      {/* تعديل غرض كبير على الرفّ */}
      {editingShelfItem && (
        <FormModal
          title={`✏️ تعديل "${editingShelfItem.name}"`}
          subtitle="غرض كبير في موقع على الرفّ"
          onClose={() => setEditingShelfItem(null)}
          maxWidth="max-w-md"
        >
          <ZoneItemEditForm
            item={editingShelfItem}
            busy={busy}
            onCancel={() => setEditingShelfItem(null)}
            onSave={handleSaveShelfItemEdit}
          />
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

      {/* اختيار صندوق لإضافة غرض جديد إليه (من قائمة كل الأغراض) */}
      {addingItemInZone && !pickedBoxForNewItem && (
        <LocationPicker
          mode="item"
          data={data}
          activeWarehouse={activeWarehouse}
          initialZone={fresh}
          lockZone={true}
          onCancel={() => setAddingItemInZone(false)}
          onSelect={({ box }) => { setAddingItemInZone(false); setPickedBoxForNewItem(box); }}
          title={`+ إضافة غرض في مساحة ${fresh.letter}`}
          subtitle="اختر الصندوق الذي يُحفَظ فيه الغرض الجديد"
        />
      )}

      {/* تفاصيل الغرض الجديد بعد اختيار الصندوق */}
      {pickedBoxForNewItem && (
        <FormModal
          title="🔧 تفاصيل الغرض الجديد"
          subtitle={`في صندوق ${pickedBoxForNewItem.code}`}
          onClose={() => setPickedBoxForNewItem(null)}
          maxWidth="max-w-md"
        >
          <ZoneItemEditForm
            item={{ name: '', quantity: 1, photo_url: null }}
            busy={busy}
            onCancel={() => setPickedBoxForNewItem(null)}
            onSave={handleSubmitNewItemInZone}
          />
        </FormModal>
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
function ZoneItemsList({ items, zoneBoxes, zone, onItemClick, onRefresh, onAddItem, isFounder, can }) {
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const filtered = items.filter(it => {
    if (!search.trim()) return true;
    return `${it.name} ${it.boxCode}`.toLowerCase().includes(search.toLowerCase());
  });

  async function handleQuickDelete(item) {
    setBusy(true);
    const { error } = await supabase.from('items')
      .update({ deleted_at: new Date().toISOString() }).eq('id', item.id);
    setBusy(false);
    setConfirmDelete(null);
    if (error) return alert('فشل: ' + error.message);
    onRefresh?.();
  }

  async function handleSaveEdit(patch) {
    if (!editingItem) return;
    setBusy(true);
    const { error } = await supabase.from('items').update({
      name: patch.name?.trim(),
      quantity: Number(patch.quantity) || 1,
      photo_url: patch.photo_url || null
    }).eq('id', editingItem.id);
    setBusy(false);
    setEditingItem(null);
    if (error) return alert('فشل: ' + error.message);
    onRefresh?.();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ابحث في أغراض المساحة..."
          className="flex-1 min-w-[180px] px-3 py-2 border border-stone-300 rounded-lg text-xs"
        />
        {(isFounder || can?.('add')) && onAddItem && (
          <button onClick={onAddItem}
            className="text-xs bg-gradient-to-l from-brand-navy to-brand-purple text-white px-3 py-2 rounded-lg hover:opacity-90 font-medium shadow-sm whitespace-nowrap">
            + إضافة غرض
          </button>
        )}
      </div>
      <div className="text-[11px] text-stone-500 mb-2">
        عرض {filtered.length} من {items.length} صنف
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-stone-400 py-12">
          {items.length === 0 ? 'لا توجد أغراض في هذه المساحة بعد' : 'لا توجد نتائج'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(it => (
            <div key={it.id}
              className="bg-white border border-stone-200 rounded-lg p-2.5 flex items-center gap-3 hover:shadow-md transition">
              <button
                onClick={() => onItemClick && onItemClick(it.boxCode)}
                className="flex items-center gap-3 flex-1 text-right -m-2.5 p-2.5 hover:bg-stone-50 rounded-lg transition min-w-0"
              >
                {it.photo_url ? (
                  <img src={it.photo_url} alt={it.name} className="w-12 h-12 object-cover rounded border border-stone-200 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded bg-gradient-to-br from-amber-50 to-stone-100 border border-stone-200 flex items-center justify-center text-[9px] font-bold text-stone-700 text-center p-1 flex-shrink-0 leading-tight overflow-hidden"><span className="line-clamp-2">{it.name}</span></div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium truncate">{it.name}</h4>
                  <p className="text-[10px] text-stone-500">الكميّة: {it.quantity}</p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ color: zone.color, backgroundColor: zone.color + '15' }}>
                  {it.boxCode}
                </span>
                <span className="text-stone-400">→</span>
              </button>
              {(isFounder || can?.('edit')) && (
                <button onClick={() => setEditingItem(it)} disabled={busy}
                  className="text-[10px] bg-stone-50 border border-stone-300 text-stone-700 px-2 py-1.5 rounded hover:bg-stone-100 flex-shrink-0">
                  ✏️
                </button>
              )}
              {(isFounder || can?.('delete')) && (
                <button onClick={() => setConfirmDelete(it)} disabled={busy}
                  className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded hover:bg-red-100 flex-shrink-0">
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDelete
          message={`سيُحذف الصنف "${confirmDelete.name}" (الكميّة: ${confirmDelete.quantity}). يمكن استرجاعه من سلّة المحذوفات لاحقاً.`}
          busy={busy}
          onConfirm={() => handleQuickDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {editingItem && (
        <FormModal
          title={`✏️ تعديل "${editingItem.name}"`}
          subtitle={`في صندوق ${editingItem.boxCode}`}
          onClose={() => setEditingItem(null)}
          maxWidth="max-w-md"
        >
          <ZoneItemEditForm
            item={editingItem}
            busy={busy}
            onCancel={() => setEditingItem(null)}
            onSave={handleSaveEdit}
          />
        </FormModal>
      )}
    </div>
  );
}

// نموذج تعديل غرض من قائمة "كل أغراض المساحة"
function ZoneItemEditForm({ item, busy, onCancel, onSave }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [photoUrl, setPhotoUrl] = useState(item.photo_url || null);
  const dirty =
    name !== item.name ||
    Number(quantity) !== Number(item.quantity) ||
    photoUrl !== (item.photo_url || null);

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (dirty && name.trim()) onSave({ name, quantity, photo_url: photoUrl }); }}
      className="space-y-3">
      <div>
        <label className="block text-xs text-stone-700 font-medium mb-1">الاسم</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      </div>
      <div>
        <label className="block text-xs text-stone-700 font-medium mb-1">الكميّة</label>
        <input type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      </div>
      <PhotoUploader
        value={photoUrl}
        onChange={setPhotoUrl}
        prefix="items"
        label="صورة الغرض (اختياريّة)"
      />
      <div className="flex gap-2 pt-2 border-t border-stone-200">
        <button type="submit" disabled={busy || !dirty || !name.trim()}
          className="flex-1 bg-brand-navy text-white py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? '...' : '💾 حفظ'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </form>
  );
}
