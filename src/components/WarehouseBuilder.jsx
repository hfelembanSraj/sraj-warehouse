import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const PRESET_COLORS = ['#D85A30', '#185FA5', '#27500A', '#633806', '#7C3AED', '#0891B2', '#BE185D', '#65A30D'];
const PRESET_POSITIONS = [
  { label: 'يمين-علوي',  pos_top: 6,  pos_right: 4,  pos_left: null, pos_width: 18, pos_height: 42 },
  { label: 'يمين-سفلي',  pos_top: 52, pos_right: 4,  pos_left: null, pos_width: 18, pos_height: 42 },
  { label: 'يسار-علوي',  pos_top: 6,  pos_right: null, pos_left: 4, pos_width: 18, pos_height: 42 },
  { label: 'يسار-سفلي',  pos_top: 52, pos_right: null, pos_left: 4, pos_width: 18, pos_height: 42 },
  { label: 'وسط-علوي',   pos_top: 6,  pos_right: 41, pos_left: null, pos_width: 18, pos_height: 30 },
  { label: 'وسط-سفلي',   pos_top: 64, pos_right: 41, pos_left: null, pos_width: 18, pos_height: 30 }
];

export default function WarehouseBuilder({ onClose, onChanged }) {
  const { isFounder, warehouses, warehouseId, setWarehouseId } = useAuth();
  const [editingWh, setEditingWh] = useState(warehouseId);
  const [layout, setLayout] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(null);

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

  // ====================== إنشاء مستودع جديد ======================
  async function createWarehouse() {
    const name = prompt('اسم المستودع الجديد:');
    if (!name?.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_warehouse', {
      wh_name: name.trim(),
      wh_description: '',
      wh_width_m: 4,
      wh_depth_m: 4,
      wh_height_m: 2.3
    });
    setBusy(false);
    if (error) return flash('فشل الإنشاء: ' + error.message, 'error');
    flash('تم إنشاء المستودع');
    await onChanged();
    setEditingWh(data);
    setWarehouseId(data);
  }

  async function renameWarehouse() {
    const newName = prompt('الاسم الجديد للمستودع:', layout?.warehouse?.name || '');
    if (!newName?.trim() || newName === layout?.warehouse?.name) return;
    setBusy(true);
    const { error } = await supabase.rpc('rename_warehouse', {
      wh_id: editingWh, new_name: newName.trim(), new_description: null
    });
    setBusy(false);
    if (error) return flash('فشل التحديث: ' + error.message, 'error');
    flash('تم تحديث الاسم');
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
    flash('تم الحذف');
    const remaining = warehouses.find(w => w.id !== editingWh);
    if (remaining) {
      setWarehouseId(remaining.id);
      setEditingWh(remaining.id);
    }
    await onChanged();
  }

  // ====================== المساحات ======================
  async function addZone() {
    const letter = prompt('حرف المساحة (A، B، C…):')?.trim().toUpperCase();
    if (!letter) return;
    if (layout?.zones?.find(z => z.letter === letter)) {
      return flash('هذا الحرف موجود — اختر حرفاً آخر', 'error');
    }
    const name = prompt('اسم المساحة:', `مساحة ${letter}`)?.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.rpc('add_zone', {
      wh_id: editingWh,
      zone_letter: letter,
      zone_name: name,
      zone_color: PRESET_COLORS[(layout?.zones?.length || 0) % PRESET_COLORS.length],
      zone_width_cm: 200,
      zone_height_cm: 230,
      zone_depth_cm: 65,
      shelves_count: 3
    });
    setBusy(false);
    if (error) return flash('فشل الإضافة: ' + error.message, 'error');
    flash(`تمت إضافة مساحة ${letter}`);
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
      z_pos_left: patch.pos_left !== undefined ? patch.pos_left : z.pos_left,
      z_pos_right: patch.pos_right !== undefined ? patch.pos_right : z.pos_right,
      z_pos_width: patch.pos_width ?? null,
      z_pos_height: patch.pos_height ?? null
    });
    setBusy(false);
    if (error) return flash('فشل التحديث: ' + error.message, 'error');
    await loadLayout();
    await onChanged();
  }

  async function deleteZone(z) {
    setBusy(true);
    const { error } = await supabase.rpc('delete_zone', { z_id: z.id });
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل الحذف: ' + error.message, 'error');
    flash(`تمّ حذف مساحة ${z.letter}`);
    await loadLayout();
    await onChanged();
  }

  // ====================== الأرفف ======================
  async function addShelf(z) {
    setBusy(true);
    const { error } = await supabase.rpc('add_shelf', {
      z_id: z.id, s_height_cm: 70, s_max_boxes: 4
    });
    setBusy(false);
    if (error) return flash('فشل الإضافة: ' + error.message, 'error');
    flash('تمت إضافة رف');
    await loadLayout();
    await onChanged();
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
    if (error) return flash('فشل التحديث: ' + error.message, 'error');
    await loadLayout();
    await onChanged();
  }

  async function deleteShelf(s) {
    setBusy(true);
    const { error } = await supabase.rpc('delete_shelf', { s_id: s.id });
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل الحذف: ' + error.message, 'error');
    flash('تم حذف الرف');
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
    flash('تمت إضافة صندوق');
    await onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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

        {/* Toolbar */}
        <div className="bg-stone-50 border-b border-stone-200 px-5 py-2 flex items-center gap-2 flex-wrap">
          <select
            value={editingWh || ''}
            onChange={(e) => setEditingWh(e.target.value)}
            className="text-xs border border-stone-300 rounded-lg px-2 py-1.5 bg-white"
          >
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button onClick={createWarehouse} disabled={busy}
            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50">
            + مستودع جديد
          </button>
          <button onClick={renameWarehouse} disabled={busy}
            className="text-xs border border-stone-300 px-3 py-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-50">
            ✏️ إعادة تسمية
          </button>
          <button onClick={() => setConfirming({ type: 'warehouse' })} disabled={busy || warehouses.length <= 1}
            className="text-xs bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-30">
            🗑 حذف المستودع
          </button>
        </div>

        {/* Status message */}
        {msg && (
          <div className={`px-5 py-2 text-xs ${msg.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
            {msg.text}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {!layout ? (
            <p className="text-sm text-stone-500 text-center py-12">جاري التحميل...</p>
          ) : (
            <>
              {/* المعاينة */}
              <div className="mb-5">
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-display font-bold text-stone-700">📦 المساحات ({layout.zones.length})</h3>
                <button onClick={addZone} disabled={busy}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  + مساحة جديدة
                </button>
              </div>

              <div className="space-y-3">
                {layout.zones.length === 0 ? (
                  <p className="text-center text-sm text-stone-400 py-8">لا توجد مساحات بعد — أضف أوّل مساحة للبدء</p>
                ) : (
                  layout.zones.map(z => (
                    <ZoneCard key={z.id} zone={z} busy={busy}
                      onUpdate={(patch) => updateZone(z, patch)}
                      onDelete={() => setConfirming({ type: 'zone', zone: z })}
                      onAddShelf={() => addShelf(z)}
                      onUpdateShelf={updateShelf}
                      onDeleteShelf={(s) => setConfirming({ type: 'shelf', shelf: s })}
                      onAddBox={addBox}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Confirm dialog */}
        {confirming && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4">
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

// ====================== بطاقة المساحة ======================
function ZoneCard({ zone, busy, onUpdate, onDelete, onAddShelf, onUpdateShelf, onDeleteShelf, onAddBox }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(zone.name);
  const [color, setColor] = useState(zone.color);
  const [width, setWidth] = useState(zone.width_cm);
  const [height, setHeight] = useState(zone.height_cm);
  const [posPreset, setPosPreset] = useState('');

  function applyPreset(idx) {
    const p = PRESET_POSITIONS[idx];
    if (!p) return;
    setPosPreset(String(idx));
    onUpdate({
      pos_top: p.pos_top, pos_left: p.pos_left, pos_right: p.pos_right,
      pos_width: p.pos_width, pos_height: p.pos_height
    });
  }

  function saveBasics() {
    onUpdate({ name, color, width_cm: Number(width), height_cm: Number(height) });
  }

  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden">
      <div className="bg-stone-50 px-3 py-2 flex items-center justify-between gap-2">
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 flex-1 text-right">
          <span className="text-lg font-display font-bold" style={{ color: zone.color }}>{zone.letter}</span>
          <span className="text-xs font-medium">{zone.name}</span>
          <span className="text-[10px] text-stone-500">· {zone.shelves.length} رف · {zone.width_cm}×{zone.height_cm}سم</span>
          <span className={`text-stone-400 transition ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </button>
        <button onClick={onDelete} disabled={busy} className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-1 rounded">
          🗑
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 bg-white">
          {/* البيانات الأساسية */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[10px] text-stone-600 mb-1">الاسم</label>
              <input value={name} onChange={e => setName(e.target.value)}
                onBlur={saveBasics}
                className="w-full px-2 py-1.5 border border-stone-300 rounded" />
            </div>
            <div>
              <label className="block text-[10px] text-stone-600 mb-1">اللون</label>
              <div className="flex gap-1 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => { setColor(c); onUpdate({ color: c }); }}
                    className={`w-6 h-6 rounded ring-offset-1 ${color === c ? 'ring-2 ring-stone-900' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-stone-600 mb-1">العرض (سم)</label>
              <input type="number" value={width} onChange={e => setWidth(e.target.value)}
                onBlur={saveBasics}
                className="w-full px-2 py-1.5 border border-stone-300 rounded" />
            </div>
            <div>
              <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
              <input type="number" value={height} onChange={e => setHeight(e.target.value)}
                onBlur={saveBasics}
                className="w-full px-2 py-1.5 border border-stone-300 rounded" />
            </div>
          </div>

          {/* الموقع */}
          <div>
            <label className="block text-[10px] text-stone-600 mb-1">الموقع على الخريطة</label>
            <div className="flex gap-1 flex-wrap">
              {PRESET_POSITIONS.map((p, i) => (
                <button key={i} onClick={() => applyPreset(i)}
                  className="text-[10px] px-2 py-1 border border-stone-300 rounded hover:bg-stone-100">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* الأرفف */}
          <div className="border-t border-stone-100 pt-2">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-bold">📚 الأرفف ({zone.shelves.length})</h5>
              <button onClick={onAddShelf} disabled={busy}
                className="text-[10px] bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200">
                + رف
              </button>
            </div>
            <div className="space-y-1">
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

// ====================== صفّ الرف ======================
function ShelfRow({ shelf, busy, onUpdate, onDelete, onAddBox }) {
  const [maxBoxes, setMaxBoxes] = useState(shelf.max_boxes);
  const [heightCm, setHeightCm] = useState(shelf.height_cm);

  return (
    <div className="bg-stone-50 border border-stone-200 rounded p-2 flex items-center gap-2 text-xs">
      <span className="font-bold text-stone-700">رف {shelf.shelf_index}</span>
      <label className="text-[10px] text-stone-500 flex items-center gap-1">
        ارتفاع:
        <input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)}
          onBlur={() => onUpdate({ height_cm: Number(heightCm) })}
          className="w-14 px-1 py-0.5 border border-stone-300 rounded" />
        سم
      </label>
      <label className="text-[10px] text-stone-500 flex items-center gap-1">
        أقصى صناديق:
        <input type="number" value={maxBoxes} onChange={e => setMaxBoxes(e.target.value)}
          onBlur={() => onUpdate({ max_boxes: Number(maxBoxes) })}
          className="w-12 px-1 py-0.5 border border-stone-300 rounded" />
      </label>
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
