import { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import LocationPicker from './LocationPicker';
import PhotoUploader from './PhotoUploader';
import { AddZoneForm, AddBoxForm, EditZoneForm, ConfirmDelete, StatusToast, FormModal, useFlash } from './BuilderForms';
import FreeItemSquare from './FreeItemSquare';
import WallStrokeOverlay from './WallStrokeOverlay';
import ImageLightbox from './ImageLightbox';
import useDragResize from '../lib/useDragResize';
import { rpcAddZone, rpcUpdateZone, rpcDeleteZone, rpcAddBox, softDeleteItem, updateOutsideItemPosition, STRUCTURE_COLOR } from '../lib/warehouseOps';
import { resolveItemLocation } from '../lib/helpers';
import { GRID_PRESETS, metersToPercentX, metersToPercentY, formatDim, snapValue } from '../lib/gridConfig';

// المساحات ثابتة لا تتحرّك أبداً؛ الأغراض الحرّة تُوضَع في أيّ مكان على
// الأرضيّة (حتى أمام المساحات) — لا قيد على موقعها

// المستطيل الطبيعي للمساحة (من قاعدة البيانات) كنسب مئويّة
function naturalZoneRect(zone) {
  const left = zone.pos_left ?? (100 - (zone.pos_right ?? 0) - (zone.pos_width ?? 18));
  return {
    left,
    top:    zone.pos_top    ?? 0,
    width:  zone.pos_width  ?? 18,
    height: zone.pos_height ?? 42
  };
}

export default function WarehouseMap({ data, onZoneClick, onItemClick, onRefresh }) {
  const { can, isFounder, activeWarehouse, warehouseId } = useAuth();
  const [showAddZone, setShowAddZone] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  // وضع العرض: map (الخريطة) | items (كل الأغراض)
  const [viewMode, setViewMode] = useState('map');
  // مودال عرض القائمة عند النقر على بطاقة إحصائيّة
  const [statModal, setStatModal] = useState(null); // 'boxes' | 'items' | 'checkouts'
  // منتقي مكان: 'box' لإضافة صندوق، 'item' لإضافة غرض. null = مغلق
  const [pickerMode, setPickerMode] = useState(null);
  // البيانات المختارة من المنتقي + بيانات النموذج التالي
  const [selectedLocation, setSelectedLocation] = useState(null);  // { zone, shelf, position } أو { zone, box }

  const totalBoxes = data.boxes.length;
  const totalItemTypes = data.items.length;
  const totalQty = data.items.reduce((s, it) => s + (it.quantity || 0), 0);
  const checkedOutCount = data.checkouts.length;
  // الأغراض المُخزّنة خارج كلّ المساحات (أشياء كبيرة كالطاولات والبنرات الكبيرة)
  const outsideItems = data.items.filter(it => it.box_id == null && it.zone_id == null && it.warehouse_id != null);
  // مودال إضافة غرض خارج المساحات
  const [showAddOutside, setShowAddOutside] = useState(false);
  // مودال تعديل غرض خارج المساحات
  const [editingOutsideItem, setEditingOutsideItem] = useState(null);
  // مودال عرض غرض خارج المساحات (قراءة فقط — لكل المستخدمين)
  const [viewingOutsideItem, setViewingOutsideItem] = useState(null);
  // تكبير صورة (يُشارك مكوّن ImageLightbox)
  const [zoom, setZoom] = useState(null); // { url, caption }
  // وضع تحرير المخطّط (سحب/تكبير الغرف ثم القفل) — للمؤسّس فقط
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  // الرسم: شكل رُسم للتوّ وننتظر اختيار نوعه (جدار/مكتب/تخزين) — نِسب مئويّة
  const [drawnRect, setDrawnRect] = useState(null);
  // الشكل المرسوم المعلّق لمساحة تخزين (يُوضع فيها بعد ملء نموذج المساحة)
  const [pendingDrawRect, setPendingDrawRect] = useState(null);
  // محرّر الرسم: شبكة + التقاط (snap) + إظهار القياسات
  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridSpacingMeters, setGridSpacingMeters] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(false);

  const zones = data.zones || [];

  // تباعد الشبكة بالنِّسبة المئويّة لكل محور (المستودع غير مربّع)
  const gridSpacingPctX = metersToPercentX(gridSpacingMeters, activeWarehouse);
  const gridSpacingPctY = metersToPercentY(gridSpacingMeters, activeWarehouse);
  const snapX = (gridEnabled && snapEnabled) ? gridSpacingPctX : null;
  const snapY = (gridEnabled && snapEnabled) ? gridSpacingPctY : null;

  function boxCountForZone(letter) {
    return data.boxes.filter(b => b.code.startsWith(letter + '-')).length;
  }

  // إنشاء مساحة/عنصر — مع وضعه اختيارياً في مستطيل مرسوم (rect نِسب مئويّة)
  async function handleAddZone(values, rect = null) {
    if (zones.find(z => z.letter === values.letter.toUpperCase())) {
      flash('هذا الحرف موجود — اختر حرفاً آخر', 'error');
      return;
    }
    setBusy(true);
    const { data: newZoneId, error } = await rpcAddZone(activeWarehouse.id, values);
    if (!error && newZoneId && rect) {
      // ضع العنصر تماماً حيث رسمه المؤسّس (مع شكل المضلّع إن وُجد)
      const { error: posErr } = await rpcUpdateZone(
        { id: newZoneId },
        {
          pos_top: rect.top, pos_left: rect.left, pos_right: null,
          pos_width: rect.width, pos_height: rect.height,
          // نمرّر النقاط فقط حين تكون مضلّعاً فعليّاً (تبقى المستطيلات متوافقة قبل الترقية)
          ...(Array.isArray(rect.points) ? { points: rect.points } : {})
        }
      );
      if (posErr) flash('أُنشئ العنصر لكن تعذّر ضبط موضعه: ' + posErr.message, 'error');
    }
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    const kind = values.color === STRUCTURE_COLOR ? 'عنصر' : 'مساحة';
    flash(`✅ تمت إضافة ${kind} ${values.letter.toUpperCase()}`);
    setShowAddZone(false);
    setPendingDrawRect(null);
    await onRefresh();
  }

  // إنشاء عنصر هيكلي (جدار/مكتب) رصاصي بلا أرفف في الشكل المرسوم
  async function createStructure(rect, name) {
    const used = new Set(zones.map(z => z.letter));
    let letter = '';
    for (let i = 65; i <= 90; i++) {
      const c = String.fromCharCode(i);
      if (!used.has(c)) { letter = c; break; }
    }
    if (!letter) return flash('نفدت الحروف المتاحة — احذف عنصراً غير مستخدم أوّلاً', 'error');
    await handleAddZone(
      { letter, name, color: STRUCTURE_COLOR, width_cm: 100, height_cm: 100, depth_cm: 30, shelves_count: 0 },
      rect
    );
  }

  async function handleUpdateZone(zone, patch) {
    setBusy(true);
    const { error } = await rpcUpdateZone(zone, patch);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditingZoneId(null);
    await onRefresh();
  }

  async function handleDeleteZone() {
    setBusy(true);
    const { error } = await rpcDeleteZone(confirming.zone.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف المساحة');
    await onRefresh();
  }

  function handleLocationPicked(location) {
    setSelectedLocation({ ...location, mode: pickerMode });
    setPickerMode(null);
  }

  async function handleSubmitNewBox(values) {
    const { shelf, position } = selectedLocation;
    setBusy(true);
    const { error, photoError } = await rpcAddBox(shelf.id, { ...values, position });
    setBusy(false);
    setSelectedLocation(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    if (photoError) return flash('تمّ إنشاء الصندوق لكن تعذّر حفظ الصورة — أعد رفعها من تعديل الصندوق', 'error');
    flash(`✅ تمّ إنشاء الصندوق في الموقع ${position}`);
    await onRefresh();
  }

  async function handleSubmitNewItem(values) {
    const { box } = selectedLocation;
    if (!values.name?.trim()) return flash('اسم الغرض مطلوب', 'error');
    setBusy(true);
    const { error } = await supabase.from('items').insert({
      box_id: box.id,
      name: values.name.trim(),
      quantity: Number(values.quantity) || 1,
      status: 'ok',
      photo_url: values.photo_url || null
    });
    setBusy(false);
    if (!error) await logActivity('إضافة', `${values.name.trim()} × ${values.quantity}`, box.code);
    setSelectedLocation(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تمّ إضافة "${values.name}" إلى ${box.code}`);
    await onRefresh();
  }

  // إضافة غرض خارج المساحات — للأشياء الكبيرة التي لا تدخل صناديق
  async function handleSubmitOutsideItem(values) {
    if (!values.name?.trim()) return flash('اسم الغرض مطلوب', 'error');
    setBusy(true);
    // ضع الغرض الجديد في المنطقة الحرّة السفليّة (الزوايا السفليّة متروكة للأغراض)
    // إزاحة بسيطة عشوائيّة حتى لا تتراكم الأغراض الجديدة فوق بعضها
    const jitter = Math.floor(Math.random() * 16);
    const { error } = await supabase.from('items').insert({
      warehouse_id: warehouseId,
      box_id: null,
      zone_id: null,
      name: values.name.trim(),
      quantity: Number(values.quantity) || 1,
      status: 'ok',
      photo_url: values.photo_url || null,
      stack_index: Number(values.stack) || 0,
      pos_top: 80,
      pos_left: 40 + jitter,
      width_pct: 9,
      height_pct: 9
    });
    setBusy(false);
    if (!error) await logActivity('إضافة', `${values.name.trim()} × ${values.quantity}`, '(خارج المساحات)');
    setShowAddOutside(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ أُضيف "${values.name}" في منطقة التخزين المفتوحة`);
    await onRefresh();
  }

  async function handleSaveOutsideEdit(patch) {
    if (!editingOutsideItem) return;
    setBusy(true);
    const { error } = await supabase.from('items').update({
      name: patch.name?.trim(),
      quantity: Number(patch.quantity) || 1,
      photo_url: patch.photo_url || null,
      ...(patch.stack_index != null ? { stack_index: patch.stack_index } : {}),
      ...(patch.width_pct != null ? { width_pct: patch.width_pct } : {}),
      ...(patch.height_pct != null ? { height_pct: patch.height_pct } : {})
    }).eq('id', editingOutsideItem.id);
    setBusy(false);
    setEditingOutsideItem(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تمّ التعديل');
    await onRefresh();
  }

  async function handleDeleteOutsideItem(item) {
    if (!confirm(`حذف "${item.name}"؟ يمكن استرجاعه من سلّة المحذوفات.`)) return;
    setBusy(true);
    const { error } = await supabase.from('items')
      .update({ deleted_at: new Date().toISOString() }).eq('id', item.id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ نُقل لسلّة المحذوفات');
    await onRefresh();
  }

  return (
    <>
      <StatusToast msg={msg} />

      {/* الإحصائيّات — قابلة للنقر تعرض القائمة الكاملة */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard num={totalBoxes} label="عدد الصناديق" onClick={() => setStatModal('boxes')} />
        <StatCard num={totalItemTypes} label="عدد الأغراض" onClick={() => setStatModal('items')} />
        <StatCard num={checkedOutCount} label="مُخرَج حالياً" color={checkedOutCount > 0 ? 'orange' : 'default'} onClick={() => setStatModal('checkouts')} />
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-bold dark:text-stone-300">{activeWarehouse?.name || 'المستودع'}</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {activeWarehouse?.width_m || 4}م × {activeWarehouse?.depth_m || 4}م · {zones.length} مساحة · {totalBoxes} صندوق · {data.items.length} صنف
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {viewMode === 'map' && (
              <button onClick={() => setShowMeasurements(m => !m)}
                className={showMeasurements
                  ? "bg-indigo-600 text-white border border-indigo-700 text-xs px-3 py-2 rounded-lg hover:bg-indigo-700 font-bold shadow-sm"
                  : "bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs px-3 py-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700"}>
                📏 المقاييس
              </button>
            )}
            {isFounder && viewMode === 'map' && layoutEditMode && (
              <>
                <button onClick={() => setGridEnabled(g => !g)}
                  className={gridEnabled
                    ? "bg-indigo-600 text-white border border-indigo-700 text-xs px-3 py-2 rounded-lg hover:bg-indigo-700 font-bold shadow-sm"
                    : "bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs px-3 py-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700"}>
                  📐 الشبكة
                </button>
                {gridEnabled && (
                  <select value={gridSpacingMeters} onChange={e => setGridSpacingMeters(Number(e.target.value))}
                    className="text-xs px-2 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 dark:text-stone-200">
                    {GRID_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                )}
                {gridEnabled && (
                  <button onClick={() => setSnapEnabled(s => !s)}
                    className={snapEnabled
                      ? "bg-green-600 text-white border border-green-700 text-xs px-3 py-2 rounded-lg hover:bg-green-700 font-bold shadow-sm"
                      : "bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs px-3 py-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700"}>
                    🧲 التقاط
                  </button>
                )}
              </>
            )}
            {isFounder && viewMode === 'map' && (
              <button onClick={() => setLayoutEditMode(e => !e)}
                className={layoutEditMode
                  ? "bg-green-600 text-white border border-green-700 text-xs px-3 py-2 rounded-lg hover:bg-green-700 font-bold shadow-sm"
                  : "bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700/60 text-blue-900 dark:text-blue-200 text-xs px-3 py-2 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60 font-medium"}>
                {layoutEditMode ? '✅ اعتماد المخطّط (قفل)' : '✏️ تحرير المخطّط'}
              </button>
            )}
            {isFounder && viewMode === 'map' && (
              <button onClick={() => setShowAddZone(s => !s)}
                className="bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs px-3 py-2 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/60">
                + 👑 مساحة جديدة
              </button>
            )}
            {isFounder && viewMode === 'map' && (
              <button onClick={() => setPickerMode('box')}
                className="bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700/60 text-green-900 dark:text-green-200 text-xs px-3 py-2 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60">
                + 📦 صندوق جديد
              </button>
            )}
            {can('add') && (
              <button onClick={() => setPickerMode('item')}
                className="bg-gradient-to-l from-brand-navy to-brand-purple text-white text-xs px-3 py-2 rounded-lg hover:opacity-90 font-bold shadow-sm">
                + 🔧 إضافة أداة
              </button>
            )}
            {can('add') && (
              <button onClick={() => setShowAddOutside(true)}
                className="bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 text-xs px-3 py-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 font-medium"
                title="غرض كبير لا يدخل صندوقاً (مثل طاولة كبيرة)">
                + 📐 خارج المساحات
              </button>
            )}
          </div>
        </div>

        {/* مبدّل وضع العرض */}
        <div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 inline-flex mb-4">
          <button onClick={() => setViewMode('map')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'map' ? 'bg-white dark:bg-stone-700 shadow-sm font-medium dark:text-stone-300' : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'}`}>
            🗺 الخريطة
          </button>
          <button onClick={() => setViewMode('items')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'items' ? 'bg-white dark:bg-stone-700 shadow-sm font-medium dark:text-stone-300' : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'}`}>
            📋 كل الأغراض ({data.items.length})
          </button>
        </div>

        {showAddZone && viewMode === 'map' && (
          <FormModal
            title={pendingDrawRect ? '+ مساحة تخزين (في الشكل المرسوم)' : '+ مساحة تخزين جديدة'}
            onClose={() => { setShowAddZone(false); setPendingDrawRect(null); }}
            maxWidth="max-w-lg"
          >
            <AddZoneForm
              busy={busy}
              existingLetters={zones.map(z => z.letter)}
              onCancel={() => { setShowAddZone(false); setPendingDrawRect(null); }}
              onSave={(values) => handleAddZone(values, pendingDrawRect)}
            />
          </FormModal>
        )}

        {/* بعد رسم شكل: اختيار نوعه */}
        {drawnRect && viewMode === 'map' && (
          <FormModal
            title="ما الذي رسمته؟"
            subtitle="اختر نوع الشكل ليُضاف إلى المخطّط"
            onClose={() => setDrawnRect(null)}
            maxWidth="max-w-sm"
          >
            <div className="grid gap-2">
              <button
                onClick={() => { const r = drawnRect; setDrawnRect(null); createStructure(r, 'جدار'); }}
                disabled={busy}
                className="flex items-center gap-3 p-3 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-right disabled:opacity-50">
                <span className="text-xl">🧱</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold dark:text-stone-200">جدار</span>
                  <span className="block text-[11px] text-stone-500 dark:text-stone-400">عنصر هيكلي ثابت رصاصي — بلا أرفف</span>
                </span>
              </button>
              <button
                onClick={() => { const r = drawnRect; setDrawnRect(null); createStructure(r, 'مكتب'); }}
                disabled={busy}
                className="flex items-center gap-3 p-3 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-right disabled:opacity-50">
                <span className="text-xl">🪑</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold dark:text-stone-200">مكتب / طاولة</span>
                  <span className="block text-[11px] text-stone-500 dark:text-stone-400">عنصر هيكلي ثابت رصاصي — بلا أرفف</span>
                </span>
              </button>
              <button
                onClick={() => { setPendingDrawRect(drawnRect); setDrawnRect(null); setShowAddZone(true); }}
                disabled={busy}
                className="flex items-center gap-3 p-3 rounded-lg border-2 border-brand-blue/60 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-right disabled:opacity-50">
                <span className="text-xl">📦</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold text-brand-navy dark:text-blue-200">مساحة تخزين</span>
                  <span className="block text-[11px] text-stone-500 dark:text-stone-400">مكان مُلوّن بأرفف — يُخزَّن فيه فعليّاً</span>
                </span>
              </button>
            </div>
          </FormModal>
        )}

        {viewMode === 'map' ? (
          (zones.length === 0 && !(isFounder && layoutEditMode)) ? (
            <div className="text-center py-12 text-stone-400">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm mb-2">هذا المستودع فارغ — لا توجد مساحات تخزين بعد</p>
              {isFounder && (
                <div className="flex flex-col items-center gap-2 mt-2">
                  {!showAddZone && (
                    <button onClick={() => setShowAddZone(true)}
                      className="bg-amber-500 text-white text-xs px-4 py-2 rounded-lg hover:bg-amber-600">
                      🏗 ابدأ ببناء أوّل مساحة
                    </button>
                  )}
                  <button onClick={() => setLayoutEditMode(true)}
                    className="bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700/60 text-blue-900 dark:text-blue-200 text-xs px-4 py-2 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60">
                    ✏️ ارسم المخطّط (جدران ومكاتب ومساحات)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {layoutEditMode && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 mb-3 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
                  <span className="text-base">✏️</span>
                  <div className="flex-1 space-y-0.5">
                    <p>• ✏️ <strong>ارسم شكلاً</strong>: اضغط الزرّ، ثمّ اضغط نقاطاً على الأرضيّة (تتّصل بخطوط)، وأغلق الشكل بالضغط على النقطة الأولى أو «أغلق الشكل»، ثمّ اختر: جدار / مكتب أو مساحة تخزين</p>
                    <p>• <strong>اسحب</strong> أيّ غرفة لتحريكها · اسحب المقبض ◢ في زاويتها لتغيير حجمها</p>
                    <p>• اضغط ✏️ على الغرفة لتسميتها/تلوينها · اللون <strong>الرصاصي</strong> = هيكل ثابت (جدار/طاولة) · أيّ لون آخر = مكان تخزين</p>
                    <p>• عند الانتهاء اضغط <strong>«✅ اعتماد المخطّط»</strong> ليُقفل ويصبح ثابتاً</p>
                  </div>
                </div>
              )}
              <div className="flex justify-center">
                <WarehouseMapCanvas
                  zones={zones}
                  outsideItems={outsideItems}
                  data={data}
                  activeWarehouse={activeWarehouse}
                  gridEnabled={gridEnabled}
                  gridSpacingPctX={gridSpacingPctX}
                  gridSpacingPctY={gridSpacingPctY}
                  snapX={snapX}
                  snapY={snapY}
                  showMeasurements={showMeasurements}
                  isFounder={isFounder}
                  busy={busy}
                  layoutEditMode={layoutEditMode}
                  boxCountForZone={boxCountForZone}
                  onZoneClick={onZoneClick}
                  onZoneEdit={(z) => setEditingZoneId(editingZoneId === z.id ? null : z.id)}
                  onZoneDelete={(z) => setConfirming({ zone: z })}
                  onItemEdit={(it) => setEditingOutsideItem(it)}
                  onItemDelete={handleDeleteOutsideItem}
                  onItemView={(it) => setViewingOutsideItem(it)}
                  onDrawComplete={(rect) => setDrawnRect(rect)}
                  onRefresh={onRefresh}
                  flash={flash}
                />
              </div>

              {isFounder && editingZoneId && (() => {
                const z = zones.find(z2 => z2.id === editingZoneId);
                if (!z) return null;
                return (
                  <FormModal
                    title={`✏️ تعديل مساحة ${z.letter} — ${z.name}`}
                    onClose={() => setEditingZoneId(null)}
                    maxWidth="max-w-lg"
                  >
                    <EditZoneForm
                      zone={z}
                      busy={busy}
                      onCancel={() => setEditingZoneId(null)}
                      onSave={(patch) => handleUpdateZone(z, patch)}
                    />
                  </FormModal>
                );
              })()}

              {outsideItems.length > 0 && (
                <p className="text-center text-[10px] text-stone-500 dark:text-stone-400 mt-3">
                  💡 <strong>{outsideItems.length}</strong> {outsideItems.length === 1 ? 'غرض' : 'أغراض'} خارج المساحات — اضغط أيّ غرض لعرضه{layoutEditMode ? ' · في وضع التعديل: اسحب للتحريك والمقبض ◢ للتحجيم' : ' · للتحريك/التحجيم ادخل «✏️ تحرير المخطّط»'}
                </p>
              )}
            </>
          )
        ) : (
          <AllItemsList data={data} onItemClick={onItemClick} onRefresh={onRefresh} onAddItem={() => setPickerMode('item')} />
        )}
      </div>

      {/* منتقي المكان لصندوق أو غرض جديد */}
      {pickerMode && (
        <LocationPicker
          mode={pickerMode}
          data={data}
          activeWarehouse={activeWarehouse}
          onCancel={() => setPickerMode(null)}
          onSelect={handleLocationPicked}
        />
      )}

      {/* بعد اختيار المكان: نموذج تفاصيل العنصر */}
      {selectedLocation?.mode === 'box' && (
        <FormModal
          title={`📦 تفاصيل الصندوق الجديد`}
          subtitle={`في ${selectedLocation.zone.letter}-${selectedLocation.shelf.shelf_index}-${selectedLocation.position}`}
          onClose={() => setSelectedLocation(null)}
          maxWidth="max-w-md"
        >
          <AddBoxForm
            busy={busy}
            onCancel={() => setSelectedLocation(null)}
            onSave={handleSubmitNewBox}
          />
        </FormModal>
      )}
      {selectedLocation?.mode === 'item' && (
        <FormModal
          title={`🔧 تفاصيل الغرض الجديد`}
          subtitle={`سيُحفَظ في صندوق ${selectedLocation.box.code}`}
          onClose={() => setSelectedLocation(null)}
          maxWidth="max-w-md"
        >
          <NewItemForm
            busy={busy}
            onCancel={() => setSelectedLocation(null)}
            onSave={handleSubmitNewItem}
          />
        </FormModal>
      )}

      {confirming && (
        <ConfirmDelete
          message={`سيُحذف ${confirming.zone.letter} — ${confirming.zone.name} مع كل أرففه وصناديقه. هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={handleDeleteZone}
          onCancel={() => setConfirming(null)}
        />
      )}

      {/* مودال إضافة غرض خارج المساحات */}
      {showAddOutside && (
        <FormModal
          title="📐 إضافة غرض خارج المساحات"
          subtitle="للأشياء الكبيرة التي تُخزَّن في المستودع مباشرة (طاولات كبيرة، بنرات، إلخ)"
          onClose={() => setShowAddOutside(false)}
          maxWidth="max-w-md"
        >
          <NewItemForm
            busy={busy}
            showStack
            onCancel={() => setShowAddOutside(false)}
            onSave={handleSubmitOutsideItem}
          />
        </FormModal>
      )}

      {/* مودال تعديل غرض خارج المساحات */}
      {editingOutsideItem && (
        <FormModal
          title={`✏️ تعديل "${editingOutsideItem.name}"`}
          subtitle="غرض في منطقة التخزين المفتوحة"
          onClose={() => setEditingOutsideItem(null)}
          maxWidth="max-w-md"
        >
          <EditItemFormInline
            item={editingOutsideItem}
            busy={busy}
            showSize={true}
            showStack={true}
            onCancel={() => setEditingOutsideItem(null)}
            onSave={handleSaveOutsideEdit}
          />
        </FormModal>
      )}

      {/* مودال عرض غرض خارج المساحات (قراءة فقط) */}
      {viewingOutsideItem && (
        <FormModal
          title={viewingOutsideItem.name}
          subtitle="غرض في منطقة التخزين المفتوحة"
          onClose={() => setViewingOutsideItem(null)}
          maxWidth="max-w-sm"
        >
          <div className="space-y-3">
            {viewingOutsideItem.photo_url ? (
              <img
                src={viewingOutsideItem.photo_url}
                alt={viewingOutsideItem.name}
                onClick={() => setZoom({ url: viewingOutsideItem.photo_url, caption: viewingOutsideItem.name })}
                className="w-full max-h-64 object-contain rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 cursor-zoom-in"
                title="اضغط لتكبير الصورة"
              />
            ) : (
              <div className="w-full h-32 rounded-lg border border-stone-200 dark:border-stone-700 bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-800 dark:to-amber-900 flex items-center justify-center">
                <span className="text-sm font-bold text-amber-900 dark:text-amber-100 text-center px-3">{viewingOutsideItem.name}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 dark:text-stone-400">الكميّة</span>
              <span className="font-bold dark:text-stone-200">{viewingOutsideItem.quantity}</span>
            </div>
            {can('add') && (
              <button
                onClick={() => { const it = viewingOutsideItem; setViewingOutsideItem(null); setEditingOutsideItem(it); }}
                className="w-full bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 py-2 rounded-lg text-xs font-medium hover:bg-stone-200 dark:hover:bg-stone-700">
                ✏️ تعديل هذا الغرض
              </button>
            )}
          </div>
        </FormModal>
      )}

      {/* تكبير الصورة */}
      <ImageLightbox url={zoom?.url} caption={zoom?.caption} onClose={() => setZoom(null)} />

      {/* مودال قائمة عند النقر على بطاقة إحصائيّة */}
      {statModal === 'boxes' && (
        <FormModal title={`📦 جميع الصناديق (${totalBoxes})`} onClose={() => setStatModal(null)} maxWidth="max-w-3xl">
          <BoxesListView data={data} onJump={onItemClick} onClose={() => setStatModal(null)} />
        </FormModal>
      )}
      {statModal === 'items' && (
        <FormModal title={`🔧 جميع الأغراض (${totalItemTypes})`} onClose={() => setStatModal(null)} maxWidth="max-w-3xl">
          <AllItemsList data={data} onItemClick={(c) => { setStatModal(null); onItemClick?.(c); }} onRefresh={onRefresh} />
        </FormModal>
      )}
      {statModal === 'checkouts' && (
        <FormModal title={`📤 الإخراجات الحاليّة (${checkedOutCount})`} onClose={() => setStatModal(null)} maxWidth="max-w-2xl">
          <CheckoutsListView checkouts={data.checkouts} onJump={onItemClick} onClose={() => setStatModal(null)} />
        </FormModal>
      )}
    </>
  );
}

// حقل التكديس — كم قطعة فوق بعض (يُخزَّن كـ stack_index = العدد − 1)
function StackLayersField({ layers, setLayers }) {
  return (
    <div>
      <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">⬆ التكديس — كم واحد فوق بعض؟</label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setLayers(l => Math.max(1, l - 1))}
          className="w-9 h-9 rounded-lg border border-stone-300 dark:border-stone-600 text-lg font-bold hover:bg-stone-100 dark:hover:bg-stone-700 dark:text-stone-300">−</button>
        <div className="flex-1 text-center">
          <span className="text-base font-bold text-purple-700 dark:text-purple-300">{layers}</span>
          <span className="text-[11px] text-stone-500 dark:text-stone-400 mr-1">{layers > 1 ? 'مكدّسة فوق بعض' : 'بدون تكديس'}</span>
        </div>
        <button type="button" onClick={() => setLayers(l => Math.min(8, l + 1))}
          className="w-9 h-9 rounded-lg border border-stone-300 dark:border-stone-600 text-lg font-bold hover:bg-stone-100 dark:hover:bg-stone-700 dark:text-stone-300">+</button>
      </div>
    </div>
  );
}

// نموذج تفاصيل غرض جديد (الاسم + الكميّة + صورة)
function NewItemForm({ busy, onCancel, onSave, showStack = false }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [layers, setLayers] = useState(1);
  const isValid = name.trim().length > 0;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (isValid) onSave({ name, quantity, photo_url: photoUrl, ...(showStack ? { stack: layers - 1 } : {}) }); }}
      className="space-y-3">
      <div>
        <label className="block text-xs text-stone-600 mb-1">اسم الغرض *</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          placeholder="مثال: حبال تجاذب"
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      </div>
      <div>
        <label className="block text-xs text-stone-600 mb-1">الكميّة</label>
        <input type="number" min="1" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      </div>
      {showStack && <StackLayersField layers={layers} setLayers={setLayers} />}
      <PhotoUploader
        value={photoUrl}
        onChange={setPhotoUrl}
        prefix="items"
        label="صورة الغرض (اختياريّة)"
      />
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={busy || !isValid}
          className="flex-1 bg-brand-blue text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-800 disabled:opacity-50">
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

function StatCard({ num, label, color = 'default', onClick }) {
  const colors = {
    default: 'text-stone-900 dark:text-stone-300',
    orange: 'text-orange-600 dark:text-orange-400',
    red: 'text-red-600 dark:text-red-400'
  };
  const baseClass = `bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-3 text-center transition ${
    onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5' : ''
  }`;
  const inner = (
    <>
      <div className={`text-2xl font-display font-bold ${colors[color]}`}>{num}</div>
      <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
        {label}
        {onClick && <span className="text-blue-500 mr-1 text-[9px]">(اضغط للعرض)</span>}
      </div>
    </>
  );
  if (onClick) return <button onClick={onClick} className={baseClass + ' w-full'}>{inner}</button>;
  return <div className={baseClass}>{inner}</div>;
}

// ====== لوحة خريطة المستودع: مساحات + أغراض خارج المساحات (قابلة للسحب) ======
function WarehouseMapCanvas({
  zones, outsideItems, data, isFounder, busy, layoutEditMode,
  boxCountForZone, onZoneClick, onZoneEdit, onZoneDelete,
  onItemEdit, onItemDelete, onItemView, onDrawComplete, onRefresh, flash,
  activeWarehouse, gridEnabled, gridSpacingPctX, gridSpacingPctY, snapX, snapY, showMeasurements
}) {
  const containerRef = useRef(null);

  // ====== الرسم بالخطوط: في وضع التحرير، اضغط لإضافة نقاط ثمّ أغلق الشكل ======
  const canDraw = layoutEditMode && isFounder;
  const [polyActive, setPolyActive] = useState(false);
  const [polyPoints, setPolyPoints] = useState([]); // [{x,y}] نِسب مئويّة على الأرضيّة

  function pctFromClient(clientX, clientY) {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    // نقيس نسبةً لصندوق الحشو (padding box) — وهو الإطار الذي تُموضَع عليه الغرف
    // المطلقة بالنِّسب — حتى يقع الشكل تماماً حيث رُسم (الحدّ border-2 + الحشو px-4/py-8).
    const left = r.left + el.clientLeft;
    const top  = r.top  + el.clientTop;
    const w = el.clientWidth  || r.width;
    const h = el.clientHeight || r.height;
    return {
      x: Math.max(0, Math.min(100, ((clientX - left) / w) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - top) / h) * 100))
    };
  }

  // تحويل نقاط الأرضيّة إلى شكل: مربّع إحاطة + نقاط نسبيّة لـ«الامتداد الحقيقي»
  // (لا للمربّع المقصوص) حتى لا تنضغط الجدران الرفيعة. مع رفض الأشكال المتحلّلة.
  function finishPolygon(pts) {
    if (!pts || pts.length < 3) return;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const truW = Math.max(...xs) - minX, truH = Math.max(...ys) - minY;
    // مساحة المضلّع (shoelace) — لرفض الخطوط المستقيمة (مساحة ≈ 0)
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    area = Math.abs(area) / 2;
    if (area < 0.4 || (truW < 0.8 && truH < 0.8)) {
      flash?.('الشكل صغير جداً أو خطّ مستقيم — ارسم مضلّعاً له مساحة', 'error');
      setPolyActive(false);
      setPolyPoints([]);
      return;
    }
    // النقاط نسبةً للامتداد الحقيقي (لا للقيمة المقصوصة) لئلّا تنضغط
    const rel = pts.map(p => ({
      x: Math.round((truW > 0.01 ? (p.x - minX) / truW : 0) * 1000) / 10,
      y: Math.round((truH > 0.01 ? (p.y - minY) / truH : 0) * 1000) / 10
    }));
    // مربّع الإحاطة بحدّ أدنى للسماكة حتى يبقى مرئيّاً وقابلاً للتفاعل
    const w = Math.max(1.5, truW), h = Math.max(1.5, truH);
    setPolyActive(false);
    setPolyPoints([]);
    onDrawComplete?.({ top: minY, left: minX, width: w, height: h, points: rel });
  }

  // خطّ مفتوح (جدار/منحنى): نفس التطبيع لكن بلا رفض المساحة، ونعلّم النقطة الأولى open
  function finishLine(pts) {
    if (!pts || pts.length < 2) { flash?.('ارسم نقطتين على الأقل للجدار', 'error'); return; }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const truW = Math.max(...xs) - minX, truH = Math.max(...ys) - minY;
    if (truW < 0.8 && truH < 0.8) { flash?.('الخطّ قصير جداً', 'error'); setPolyActive(false); setPolyPoints([]); return; }
    // علامة open على النقطة الأولى = خطّ مفتوح (تبقى داخل JSONB ولا تُحذف عند الحفظ)
    const rel = pts.map((p, i) => ({
      x: Math.round((truW > 0.01 ? (p.x - minX) / truW : 0) * 1000) / 10,
      y: Math.round((truH > 0.01 ? (p.y - minY) / truH : 0) * 1000) / 10,
      ...(i === 0 ? { open: true } : {})
    }));
    setPolyActive(false);
    setPolyPoints([]);
    onDrawComplete?.({ top: minY, left: minX, width: Math.max(1.5, truW), height: Math.max(1.5, truH), points: rel });
  }

  function handleFloorClick(clientX, clientY) {
    const raw = pctFromClient(clientX, clientY);
    const p = { x: snapValue(raw.x, snapX), y: snapValue(raw.y, snapY) };
    // الضغط قرب النقطة الأولى (مع ≥3 نقاط) يُغلق الشكل
    if (polyPoints.length >= 3) {
      const first = polyPoints[0];
      if (Math.abs(p.x - first.x) < 3.5 && Math.abs(p.y - first.y) < 3.5) { finishPolygon(polyPoints); return; }
    }
    setPolyPoints(pts => [...pts, p]);
  }

  // حفظ موقع/حجم الغرفة بعد سحبها أو تكبيرها (وضع تحرير المخطّط)
  async function handleZoneGeometry(zone, rect) {
    try {
      await rpcUpdateZone(zone, {
        pos_top: rect.top, pos_left: rect.left, pos_right: null,
        pos_width: rect.width, pos_height: rect.height
      });
      onRefresh?.();
    } catch (err) {
      flash?.('فشل حفظ المخطّط: ' + err.message, 'error');
    }
  }
  // مستطيلات المساحات كعوائق — الغرض الحرّ ممنوع أن يتداخل معها إطلاقاً
  const zoneObstacles = useMemo(() => zones.map(z => naturalZoneRect(z)), [zones]);

  // عند إفلات غرض على الخريطة: احفظ موقعه فقط — المساحات ثابتة لا تتأثّر
  async function handleItemDropped(item, newPos) {
    try {
      await updateOutsideItemPosition(item.id, {
        pos_top: newPos.top,
        pos_left: newPos.left
      });
      onRefresh?.();
    } catch (err) {
      flash?.('فشل حفظ الموقع: ' + err.message, 'error');
    }
  }

  async function handleItemResized(item, newSize) {
    try {
      await updateOutsideItemPosition(item.id, {
        width_pct:  newSize.width,
        height_pct: newSize.height
      });
      onRefresh?.();
    } catch (err) {
      flash?.('فشل حفظ الحجم: ' + err.message, 'error');
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-3xl aspect-[4/6] bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-900 dark:to-stone-950 rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 shadow-inner"
    >
      {/* شبكة القياس — خلف كل شي، بلا تفاعل */}
      {gridEnabled && gridSpacingPctX > 0 && gridSpacingPctY > 0 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="whGrid" width={gridSpacingPctX} height={gridSpacingPctY} patternUnits="userSpaceOnUse">
              <path d={`M ${gridSpacingPctX} 0 L 0 0 0 ${gridSpacingPctY}`} fill="none" stroke="#94a3b8" strokeOpacity="0.45" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#whGrid)" />
        </svg>
      )}

      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] text-stone-400 dark:text-stone-500 tracking-widest font-medium pointer-events-none">
        الجدار الخلفي
      </div>

      {/* زرّ بدء الرسم بالخطوط */}
      {canDraw && !polyActive && (
        <button
          onClick={() => { setPolyActive(true); setPolyPoints([]); }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 text-[11px] bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow hover:bg-blue-700 font-bold">
          ✏️ ارسم شكلاً
        </button>
      )}

      {/* طبقة الرسم بالخطوط — تلتقط الضغطات لإضافة نقاط */}
      {polyActive && (
        <div
          className="absolute inset-0 z-50 cursor-crosshair"
          style={{ touchAction: 'none' }}
          onPointerUp={(e) => handleFloorClick(e.clientX, e.clientY)}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {polyPoints.length >= 2 && (
              <polygon
                points={polyPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth="1.5"
                strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
            )}
            {polyPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 1.8 : 1.2}
                fill={i === 0 ? '#1d4ed8' : '#3b82f6'} stroke="#fff" strokeWidth="0.5"
                vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {/* أزرار التحكّم */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-2 z-10" onPointerUp={(e) => e.stopPropagation()}>
            <button onClick={() => finishPolygon(polyPoints)} disabled={polyPoints.length < 3}
              className="text-[11px] bg-green-600 text-white px-3 py-1.5 rounded-lg shadow hover:bg-green-700 font-bold disabled:opacity-40">
              ✅ أغلق الشكل
            </button>
            <button onClick={() => finishLine(polyPoints)} disabled={polyPoints.length < 2}
              className="text-[11px] bg-stone-700 text-white px-3 py-1.5 rounded-lg shadow hover:bg-stone-800 font-bold disabled:opacity-40"
              title="أنهِ النقاط كجدار/خطّ مفتوح يتبع الشكل">
              📏 أنهِ كجدار
            </button>
            <button onClick={() => setPolyPoints(pts => pts.slice(0, -1))} disabled={polyPoints.length === 0}
              className="text-[11px] bg-white text-stone-700 border border-stone-300 px-3 py-1.5 rounded-lg shadow hover:bg-stone-100 disabled:opacity-40">
              ↶ تراجع
            </button>
            <button onClick={() => { setPolyActive(false); setPolyPoints([]); }}
              className="text-[11px] bg-white text-red-600 border border-red-300 px-3 py-1.5 rounded-lg shadow hover:bg-red-50">
              ✕ إلغاء
            </button>
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-blue-700 dark:text-blue-300 bg-white/85 dark:bg-stone-800/85 px-3 py-1 rounded-full font-medium text-center">
            اضغط لإضافة نقطة · اضغط النقطة الأولى أو «أغلق الشكل» للإنهاء ({polyPoints.length})
          </div>
        </div>
      )}

      {/* مساحات التخزين ثابتة تماماً — لا تتحرّك ولا تتقلّص إطلاقاً */}
      {zones.map(z => (
        <ZoneTile
          key={z.id}
          zone={z}
          displayRect={naturalZoneRect(z)}
          boxCount={boxCountForZone(z.letter)}
          zoneShelves={z.shelves || []}
          zoneBoxes={data.boxes.filter(b => b.code.startsWith(z.letter + '-'))}
          zoneItems={(data.items || []).filter(it => it.box_id == null && it.shelf_id != null && it.zone_id === z.id)}
          onClick={() => onZoneClick(z)}
          isFounder={isFounder}
          busy={busy}
          editMode={layoutEditMode}
          warehouse={activeWarehouse}
          showMeasurements={showMeasurements}
          snapX={snapX}
          snapY={snapY}
          containerRef={containerRef}
          onGeometry={handleZoneGeometry}
          onEdit={() => onZoneEdit(z)}
          onDelete={() => onZoneDelete(z)}
        />
      ))}

      {/* الأغراض خارج المساحات — ظاهرة دائماً؛ التحريك/التكبير في وضع التعديل فقط،
          وخارجه ضغطة تفتح بطاقة العرض */}
      {outsideItems.map(it => (
        <FreeItemSquare
          key={it.id}
          item={it}
          containerRef={containerRef}
          isFounder={isFounder}
          editMode={layoutEditMode}
          snapX={snapX}
          snapY={snapY}
          obstacles={zoneObstacles}
          onView={() => onItemView?.(it)}
          onEdit={() => onItemEdit(it)}
          onDelete={() => onItemDelete(it)}
          onDropped={handleItemDropped}
          onResized={handleItemResized}
        />
      ))}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[10px] text-stone-400 dark:text-stone-500 tracking-widest">ممرّ الحركة</span>
      </div>

      <div className="absolute -bottom-px left-1/2 -translate-x-1/2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 border-b-0 rounded-t-xl px-5 py-1 text-[10px] text-stone-600 dark:text-stone-300 font-medium shadow-sm">
        🚪 المدخل
      </div>
    </div>
  );
}

// قائمة كل الصناديق — تُعرض في مودال
function BoxesListView({ data, onJump, onClose }) {
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('all');

  const enriched = data.boxes.map(b => {
    const zone = (data.zones || []).find(z => b.code.startsWith(z.letter + '-'));
    const itemCount = data.items.filter(it => it.box_id === b.id).length;
    return { ...b, zone, itemCount };
  });

  const filtered = enriched.filter(b => {
    if (filterZone !== 'all' && !b.code.startsWith(filterZone + '-')) return false;
    if (search.trim() && !`${b.code} ${b.description || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ابحث برقم أو وصف..."
          className="px-3 py-2 border border-stone-300 rounded-lg text-xs" />
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
          className="px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-xs bg-white dark:bg-stone-800 dark:text-stone-200">
          <option value="all">كل المساحات</option>
          {(data.zones || []).map(z => (
            <option key={z.id} value={z.letter}>{z.letter} — {z.name}</option>
          ))}
        </select>
      </div>
      <div className="text-[11px] text-stone-500">عرض {filtered.length} من {enriched.length} صندوق · اضغط أيّ صندوق للذهاب إليه</div>
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-stone-400 py-8">لا توجد نتائج</p>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
          {filtered.map(b => (
            <button key={b.id}
              onClick={() => { onClose(); onJump?.(b.code); }}
              className="bg-white dark:bg-stone-900 border-2 border-stone-200 dark:border-stone-800 rounded-lg p-3 text-right hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-stone-800 transition">
              <div className="flex items-center gap-2 mb-1">
                {b.photo_url ? (
                  <img src={b.photo_url} alt={b.code} className="w-8 h-8 object-cover rounded" />
                ) : (
                  <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center text-sm">📦</div>
                )}
                <div className="text-sm font-mono font-bold" style={{ color: b.zone?.color || '#185FA5' }}>{b.code}</div>
              </div>
              {b.description && <div className="text-[10px] text-stone-500 truncate mb-1">{b.description}</div>}
              <div className="text-[10px] text-stone-400">{b.itemCount} {b.itemCount === 1 ? 'صنف' : 'صنف'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// قائمة الإخراجات الحاليّة — تُعرض في مودال
function CheckoutsListView({ checkouts, onJump, onClose }) {
  if (checkouts.length === 0) {
    return <p className="text-center text-sm text-stone-400 py-8">لا توجد إخراجات حاليّة 🎉</p>;
  }
  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      {checkouts.map(c => (
        <div key={c.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-orange-100 text-orange-700 flex items-center justify-center text-lg">📤</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{c.item_name} <span className="text-[10px] text-stone-500">×{c.quantity}</span></div>
            <div className="text-[10px] text-stone-500">
              لـ <strong>{c.user_name}</strong> · من {c.box_code} · بتاريخ {new Date(c.date_out).toLocaleDateString('ar-SA')}
            </div>
            {c.purpose === 'initiative' && c.initiative && (
              <div className="text-[10px] text-blue-700">مبادرة: {c.initiative}</div>
            )}
          </div>
          <button onClick={() => { onClose(); onJump?.(c.box_code); }}
            className="text-[10px] bg-blue-50 border border-blue-300 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 whitespace-nowrap">
            اذهب →
          </button>
        </div>
      ))}
    </div>
  );
}

function ZoneTile({ zone, displayRect, boxCount, onClick, isFounder, busy, onEdit, onDelete, zoneShelves = [], zoneBoxes = [], zoneItems = [], editMode = false, containerRef, onGeometry, warehouse, showMeasurements = false, snapX = null, snapY = null }) {
  const editing = editMode && isFounder;
  // العنصر الهيكلي (رصاصي): ثابت وغير قابل للضغط — جدار/طاولة/خشب
  const isDecor = (zone.color || '').toUpperCase() === STRUCTURE_COLOR.toUpperCase();
  const fallbackRect = { top: zone.pos_top ?? 0, left: zone.pos_left ?? 0, width: zone.pos_width ?? 18, height: zone.pos_height ?? 42 };
  const { pos, mode, begin } = useDragResize({
    rect: displayRect || fallbackRect,
    containerRef,
    enabled: editing,
    snapX: editing ? snapX : null,
    snapY: editing ? snapY : null,
    onChange: (r) => onGeometry?.(zone, r)
  });
  const rect = editing ? pos : (displayRect || fallbackRect);
  // شكل المضلّع (إن وُجد) — يُقصّ بالنسب المئويّة داخل مربّع الإحاطة. خارج وضع
  // التحرير فقط، حتى يبقى مقبضا التحريك/التكبير على المربّع الكامل متاحَين.
  // جدار مفتوح (خطّ/منحنى): يُرسَم كخطّ بدل قصّ مساحة مملوءة
  const isOpenWall = isDecor && Array.isArray(zone.points) && zone.points[0]?.open;
  const wallStroke = isOpenWall && !editing;   // اعرض كخطّ خارج وضع التحرير فقط
  const polyClip = (!isOpenWall && Array.isArray(zone.points) && zone.points.length >= 3)
    ? `polygon(${zone.points.map(p => `${p.x}% ${p.y}%`).join(', ')})`
    : undefined;
  const style = {
    top:    `${rect.top}%`,
    left:   `${rect.left}%`,
    width:  `${rect.width}%`,
    height: `${rect.height}%`,
    borderColor: wallStroke ? 'transparent' : zone.color,
    backgroundImage: isDecor ? 'none' : `linear-gradient(135deg, ${zone.color}26 0%, var(--tile-bg) 60%)`,
    backgroundColor: wallStroke ? 'transparent' : (isDecor ? `${zone.color}66` : undefined),
    boxShadow: wallStroke ? 'none' : `0 8px 20px -10px ${zone.color}55, 0 2px 6px -2px ${zone.color}30`,
    transition: mode ? 'none' : 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
    zIndex: mode ? 50 : undefined,
    cursor: editing ? (mode === 'move' ? 'grabbing' : 'grab') : undefined,
    touchAction: editing ? 'none' : undefined,
    clipPath: editing ? undefined : polyClip
  };
  const shelvesToShow = (zoneShelves || []).slice().sort((a, b) => a.shelf_index - b.shelf_index).slice(0, 6);
  const showShelves = shelvesToShow.length > 0;

  return (
    <div style={style}
      onMouseDown={editing ? (e) => { e.preventDefault(); e.stopPropagation(); begin('move', e.clientX, e.clientY); } : undefined}
      onTouchStart={editing ? (e) => { const t = e.touches[0]; if (t) begin('move', t.clientX, t.clientY); } : undefined}
      className={`absolute border-2 rounded-xl flex flex-col group ${wallStroke ? '' : 'overflow-hidden'} ${editing ? 'ring-2 ring-blue-500 ring-offset-1 select-none' : (isDecor ? '' : 'transition-transform hover:scale-[1.02]')}`}>
      {wallStroke && <WallStrokeOverlay points={zone.points} color={zone.color} thickness={3} />}
      <button onClick={(editing || isDecor) ? undefined : onClick} className={`flex-1 relative flex flex-col w-full ${(editing || isDecor) ? '' : 'hover:brightness-95 transition'}`}>
        <div className="h-1.5 w-full" style={{ backgroundColor: zone.color, opacity: 0.85 }}></div>

        <div className="relative flex-1 flex flex-col px-1.5 py-2 gap-1">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none z-10">
            {!isDecor && <div className="text-3xl font-display font-bold leading-none drop-shadow-md" style={{ color: zone.color }}>{zone.letter}</div>}
            <div className="mt-1 leading-tight text-center font-semibold backdrop-blur rounded-full px-2 py-0.5 shadow-sm text-[10px]"
              style={{ backgroundColor: 'var(--tile-pill-bg)', color: 'var(--tile-pill-text)' }}>
              {zone.name}
            </div>
            {showMeasurements && (
              <div className="mt-0.5 text-[8px] font-bold text-stone-700 dark:text-stone-100 bg-white/80 dark:bg-stone-900/80 rounded px-1 leading-tight shadow-sm">
                {formatDim(rect.width / 100 * (Number(warehouse?.width_m) || 4))} × {formatDim(rect.height / 100 * (Number(warehouse?.depth_m) || 4))}
              </div>
            )}
          </div>

          {!isDecor && (showShelves ? (
            <div className="flex-1 flex flex-row gap-[3px] items-stretch">
              {shelvesToShow.map((sh) => {
                const shelfBoxes = zoneBoxes.filter(b => b.code.split('-')[1] === String(sh.shelf_index));
                const shelfLargeItems = (zoneItems || []).filter(it => it.shelf_id === sh.id);
                const itemCells = shelfLargeItems.reduce((s, it) => {
                  const pct = Number(it.width_pct);
                  return s + Math.max(1, Math.round((pct >= 25 && pct <= 100 ? pct : 0) / 100 * (sh.max_boxes || 4)));
                }, 0);
                const occupied = shelfBoxes.length + itemCells;
                const cap = Math.max(sh.max_boxes || 4, occupied, 1);
                return (
                  <div key={sh.id}
                    className="flex-1 flex flex-col rounded-md gap-[2px] p-[2px] relative"
                    style={{
                      borderRight: `2px solid ${zone.color}40`,
                      borderLeft:  `2px solid ${zone.color}40`,
                      backgroundColor: zone.color + '0a'
                    }}
                    title={`الرف ${sh.shelf_index}${sh.label ? ' — ' + sh.label : ''} (${occupied}/${sh.max_boxes})`}
                  >
                    {Array.from({ length: cap }).map((_, k) => {
                      const has = k < occupied;
                      const isItemCell = k >= shelfBoxes.length && k < occupied;
                      return (
                        <div key={k} className="flex-1 rounded-[2px] transition"
                          style={{
                            backgroundColor: has ? (isItemCell ? '#d97706d0' : zone.color + 'd0') : 'transparent',
                            border: has ? 'none' : `1px dashed ${zone.color}40`,
                            minHeight: '3px'
                          }}>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-[9px] text-stone-400 italic">— لا توجد أرفف —</div>
            </div>
          ))}
        </div>

        {!isDecor && (
          <div className="text-[10px] text-center py-1 backdrop-blur border-t font-semibold"
            style={{
              backgroundColor: 'var(--tile-pill-bg)',
              color: 'var(--tile-pill-text)',
              borderColor: zone.color + '40'
            }}>
            {boxCount} {boxCount === 1 ? 'صندوق' : 'صناديق'}
            {zoneItems.length > 0 && ` · ${zoneItems.length} غرض كبير`}
          </div>
        )}
      </button>

      {isFounder && (
        <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition z-20">
          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEdit(); }} disabled={busy}
            className="text-[10px] bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 w-6 h-6 rounded-md shadow-md hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center justify-center"
            title="تعديل"
          >✏️</button>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={busy}
            className="text-[10px] bg-white dark:bg-stone-800 border border-red-300 dark:border-red-800 w-6 h-6 rounded-md shadow-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center justify-center"
            title="حذف"
          >🗑</button>
        </div>
      )}

      {editing && (
        <div
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); begin('resize', e.clientX, e.clientY); }}
          onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) begin('resize', t.clientX, t.clientY); }}
          className="absolute bottom-0 left-0 w-6 h-6 flex items-end justify-start cursor-nesw-resize z-30"
          title="اسحب لتغيير الحجم">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue-600 drop-shadow">
            <path d="M22 22H2v-2h2v-2H2v-2h4v-2H2v-2h6V8H2V6h8V2h2v18h2v-6h2v6h2v-4h2v4h2v2z" transform="scale(-1,1) translate(-24,0)"/>
          </svg>
        </div>
      )}
    </div>
  );
}

// ====== قائمة كل الأغراض في المستودع ======
function AllItemsList({ data, onItemClick, onRefresh, onAddItem }) {
  const { isFounder, can } = useAuth();
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [busy, setBusy] = useState(false);

  // كلّ الوسوم الفريدة في المستودع
  const allTags = useMemo(() => {
    const set = new Set();
    (data.items || []).forEach(it => (it.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [data.items]);

  async function handleQuickDelete(item) {
    setBusy(true);
    const { error } = await softDeleteItem(item.id);
    setBusy(false);
    setConfirmDelete(null);
    if (error) return alert('فشل الحذف: ' + error.message);
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
    if (error) return alert('فشل التعديل: ' + error.message);
    onRefresh?.();
  }

  const enriched = useMemo(() => {
    return data.items.map(it => {
      const loc = resolveItemLocation(it, { boxes: data.boxes, zones: data.zones || [] });
      if (!loc) {
        // غرض مرتبط بصندوق محذوف/مفقود — يبقى ظاهراً بموقع غير معروف
        return {
          ...it, boxCode: '—', navCode: null, zoneLetter: undefined,
          zoneName: '—', zoneColor: '#888', zone: null, sortKey: ['ZZZ', 0, 0]
        };
      }
      const zone = (data.zones || []).find(z => z.letter === loc.zoneLetter);
      return {
        ...it,
        boxCode: loc.boxCode,
        navCode: loc.navCode,
        zoneLetter: loc.zoneLetter,
        zoneName: loc.zoneName,
        zoneColor: loc.zoneColor,
        zone,
        sortKey: loc.sortKey
      };
    }).sort((a, b) => {
      // مقارنة المفاتيح بالترتيب: مساحة، رف، موقع — كلها رقمية
      for (let i = 0; i < 3; i++) {
        if (a.sortKey[i] < b.sortKey[i]) return -1;
        if (a.sortKey[i] > b.sortKey[i]) return 1;
      }
      return (a.name || '').localeCompare(b.name || '', 'ar');
    });
  }, [data.items, data.boxes, data.zones]);

  const filtered = enriched.filter(it => {
    if (search.trim() && !`${it.name} ${it.boxCode}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterZone !== 'all' && it.zoneLetter !== filterZone) return false;
    if (filterTag !== 'all' && !(it.tags || []).includes(filterTag)) return false;
    return true;
  });

  return (
    <div>
      <div className={`grid gap-2 mb-3 ${allTags.length > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ابحث..."
          className="px-3 py-2 border border-stone-300 rounded-lg text-xs"
        />
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
          className="px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-xs bg-white dark:bg-stone-800 dark:text-stone-200">
          <option value="all">كل المساحات</option>
          {(data.zones || []).map(z => (
            <option key={z.id} value={z.letter}>{z.letter} — {z.name}</option>
          ))}
        </select>
        {allTags.length > 0 && (
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
            className="px-3 py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-xs bg-white dark:bg-stone-800 dark:text-stone-200">
            <option value="all">🏷 كل الوسوم</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="text-[11px] text-stone-500">
          عرض {filtered.length} من {enriched.length} صنف · اضغط أيّ صنف للذهاب لمكانه
        </div>
        {can('add') && onAddItem && (
          <button onClick={onAddItem}
            className="text-xs bg-gradient-to-l from-brand-navy to-brand-purple text-white px-3 py-1.5 rounded-lg hover:opacity-90 font-medium shadow-sm">
            + إضافة غرض جديد
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-stone-400 py-12">
          {enriched.length === 0 ? 'لا توجد أغراض في هذا المستودع بعد' : 'لا توجد نتائج لبحثك'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(it => (
            <div
              key={it.id}
              className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-2.5 flex items-center gap-3 hover:shadow-md transition"
            >
              <button
                onClick={() => it.navCode && onItemClick && onItemClick(it.navCode)}
                disabled={!it.navCode}
                className={`flex items-center gap-3 flex-1 text-right -m-2.5 p-2.5 rounded-lg transition min-w-0 ${it.navCode ? 'hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer' : 'cursor-default'}`}
              >
                {it.photo_url ? (
                  <img src={it.photo_url} alt={it.name} className="w-12 h-12 object-cover rounded border border-stone-200 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded bg-gradient-to-br from-amber-50 to-stone-100 dark:from-amber-950/40 dark:to-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-[9px] font-bold text-stone-700 dark:text-stone-300 text-center p-1 flex-shrink-0 leading-tight overflow-hidden">
                    <span className="line-clamp-2">{it.name}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium truncate">{it.name}</h4>
                  <p className="text-[10px] text-stone-500">الكميّة: {it.quantity}</p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded font-bold font-mono" style={{ color: it.zoneColor, backgroundColor: it.zoneColor + '15' }}>
                  {it.boxCode}
                </span>
                {it.navCode ? <span className="text-stone-400">→</span> : <span className="w-3" />}
              </button>
              {(isFounder || can('edit')) && (
                <button
                  onClick={() => setEditingItem(it)}
                  disabled={busy}
                  className="text-[10px] bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 px-2 py-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-700 flex-shrink-0"
                  title="تعديل هذا الصنف"
                >
                  ✏️
                </button>
              )}
              {(isFounder || can('delete')) && (
                <button
                  onClick={() => setConfirmDelete(it)}
                  disabled={busy}
                  className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded hover:bg-red-100 flex-shrink-0"
                  title="حذف هذا الصنف"
                >
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
          <EditItemFormInline
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

// نموذج تعديل غرض من قائمة "كل الأغراض". showSize=true يُظهر اختيار حجم الغرض الخارجي على الخريطة
function EditItemFormInline({ item, busy, onCancel, onSave, showSize = false, showStack = false }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [photoUrl, setPhotoUrl] = useState(item.photo_url || null);
  const [widthPct, setWidthPct] = useState(Number(item.width_pct) || 12);
  const [heightPct, setHeightPct] = useState(Number(item.height_pct) || 12);
  const [layers, setLayers] = useState((Number(item.stack_index) || 0) + 1);
  const dirty =
    name !== item.name ||
    Number(quantity) !== Number(item.quantity) ||
    photoUrl !== (item.photo_url || null) ||
    (showStack && (layers - 1) !== (Number(item.stack_index) || 0)) ||
    (showSize && (widthPct !== (Number(item.width_pct) || 12) || heightPct !== (Number(item.height_pct) || 12)));

  // مقاسات جاهزة (نسبة من عرض/ارتفاع الأرضية) + تكبير/تصغير يدويّ ضمن الحدود
  const sizePresets = [{ t: 'صغير', w: 8, h: 8 }, { t: 'متوسط', w: 14, h: 14 }, { t: 'كبير', w: 22, h: 22 }, { t: 'كبير جداً', w: 32, h: 32 }];
  const clampW = (v) => Math.max(5, Math.min(70, Math.round(v)));
  const clampH = (v) => Math.max(5, Math.min(90, Math.round(v)));

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (dirty && name.trim()) onSave({ name, quantity, photo_url: photoUrl, ...(showStack ? { stack_index: layers - 1 } : {}), ...(showSize ? { width_pct: widthPct, height_pct: heightPct } : {}) }); }}
      className="space-y-3">
      <div>
        <label className="block text-xs text-stone-700 dark:text-stone-300 font-medium mb-1">الاسم</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
      </div>
      <div>
        <label className="block text-xs text-stone-700 dark:text-stone-300 font-medium mb-1">الكميّة</label>
        <input type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
      </div>
      {showStack && <StackLayersField layers={layers} setLayers={setLayers} />}
      {showSize && (
        <div>
          <label className="block text-xs text-stone-700 dark:text-stone-300 font-medium mb-1">حجم الغرض على الخريطة</label>
          <div className="grid grid-cols-4 gap-1.5 mb-1.5">
            {sizePresets.map(p => {
              const active = widthPct === p.w && heightPct === p.h;
              return (
                <button key={p.t} type="button" onClick={() => { setWidthPct(p.w); setHeightPct(p.h); }}
                  className={`py-1.5 rounded-lg text-[11px] font-bold border transition ${
                    active
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700'
                  }`}>
                  {p.t}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setWidthPct(w => clampW(w - 3)); setHeightPct(h => clampH(h - 3)); }}
              className="w-8 h-8 rounded-lg border border-stone-300 dark:border-stone-600 dark:text-stone-300 text-lg font-bold hover:bg-stone-100 dark:hover:bg-stone-700">−</button>
            <span className="text-[11px] text-stone-500 dark:text-stone-400 flex-1 text-center">ضبط دقيق</span>
            <button type="button" onClick={() => { setWidthPct(w => clampW(w + 3)); setHeightPct(h => clampH(h + 3)); }}
              className="w-8 h-8 rounded-lg border border-stone-300 dark:border-stone-600 dark:text-stone-300 text-lg font-bold hover:bg-stone-100 dark:hover:bg-stone-700">+</button>
          </div>
        </div>
      )}
      <PhotoUploader
        value={photoUrl}
        onChange={setPhotoUrl}
        prefix="items"
        label="صورة الغرض (اختياريّة)"
      />
      <div className="flex gap-2 pt-2 border-t border-stone-200 dark:border-stone-700">
        <button type="submit" disabled={busy || !dirty || !name.trim()}
          className="flex-1 bg-brand-navy text-white py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? '...' : '💾 حفظ'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
          إلغاء
        </button>
      </div>
    </form>
  );
}
