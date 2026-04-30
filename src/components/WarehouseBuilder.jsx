import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const PRESET_COLORS = ['#D85A30', '#185FA5', '#27500A', '#633806', '#7C3AED', '#0891B2', '#BE185D', '#65A30D'];
const PRESET_POSITIONS = [
  { label: 'يمين-علوي',  pos_top: 6,  pos_right: 4,    pos_left: null, pos_width: 18, pos_height: 42 },
  { label: 'يمين-سفلي',  pos_top: 52, pos_right: 4,    pos_left: null, pos_width: 18, pos_height: 42 },
  { label: 'يسار-علوي',  pos_top: 6,  pos_right: null, pos_left: 4,    pos_width: 18, pos_height: 42 },
  { label: 'يسار-سفلي',  pos_top: 52, pos_right: null, pos_left: 4,    pos_width: 18, pos_height: 42 },
  { label: 'وسط-علوي',   pos_top: 6,  pos_right: 41,   pos_left: null, pos_width: 18, pos_height: 30 },
  { label: 'وسط-سفلي',   pos_top: 64, pos_right: 41,   pos_left: null, pos_width: 18, pos_height: 30 }
];

export default function WarehouseBuilder({ onClose, onChanged }) {
  const { isFounder, warehouses, warehouseId, setWarehouseId } = useAuth();
  const [editingWh, setEditingWh] = useState(warehouseId);
  const [layout, setLayout] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAddZoneForm, setShowAddZoneForm] = useState(false);
  const [showRenameForm, setShowRenameForm] = useState(false);

  useEffect(() => {
    if (editingWh) loadLayout();
  }, [editingWh]);

  async function loadLayout() {
    const { data } = await supabase.rpc('get_warehouse_layout', { wh_id: editingWh });
    setLayout(data);
  }

  function flash(text, kind = 'success') {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 4000);
  }

  if (!isFounder) return null;

  // ====================== المستودع ======================
  async function handleCreateWarehouse(values) {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_warehouse', {
      wh_name: values.name.trim(),
      wh_description: values.description?.trim() || '',
      wh_width_m: Number(values.width_m) || 4,
      wh_depth_m: Number(values.depth_m) || 4,
      wh_height_m: Number(values.height_m) || 2.3
    });
    setBusy(false);
    if (error) return flash('فشل الإنشاء: ' + error.message, 'error');
    flash(`✅ تم إنشاء "${values.name}"`);
    setShowCreateForm(false);
    await onChanged();
    setEditingWh(data);
    setWarehouseId(data);
  }

  async function handleRenameWarehouse(values) {
    setBusy(true);
    const { error } = await supabase.rpc('rename_warehouse', {
      wh_id: editingWh,
      new_name: values.name.trim(),
      new_description: values.description?.trim() || null
    });
    setBusy(false);
    if (error) return flash('فشل التحديث: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setShowRenameForm(false);
    await onChanged();
    await loadLayout();
  }

  async function deleteWarehouse() {
    if (warehouses.length <= 1) return flash('لا يمكن حذف آخر مستودع', 'error');
    setBusy(true);
    const { error } = await supabase.rpc('delete_warehouse', { wh_id: editingWh });
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل الحذف: ' + error.message, 'error');
    flash('✅ تم الحذف');
    const remaining = warehouses.find(w => w.id !== editingWh);
    if (remaining) {
      setWarehouseId(remaining.id);
      setEditingWh(remaining.id);
    }
    await onChanged();
  }

  // ====================== المساحات ======================
  async function handleAddZone(values) {
    if (layout?.zones?.find(z => z.letter === values.letter.toUpperCase())) {
      return flash('هذا الحرف موجود — اختر حرفاً آخر', 'error');
    }
    setBusy(true);
    const { error } = await supabase.rpc('add_zone', {
      wh_id: editingWh,
      zone_letter: values.letter.toUpperCase(),
      zone_name: values.name.trim(),
      zone_color: values.color,
      zone_width_cm: Number(values.width_cm) || 200,
      zone_height_cm: Number(values.height_cm) || 230,
      zone_depth_cm: Number(values.depth_cm) || 65,
      shelves_count: Number(values.shelves_count) || 3
    });
    setBusy(false);
    if (error) return flash('فشل الإضافة: ' + error.message, 'error');
    flash(`✅ تمت إضافة مساحة ${values.letter.toUpperCase()}`);
    setShowAddZoneForm(false);
    await loadLayout();
    await onChanged();
  }

  async function updateZone(z, patch) {
    setBusy(true);
    const { error } = await supabase.rpc('update_zone', {
      z_id: z.id,
      z_name: patch.name ?? null,
      z_color: patch.color ?? null,
      z_width_cm: patch.width_cm ?? null,
      z_height_cm: patch.height_cm ?? null,
      z_depth_cm: patch.depth_cm ?? null,
      z_pos_top: patch.pos_top ?? null,
      z_pos_left: 'pos_left' in patch ? patch.pos_left : z.pos_left,
      z_pos_right: 'pos_right' in patch ? patch.pos_right : z.pos_right,
      z_pos_width: patch.pos_width ?? null,
      z_pos_height: patch.pos_height ?? null
    });
    setBusy(false);
    if (error) { flash('فشل الحفظ: ' + error.message, 'error'); return false; }
    flash('✅ تم الحفظ');
    await loadLayout();
    await onChanged();
    return true;
  }

  async function deleteZone(z) {
    setBusy(true);
    const { error } = await supabase.rpc('delete_zone', { z_id: z.id });
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل الحذف: ' + error.message, 'error');
    flash(`✅ تمّ حذف مساحة ${z.letter}`);
    await loadLayout();
    await onChanged();
  }

  // ====================== الأرفف ======================
  async function addShelf(z, values) {
    setBusy(true);
    const { error } = await supabase.rpc('add_shelf', {
      z_id: z.id,
      s_height_cm: Number(values.height_cm) || 70,
      s_max_boxes: Number(values.max_boxes) || 4
    });
    setBusy(false);
    if (error) { flash('فشل الإضافة: ' + error.message, 'error'); return false; }
    flash('✅ تمت إضافة الرف');
    await loadLayout();
    await onChanged();
    return true;
  }

  async function updateShelf(s, patch) {
    setBusy(true);
    const { error } = await supabase.rpc('update_shelf', {
      s_id: s.id,
      s_height_cm: patch.height_cm ?? null,
      s_max_boxes: patch.max_boxes ?? null,
      s_label: patch.label ?? null
    });
    setBusy(false);
    if (error) { flash('فشل الحفظ: ' + error.message, 'error'); return false; }
    flash('✅ تم الحفظ');
    await loadLayout();
    await onChanged();
    return true;
  }

  async function deleteShelf(s) {
    setBusy(true);
    const { error } = await supabase.rpc('delete_shelf', { s_id: s.id });
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل الحذف: ' + error.message, 'error');
    flash('✅ تم حذف الرف');
    await loadLayout();
    await onChanged();
  }

  // ====================== الصناديق ======================
  async function addBox(s) {
    setBusy(true);
    const { error } = await supabase.rpc('add_box_to_shelf', {
      s_id: s.id, b_description: '', b_width_cm: 50, b_height_cm: 65
    });
    setBusy(false);
    if (error) return flash('فشل الإضافة: ' + error.message, 'error');
    flash('✅ تمت إضافة صندوق');
    await onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative">
        {/* Header */}
        <div className="bg-gradient-to-l from-amber-500 to-amber-600 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏗</span>
            <div>
              <h2 className="text-base font-display font-bold">منشئ المستودع</h2>
              <p className="text-[10px] opacity-90">للمؤسّس فقط — تعديل البنية الفيزيائيّة</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Status message */}
        {msg && (
          <div className={`px-5 py-2 text-xs ${msg.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
            {msg.text}
          </div>
        )}

        {/* === القسم العلوي: قائمة المستودعات (خارج سياق مستودع معيّن) === */}
        <div className="bg-stone-50 border-b border-stone-200 px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-display font-bold text-stone-700">🏢 المستودعات ({warehouses.length})</h3>
            <button onClick={() => setShowCreateForm(true)} disabled={busy}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
              + إنشاء مستودع جديد
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {warehouses.map(w => (
              <button key={w.id}
                onClick={() => setEditingWh(w.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                  w.id === editingWh
                    ? 'bg-blue-600 text-white border-blue-600 font-medium'
                    : 'bg-white border-stone-300 hover:bg-stone-100'
                }`}
              >
                {w.id === editingWh && '✏️ '}{w.name}
              </button>
            ))}
          </div>

          {/* نموذج إنشاء مستودع */}
          {showCreateForm && (
            <CreateWarehouseForm
              busy={busy}
              onCancel={() => setShowCreateForm(false)}
              onSave={handleCreateWarehouse}
            />
          )}
        </div>

        {/* === القسم الأوسط: تعديل المستودع المختار === */}
        <div className="flex-1 overflow-y-auto">
          {!layout ? (
            <p className="text-sm text-stone-500 text-center py-12">جاري التحميل...</p>
          ) : (
            <div className="p-5 space-y-4">
              {/* بطاقة معلومات المستودع */}
              <div className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <div>
                    <h4 className="text-sm font-display font-bold">{layout.warehouse?.name}</h4>
                    {layout.warehouse?.description && (
                      <p className="text-[11px] text-stone-500">{layout.warehouse.description}</p>
                    )}
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {layout.warehouse?.width_m}م × {layout.warehouse?.depth_m}م × {layout.warehouse?.height_m}م
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setShowRenameForm(true)} disabled={busy}
                      className="text-[11px] border border-stone-300 px-2 py-1 rounded hover:bg-stone-100">
                      ✏️ تعديل المعلومات
                    </button>
                    <button onClick={() => setConfirming({ type: 'warehouse' })}
                      disabled={busy || warehouses.length <= 1}
                      className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded hover:bg-red-100 disabled:opacity-30">
                      🗑 حذف
                    </button>
                  </div>
                </div>

                {showRenameForm && (
                  <RenameWarehouseForm
                    initial={layout.warehouse}
                    busy={busy}
                    onCancel={() => setShowRenameForm(false)}
                    onSave={handleRenameWarehouse}
                  />
                )}
              </div>

              {/* المعاينة الحيّة */}
              <div className="bg-white border border-stone-200 rounded-xl p-4">
                <h3 className="text-xs font-display font-bold mb-2 text-stone-700">📐 المعاينة الحيّة</h3>
                <div className="flex justify-center bg-stone-100 rounded-lg p-4">
                  <div className="relative w-72 aspect-square bg-white rounded border-2 border-dashed border-stone-300 px-3 py-7">
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-stone-400">الجدار الخلفي</div>
                    {layout.zones.map(z => {
                      const style = {
                        top:    z.pos_top    != null ? `${z.pos_top}%`    : undefined,
                        left:   z.pos_left   != null ? `${z.pos_left}%`   : undefined,
                        right:  z.pos_right  != null ? `${z.pos_right}%`  : undefined,
                        width:  z.pos_width  != null ? `${z.pos_width}%`  : undefined,
                        height: z.pos_height != null ? `${z.pos_height}%` : undefined,
                        borderColor: z.color
                      };
                      return (
                        <div key={z.id} style={style}
                          className="absolute bg-white border-2 rounded p-1 flex flex-col items-center justify-center">
                          <div className="text-base font-display font-bold leading-none" style={{ color: z.color }}>{z.letter}</div>
                          <div className="text-[7px] text-stone-500 truncate w-full text-center">{z.name}</div>
                        </div>
                      );
                    })}
                    <div className="absolute -bottom-px left-1/2 -translate-x-1/2 bg-white border border-stone-300 border-b-0 rounded-t px-2 py-0.5 text-[8px] text-stone-600">المدخل</div>
                  </div>
                </div>
              </div>

              {/* المساحات */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-display font-bold text-stone-700">📦 المساحات ({layout.zones.length})</h3>
                  <button onClick={() => setShowAddZoneForm(true)} disabled={busy}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    + مساحة جديدة
                  </button>
                </div>

                {showAddZoneForm && (
                  <AddZoneForm
                    busy={busy}
                    existingLetters={layout.zones.map(z => z.letter)}
                    onCancel={() => setShowAddZoneForm(false)}
                    onSave={handleAddZone}
                  />
                )}

                <div className="space-y-3 mt-2">
                  {layout.zones.length === 0 ? (
                    <p className="text-center text-sm text-stone-400 py-8">لا توجد مساحات بعد — أضف أوّل مساحة للبدء</p>
                  ) : (
                    layout.zones.map(z => (
                      <ZoneCard key={z.id} zone={z} busy={busy}
                        onUpdate={(patch) => updateZone(z, patch)}
                        onDelete={() => setConfirming({ type: 'zone', zone: z })}
                        onAddShelf={(values) => addShelf(z, values)}
                        onUpdateShelf={updateShelf}
                        onDeleteShelf={(s) => setConfirming({ type: 'shelf', shelf: s })}
                        onAddBox={addBox}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* مربّع تأكيد الحذف */}
        {confirming && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-xl p-5 max-w-sm w-full">
              <h4 className="text-sm font-display font-bold mb-2">تأكيد الحذف</h4>
              <p className="text-xs text-stone-600 mb-4">
                {confirming.type === 'warehouse' && `سيُحذف المستودع "${layout?.warehouse?.name}" مع كل مساحاته وأرففه وصناديقه. هذا الإجراء نهائي.`}
                {confirming.type === 'zone' && `سيُحذف ${confirming.zone.letter} - ${confirming.zone.name} مع كل أرففه وصناديقه.`}
                {confirming.type === 'shelf' && `سيُحذف الرف ${confirming.shelf.shelf_index} مع صناديقه.`}
              </p>
              <div className="flex gap-2">
                <button onClick={() => {
                  if (confirming.type === 'warehouse') deleteWarehouse();
                  else if (confirming.type === 'zone') deleteZone(confirming.zone);
                  else if (confirming.type === 'shelf') deleteShelf(confirming.shelf);
                }} disabled={busy}
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50">
                  نعم، احذف
                </button>
                <button onClick={() => setConfirming(null)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ====================== نموذج إنشاء مستودع ======================
function CreateWarehouseForm({ busy, onCancel, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [width_m, setWidthM] = useState(4);
  const [depth_m, setDepthM] = useState(4);
  const [height_m, setHeightM] = useState(2.3);
  const isValid = name.trim().length > 0;

  return (
    <div className="bg-white border-2 border-green-400 rounded-xl p-4 mt-3 animate-fade-in">
      <h4 className="text-xs font-display font-bold text-green-900 mb-3">+ مستودع جديد</h4>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الاسم *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: مستودع المدينة"
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الوصف (اختياري)</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العرض (م)</label>
          <input type="number" step="0.1" value={width_m} onChange={e => setWidthM(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العمق (م)</label>
          <input type="number" step="0.1" value={depth_m} onChange={e => setDepthM(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (م)</label>
          <input type="number" step="0.1" value={height_m} onChange={e => setHeightM(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ name, description, width_m, depth_m, height_m })}
          disabled={busy || !isValid}
          className="flex-1 bg-green-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
          💾 حفظ وإنشاء
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// ====================== نموذج تعديل المستودع ======================
function RenameWarehouseForm({ initial, busy, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const dirty = name !== (initial?.name || '') || description !== (initial?.description || '');

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mt-3 animate-fade-in">
      <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الاسم</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الوصف</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ name, description })}
          disabled={busy || !dirty || !name.trim()}
          className="flex-1 bg-brand-blue text-white py-1.5 rounded text-xs font-medium hover:bg-blue-800 disabled:opacity-50">
          💾 حفظ التعديلات
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// ====================== نموذج إضافة مساحة ======================
function AddZoneForm({ busy, existingLetters, onCancel, onSave }) {
  // اقتراح الحرف التالي
  const nextLetter = (() => {
    const used = new Set(existingLetters);
    for (let i = 65; i <= 90; i++) {
      const c = String.fromCharCode(i);
      if (!used.has(c)) return c;
    }
    return '';
  })();

  const [letter, setLetter] = useState(nextLetter);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[existingLetters.length % PRESET_COLORS.length]);
  const [width_cm, setWidth] = useState(200);
  const [height_cm, setHeight] = useState(230);
  const [depth_cm, setDepth] = useState(65);
  const [shelves_count, setShelvesCount] = useState(3);

  const isValid = letter.trim().length === 1 && name.trim().length > 0;

  return (
    <div className="bg-white border-2 border-blue-400 rounded-xl p-4 animate-fade-in">
      <h4 className="text-xs font-display font-bold text-blue-900 mb-3">+ مساحة تخزين جديدة</h4>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الحرف *</label>
          <input value={letter} onChange={e => setLetter(e.target.value.slice(0, 1).toUpperCase())} maxLength={1}
            className="w-full px-2 py-1.5 border border-stone-300 rounded font-bold text-center" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الاسم *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: مساحة الكتب"
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">اللون</label>
          <div className="flex gap-1 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded ${color === c ? 'ring-2 ring-offset-1 ring-stone-900' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العرض (سم)</label>
          <input type="number" value={width_cm} onChange={e => setWidth(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العمق (سم)</label>
          <input type="number" value={depth_cm} onChange={e => setDepth(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">عدد الأرفف</label>
          <input type="number" min="1" value={shelves_count} onChange={e => setShelvesCount(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ letter, name, color, width_cm, height_cm, depth_cm, shelves_count })}
          disabled={busy || !isValid}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
          💾 حفظ وإنشاء
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// ====================== بطاقة المساحة ======================
function ZoneCard({ zone, busy, onUpdate, onDelete, onAddShelf, onUpdateShelf, onDeleteShelf, onAddBox }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(zone.name);
  const [color, setColor] = useState(zone.color);
  const [width, setWidth] = useState(zone.width_cm);
  const [height, setHeight] = useState(zone.height_cm);
  const [depth, setDepth] = useState(zone.depth_cm);
  const [position, setPosition] = useState(null);
  const [showAddShelfForm, setShowAddShelfForm] = useState(false);

  const basicsDirty =
    name !== zone.name ||
    color !== zone.color ||
    Number(width) !== Number(zone.width_cm) ||
    Number(height) !== Number(zone.height_cm) ||
    Number(depth) !== Number(zone.depth_cm);

  function saveBasics() {
    onUpdate({
      name, color,
      width_cm: Number(width),
      height_cm: Number(height),
      depth_cm: Number(depth)
    });
  }

  function savePosition() {
    if (!position) return;
    onUpdate({
      pos_top: position.pos_top,
      pos_left: position.pos_left,
      pos_right: position.pos_right,
      pos_width: position.pos_width,
      pos_height: position.pos_height
    });
    setPosition(null);
  }

  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
      <div className="bg-stone-50 px-3 py-2 flex items-center justify-between gap-2">
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 flex-1 text-right">
          <span className="text-lg font-display font-bold" style={{ color: zone.color }}>{zone.letter}</span>
          <span className="text-xs font-medium">{zone.name}</span>
          <span className="text-[10px] text-stone-500">· {zone.shelves.length} رف · {zone.width_cm}×{zone.height_cm}سم</span>
          <span className={`text-stone-400 transition mr-auto ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </button>
        <button onClick={onDelete} disabled={busy} className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-1 rounded">
          🗑
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* البيانات الأساسية + زر حفظ */}
          <div className="bg-stone-50 rounded p-3">
            <h5 className="text-[11px] font-bold text-stone-700 mb-2">📝 المعلومات الأساسية</h5>
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div>
                <label className="block text-[10px] text-stone-600 mb-1">الاسم</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-2 py-1.5 border border-stone-300 rounded" />
              </div>
              <div>
                <label className="block text-[10px] text-stone-600 mb-1">اللون</label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded ${color === c ? 'ring-2 ring-offset-1 ring-stone-900' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-stone-600 mb-1">العرض (سم)</label>
                <input type="number" value={width} onChange={e => setWidth(e.target.value)}
                  className="w-full px-2 py-1.5 border border-stone-300 rounded" />
              </div>
              <div>
                <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
                <input type="number" value={height} onChange={e => setHeight(e.target.value)}
                  className="w-full px-2 py-1.5 border border-stone-300 rounded" />
              </div>
              <div>
                <label className="block text-[10px] text-stone-600 mb-1">العمق (سم)</label>
                <input type="number" value={depth} onChange={e => setDepth(e.target.value)}
                  className="w-full px-2 py-1.5 border border-stone-300 rounded" />
              </div>
            </div>
            <button onClick={saveBasics} disabled={busy || !basicsDirty}
              className="w-full bg-brand-blue text-white py-1.5 rounded text-xs font-medium hover:bg-blue-800 disabled:opacity-30">
              💾 حفظ المعلومات الأساسية
            </button>
          </div>

          {/* الموقع + زر حفظ */}
          <div className="bg-stone-50 rounded p-3">
            <h5 className="text-[11px] font-bold text-stone-700 mb-2">📍 الموقع على الخريطة</h5>
            <div className="flex gap-1 flex-wrap mb-2">
              {PRESET_POSITIONS.map((p, i) => (
                <button key={i} onClick={() => setPosition(p)}
                  className={`text-[10px] px-2 py-1 border rounded ${
                    position?.label === p.label
                      ? 'bg-blue-100 border-blue-400 text-blue-900'
                      : 'border-stone-300 hover:bg-white'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={savePosition} disabled={busy || !position}
              className="w-full bg-brand-blue text-white py-1.5 rounded text-xs font-medium hover:bg-blue-800 disabled:opacity-30">
              💾 حفظ الموقع
            </button>
          </div>

          {/* الأرفف */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-[11px] font-bold text-stone-700">📚 الأرفف ({zone.shelves.length})</h5>
              <button onClick={() => setShowAddShelfForm(true)} disabled={busy}
                className="text-[10px] bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200">
                + رف جديد
              </button>
            </div>

            {showAddShelfForm && (
              <AddShelfForm
                busy={busy}
                onCancel={() => setShowAddShelfForm(false)}
                onSave={async (values) => {
                  const ok = await onAddShelf(values);
                  if (ok) setShowAddShelfForm(false);
                }}
              />
            )}

            <div className="space-y-1 mt-2">
              {zone.shelves.map(s => (
                <ShelfRow key={s.id} shelf={s} busy={busy}
                  onUpdate={(patch) => onUpdateShelf(s, patch)}
                  onDelete={() => onDeleteShelf(s)}
                  onAddBox={() => onAddBox(s)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====================== نموذج إضافة رف ======================
function AddShelfForm({ busy, onCancel, onSave }) {
  const [height_cm, setHeight] = useState(70);
  const [max_boxes, setMax] = useState(4);

  return (
    <div className="bg-white border border-blue-300 rounded p-2 mb-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] text-stone-600 flex items-center gap-1">
          ارتفاع:
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-14 px-1 py-0.5 border border-stone-300 rounded text-xs" />
          سم
        </label>
        <label className="text-[10px] text-stone-600 flex items-center gap-1">
          أقصى صناديق:
          <input type="number" value={max_boxes} onChange={e => setMax(e.target.value)}
            className="w-12 px-1 py-0.5 border border-stone-300 rounded text-xs" />
        </label>
        <div className="mr-auto flex gap-1">
          <button onClick={() => onSave({ height_cm, max_boxes })} disabled={busy}
            className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
            💾 حفظ
          </button>
          <button onClick={onCancel} className="text-[10px] border border-stone-300 px-2 py-1 rounded hover:bg-stone-100">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ====================== صفّ الرف ======================
function ShelfRow({ shelf, busy, onUpdate, onDelete, onAddBox }) {
  const [maxBoxes, setMaxBoxes] = useState(shelf.max_boxes);
  const [heightCm, setHeightCm] = useState(shelf.height_cm);
  const dirty = Number(maxBoxes) !== Number(shelf.max_boxes) || Number(heightCm) !== Number(shelf.height_cm);

  return (
    <div className="bg-stone-50 border border-stone-200 rounded p-2 flex items-center gap-2 text-xs flex-wrap">
      <span className="font-bold text-stone-700">رف {shelf.shelf_index}</span>
      <label className="text-[10px] text-stone-500 flex items-center gap-1">
        ارتفاع:
        <input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)}
          className="w-14 px-1 py-0.5 border border-stone-300 rounded" />
        سم
      </label>
      <label className="text-[10px] text-stone-500 flex items-center gap-1">
        أقصى صناديق:
        <input type="number" value={maxBoxes} onChange={e => setMaxBoxes(e.target.value)}
          className="w-12 px-1 py-0.5 border border-stone-300 rounded" />
      </label>
      <button onClick={() => onUpdate({ height_cm: Number(heightCm), max_boxes: Number(maxBoxes) })}
        disabled={busy || !dirty}
        className="text-[10px] bg-brand-blue text-white px-2 py-1 rounded hover:bg-blue-800 disabled:opacity-30">
        💾 حفظ
      </button>
      <button onClick={onAddBox} disabled={busy}
        className="text-[10px] bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200">
        + صندوق
      </button>
      <button onClick={onDelete} disabled={busy}
        className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded mr-auto">
        🗑
      </button>
    </div>
  );
}
