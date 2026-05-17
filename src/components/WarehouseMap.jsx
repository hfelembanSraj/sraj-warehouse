import { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import LocationPicker from './LocationPicker';
import PhotoUploader from './PhotoUploader';
import { AddZoneForm, AddBoxForm, EditZoneForm, ConfirmDelete, StatusToast, FormModal, useFlash } from './BuilderForms';
import FreeItemSquare from './FreeItemSquare';
import { rpcAddZone, rpcUpdateZone, rpcDeleteZone, rpcAddBox, softDeleteItem, updateOutsideItemPosition } from '../lib/warehouseOps';
import { resolveItemLocation } from '../lib/helpers';

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

  const zones = data.zones || [];

  function boxCountForZone(letter) {
    return data.boxes.filter(b => b.code.startsWith(letter + '-')).length;
  }

  async function handleAddZone(values) {
    if (zones.find(z => z.letter === values.letter.toUpperCase())) {
      flash('هذا الحرف موجود — اختر حرفاً آخر', 'error');
      return;
    }
    setBusy(true);
    const { error } = await rpcAddZone(activeWarehouse.id, values);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تمت إضافة مساحة ${values.letter.toUpperCase()}`);
    setShowAddZone(false);
    await onRefresh();
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
      pos_top: 80,
      pos_left: 40 + jitter,
      width_pct: 12,
      height_pct: 12
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
      photo_url: patch.photo_url || null
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
            title="+ مساحة تخزين جديدة"
            onClose={() => setShowAddZone(false)}
            maxWidth="max-w-lg"
          >
            <AddZoneForm
              busy={busy}
              existingLetters={zones.map(z => z.letter)}
              onCancel={() => setShowAddZone(false)}
              onSave={handleAddZone}
            />
          </FormModal>
        )}

        {viewMode === 'map' ? (
          zones.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm mb-2">هذا المستودع فارغ — لا توجد مساحات تخزين بعد</p>
              {isFounder && !showAddZone && (
                <button onClick={() => setShowAddZone(true)}
                  className="mt-2 bg-amber-500 text-white text-xs px-4 py-2 rounded-lg hover:bg-amber-600">
                  🏗 ابدأ ببناء أوّل مساحة
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <WarehouseMapCanvas
                  zones={zones}
                  outsideItems={outsideItems}
                  data={data}
                  isFounder={isFounder}
                  busy={busy}
                  boxCountForZone={boxCountForZone}
                  onZoneClick={onZoneClick}
                  onZoneEdit={(z) => setEditingZoneId(editingZoneId === z.id ? null : z.id)}
                  onZoneDelete={(z) => setConfirming({ zone: z })}
                  onItemEdit={(it) => setEditingOutsideItem(it)}
                  onItemDelete={handleDeleteOutsideItem}
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
                  💡 <strong>{outsideItems.length}</strong> {outsideItems.length === 1 ? 'غرض' : 'أغراض'} خارج المساحات معروضة على الخريطة — اسحبها لتغيير موقعها
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
            onCancel={() => setEditingOutsideItem(null)}
            onSave={handleSaveOutsideEdit}
          />
        </FormModal>
      )}

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

// نموذج تفاصيل غرض جديد (الاسم + الكميّة + صورة)
function NewItemForm({ busy, onCancel, onSave }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [photoUrl, setPhotoUrl] = useState(null);
  const isValid = name.trim().length > 0;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (isValid) onSave({ name, quantity, photo_url: photoUrl }); }}
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
  zones, outsideItems, data, isFounder, busy,
  boxCountForZone, onZoneClick, onZoneEdit, onZoneDelete,
  onItemEdit, onItemDelete, onRefresh, flash
}) {
  const containerRef = useRef(null);
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
      className="relative w-full max-w-xl aspect-[4/5] bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-900 dark:to-stone-950 rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 shadow-inner"
    >
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] text-stone-400 dark:text-stone-500 tracking-widest font-medium">
        الجدار الخلفي
      </div>

      {/* مساحات التخزين ثابتة تماماً — لا تتحرّك ولا تتقلّص إطلاقاً */}
      {zones.map(z => (
        <ZoneTile
          key={z.id}
          zone={z}
          displayRect={naturalZoneRect(z)}
          boxCount={boxCountForZone(z.letter)}
          zoneShelves={z.shelves || []}
          zoneBoxes={data.boxes.filter(b => b.code.startsWith(z.letter + '-'))}
          onClick={() => onZoneClick(z)}
          isFounder={isFounder}
          busy={busy}
          onEdit={() => onZoneEdit(z)}
          onDelete={() => onZoneDelete(z)}
        />
      ))}

      {/* الأغراض خارج المساحات — مربّعات قابلة للسحب وتغيير الحجم في أيّ مكان */}
      {outsideItems.map(it => (
        <FreeItemSquare
          key={it.id}
          item={it}
          containerRef={containerRef}
          isFounder={isFounder}
          obstacles={zoneObstacles}
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

function ZoneTile({ zone, displayRect, boxCount, onClick, isFounder, busy, onEdit, onDelete, zoneShelves = [], zoneBoxes = [] }) {
  // إن وُجد displayRect (مستطيل بعد التقليص بسبب الأغراض) استخدمه، وإلا استعمل أبعاد الـDB
  const style = displayRect ? {
    top:    `${displayRect.top}%`,
    left:   `${displayRect.left}%`,
    width:  `${displayRect.width}%`,
    height: `${displayRect.height}%`,
    borderColor: zone.color,
    backgroundImage: `linear-gradient(135deg, ${zone.color}26 0%, var(--tile-bg) 60%)`,
    boxShadow: `0 8px 20px -10px ${zone.color}55, 0 2px 6px -2px ${zone.color}30`,
    transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease'
  } : {
    top:    zone.pos_top    != null ? `${zone.pos_top}%`    : undefined,
    bottom: (zone.pos_top == null && zone.pos_height != null) ? `${100 - zone.pos_height - 6}%` : undefined,
    left:   zone.pos_left   != null ? `${zone.pos_left}%`   : undefined,
    right:  zone.pos_right  != null ? `${zone.pos_right}%`  : undefined,
    width:  zone.pos_width  != null ? `${zone.pos_width}%`  : undefined,
    height: zone.pos_height != null ? `${zone.pos_height}%` : undefined,
    borderColor: zone.color,
    backgroundImage: `linear-gradient(135deg, ${zone.color}26 0%, var(--tile-bg) 60%)`,
    boxShadow: `0 8px 20px -10px ${zone.color}55, 0 2px 6px -2px ${zone.color}30`
  };
  // عدد الأرفف المعروضة (حدّ أقصى 6) — مرتّبة بـ shelf_index تصاعدياً
  // في RTL: أوّل عنصر في الـ DOM يظهر يميناً (= الرف الأوّل/الأسفل ماديّاً)
  const shelvesToShow = (zoneShelves || []).slice().sort((a, b) => a.shelf_index - b.shelf_index).slice(0, 6);
  const showShelves = shelvesToShow.length > 0;

  return (
    <div style={style} className="absolute border-2 rounded-xl flex flex-col group overflow-hidden transition-transform hover:scale-[1.02]">
      <button onClick={onClick} className="flex-1 hover:brightness-95 transition relative flex flex-col">
        {/* الجدار العلويّ — حافّة الرف من فوق */}
        <div className="h-1.5 w-full" style={{ backgroundColor: zone.color, opacity: 0.85 }}></div>

        <div className="relative flex-1 flex flex-col px-1.5 py-2 gap-1">
          {/* الحرف والاسم في طبقة علويّة */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="text-3xl font-display font-bold leading-none drop-shadow-md" style={{ color: zone.color }}>{zone.letter}</div>
            <div className="mt-1 leading-tight text-center font-semibold backdrop-blur rounded-full px-2 py-0.5 shadow-sm text-[10px]"
              style={{ backgroundColor: 'var(--tile-pill-bg)', color: 'var(--tile-pill-text)' }}>
              {zone.name}
            </div>
          </div>

          {showShelves ? (
            // الأرفف: صفّ أفقي (في RTL: shelf_index=1 يظهر يميناً = الأوّل/الأسفل، الأكبر يظهر يساراً = الأعلى)
            // كلّ رفّ عمود بصناديقه مكدّسة عمودياً
            <div className="flex-1 flex flex-row gap-[3px] items-stretch">
              {shelvesToShow.map((sh) => {
                const shelfBoxes = zoneBoxes.filter(b => b.code.split('-')[1] === String(sh.shelf_index));
                const cap = Math.max(sh.max_boxes || 4, shelfBoxes.length, 1);
                return (
                  <div key={sh.id}
                    className="flex-1 flex flex-col rounded-md gap-[2px] p-[2px] relative"
                    style={{
                      borderRight: `2px solid ${zone.color}40`,
                      borderLeft:  `2px solid ${zone.color}40`,
                      backgroundColor: zone.color + '0a'
                    }}
                    title={`الرف ${sh.shelf_index}${sh.label ? ' — ' + sh.label : ''} (${shelfBoxes.length}/${sh.max_boxes})`}
                  >
                    {Array.from({ length: cap }).map((_, k) => {
                      const has = k < shelfBoxes.length;
                      return (
                        <div key={k} className="flex-1 rounded-[2px] transition"
                          style={{
                            backgroundColor: has ? zone.color + 'd0' : 'transparent',
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
          )}
        </div>

        {/* شريط معلومات الأسفل */}
        <div className="text-[10px] text-center py-1 backdrop-blur border-t font-semibold"
          style={{
            backgroundColor: 'var(--tile-pill-bg)',
            color: 'var(--tile-pill-text)',
            borderColor: zone.color + '40'
          }}>
          {boxCount} {boxCount === 1 ? 'صندوق' : 'صناديق'}
        </div>
      </button>

      {isFounder && (
        <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition z-20">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} disabled={busy}
            className="text-[10px] bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 w-6 h-6 rounded-md shadow-md hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center justify-center"
            title="تعديل"
          >✏️</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={busy}
            className="text-[10px] bg-white dark:bg-stone-800 border border-red-300 dark:border-red-800 w-6 h-6 rounded-md shadow-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center justify-center"
            title="حذف"
          >🗑</button>
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

// نموذج تعديل غرض من قائمة "كل الأغراض"
function EditItemFormInline({ item, busy, onCancel, onSave }) {
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
