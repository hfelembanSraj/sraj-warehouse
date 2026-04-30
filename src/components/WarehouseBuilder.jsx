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

// المستويات: 'warehouses' → 'warehouse' → 'zone' → 'shelf'
export default function WarehouseBuilder({ onClose, onChanged }) {
  const { isFounder, warehouses, refreshWarehouses } = useAuth();
  const [nav, setNav] = useState({ level: 'warehouses', warehouse: null, zone: null, shelf: null });
  const [layout, setLayout] = useState(null); // التخطيط الكامل للمستودع المختار
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(null);

  useEffect(() => {
    if (nav.warehouse?.id) {
      loadLayout(nav.warehouse.id);
    } else {
      setLayout(null);
    }
  }, [nav.warehouse?.id]);

  async function loadLayout(whId) {
    const { data } = await supabase.rpc('get_warehouse_layout', { wh_id: whId });
    setLayout(data);
    // لو كنّا داخل مساحة أو رف، حدّث المرجع لو تغيّرت بياناته
    setNav(prev => {
      if (prev.zone) {
        const updatedZone = data?.zones?.find(z => z.id === prev.zone.id);
        if (!updatedZone) return { ...prev, level: 'warehouse', zone: null, shelf: null };
        let updatedShelf = prev.shelf;
        if (prev.shelf) {
          updatedShelf = updatedZone.shelves.find(s => s.id === prev.shelf.id);
          if (!updatedShelf) return { ...prev, level: 'zone', zone: updatedZone, shelf: null };
        }
        return { ...prev, zone: updatedZone, shelf: updatedShelf };
      }
      return prev;
    });
  }

  function flash(text, kind = 'success') {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 3500);
  }

  if (!isFounder) return null;

  // ========================================================
  // العمليات
  // ========================================================
  async function rpc(fn, args, successText) {
    setBusy(true);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { flash('فشل: ' + error.message, 'error'); return null; }
    if (successText) flash(successText);
    return data;
  }

  async function handleCreateWarehouse(values) {
    const id = await rpc('create_warehouse', {
      wh_name: values.name.trim(),
      wh_description: values.description?.trim() || '',
      wh_width_m: Number(values.width_m) || 4,
      wh_depth_m: Number(values.depth_m) || 4,
      wh_height_m: Number(values.height_m) || 2.3
    }, `✅ تم إنشاء "${values.name}"`);
    if (!id) return false;
    await refreshWarehouses();
    await onChanged();
    return true;
  }

  async function handleRenameWarehouse(wh, values) {
    const ok = await rpc('rename_warehouse', {
      wh_id: wh.id,
      new_name: values.name.trim(),
      new_description: values.description?.trim() || null
    }, '✅ تم الحفظ');
    if (ok === null) return false;
    await refreshWarehouses();
    await onChanged();
    return true;
  }

  async function handleDeleteWarehouse(wh) {
    if (warehouses.length <= 1) { flash('لا يمكن حذف آخر مستودع', 'error'); setConfirming(null); return; }
    const ok = await rpc('delete_warehouse', { wh_id: wh.id }, '✅ تم الحذف');
    setConfirming(null);
    if (ok === null) return;
    await refreshWarehouses();
    await onChanged();
    if (nav.warehouse?.id === wh.id) {
      setNav({ level: 'warehouses', warehouse: null, zone: null, shelf: null });
    }
  }

  async function handleAddZone(values) {
    const ok = await rpc('add_zone', {
      wh_id: nav.warehouse.id,
      zone_letter: values.letter.toUpperCase(),
      zone_name: values.name.trim(),
      zone_color: values.color,
      zone_width_cm: Number(values.width_cm) || 200,
      zone_height_cm: Number(values.height_cm) || 230,
      zone_depth_cm: Number(values.depth_cm) || 65,
      shelves_count: Number(values.shelves_count) || 3
    }, `✅ تمت إضافة مساحة ${values.letter.toUpperCase()}`);
    if (ok === null) return false;
    await loadLayout(nav.warehouse.id);
    await onChanged();
    return true;
  }

  async function handleUpdateZone(z, patch) {
    const ok = await rpc('update_zone', {
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
    }, '✅ تم الحفظ');
    if (ok === null) return false;
    await loadLayout(nav.warehouse.id);
    await onChanged();
    return true;
  }

  async function handleDeleteZone(z) {
    const ok = await rpc('delete_zone', { z_id: z.id }, `✅ تم حذف ${z.letter}`);
    setConfirming(null);
    if (ok === null) return;
    if (nav.zone?.id === z.id) {
      setNav(prev => ({ ...prev, level: 'warehouse', zone: null, shelf: null }));
    }
    await loadLayout(nav.warehouse.id);
    await onChanged();
  }

  async function handleAddShelf(values) {
    const ok = await rpc('add_shelf', {
      z_id: nav.zone.id,
      s_height_cm: Number(values.height_cm) || 70,
      s_max_boxes: Number(values.max_boxes) || 4
    }, '✅ تمت إضافة الرف');
    if (ok === null) return false;
    await loadLayout(nav.warehouse.id);
    await onChanged();
    return true;
  }

  async function handleUpdateShelf(s, patch) {
    const ok = await rpc('update_shelf', {
      s_id: s.id,
      s_height_cm: patch.height_cm ?? null,
      s_max_boxes: patch.max_boxes ?? null,
      s_label: patch.label ?? null
    }, '✅ تم الحفظ');
    if (ok === null) return false;
    await loadLayout(nav.warehouse.id);
    await onChanged();
    return true;
  }

  async function handleDeleteShelf(s) {
    const ok = await rpc('delete_shelf', { s_id: s.id }, '✅ تم حذف الرف');
    setConfirming(null);
    if (ok === null) return;
    if (nav.shelf?.id === s.id) {
      setNav(prev => ({ ...prev, level: 'zone', shelf: null }));
    }
    await loadLayout(nav.warehouse.id);
    await onChanged();
  }

  async function handleAddBox(values) {
    const ok = await rpc('add_box_to_shelf', {
      s_id: nav.shelf.id,
      b_description: values.description?.trim() || '',
      b_width_cm: Number(values.width_cm) || 50,
      b_height_cm: Number(values.height_cm) || 65
    }, '✅ تمت إضافة الصندوق');
    if (ok === null) return false;
    await loadLayout(nav.warehouse.id);
    await onChanged();
    return true;
  }

  async function handleUpdateBox(box, patch) {
    setBusy(true);
    const { error } = await supabase.from('boxes').update({
      description: patch.description ?? box.description,
      width_cm: patch.width_cm ?? box.width_cm,
      height_cm: patch.height_cm ?? box.height_cm
    }).eq('id', box.id);
    setBusy(false);
    if (error) { flash('فشل الحفظ: ' + error.message, 'error'); return false; }
    flash('✅ تم الحفظ');
    await loadLayout(nav.warehouse.id);
    await onChanged();
    return true;
  }

  async function handleDeleteBox(box) {
    setBusy(true);
    const { error } = await supabase.from('boxes').delete().eq('id', box.id);
    setBusy(false);
    setConfirming(null);
    if (error) { flash('فشل الحذف: ' + error.message, 'error'); return; }
    flash('✅ تم حذف الصندوق');
    await loadLayout(nav.warehouse.id);
    await onChanged();
  }

  // ========================================================
  // التنقّل
  // ========================================================
  function goWarehouses() { setNav({ level: 'warehouses', warehouse: null, zone: null, shelf: null }); }
  function goWarehouse(w) { setNav({ level: 'warehouse', warehouse: w, zone: null, shelf: null }); }
  function goZone(z)      { setNav(prev => ({ ...prev, level: 'zone', zone: z, shelf: null })); }
  function goShelf(s)     { setNav(prev => ({ ...prev, level: 'shelf', shelf: s })); }
  function goBack() {
    if (nav.level === 'shelf')         setNav(prev => ({ ...prev, level: 'zone', shelf: null }));
    else if (nav.level === 'zone')     setNav(prev => ({ ...prev, level: 'warehouse', zone: null }));
    else if (nav.level === 'warehouse') goWarehouses();
  }

  // ========================================================
  // الواجهة
  // ========================================================
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col relative">
        {/* Header */}
        <div className="bg-gradient-to-l from-amber-500 to-amber-600 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏗</span>
            <div>
              <h2 className="text-base font-display font-bold">منشئ المستودع</h2>
              <p className="text-[10px] opacity-90">للمؤسّس فقط</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Breadcrumb */}
        <Breadcrumb nav={nav} onGoWarehouses={goWarehouses} onGoWarehouse={() => goWarehouse(nav.warehouse)} onGoZone={() => goZone(nav.zone)} />

        {/* Status message */}
        {msg && (
          <div className={`px-5 py-2 text-xs ${msg.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
            {msg.text}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-stone-50">
          {nav.level === 'warehouses' && (
            <ViewWarehouses
              warehouses={warehouses}
              busy={busy}
              onOpen={goWarehouse}
              onCreate={handleCreateWarehouse}
              onRename={handleRenameWarehouse}
              onDelete={(w) => setConfirming({ type: 'warehouse', warehouse: w })}
            />
          )}

          {nav.level === 'warehouse' && nav.warehouse && layout && (
            <ViewWarehouse
              layout={layout}
              busy={busy}
              onOpenZone={goZone}
              onAddZone={handleAddZone}
              onUpdateZone={handleUpdateZone}
              onDeleteZone={(z) => setConfirming({ type: 'zone', zone: z })}
            />
          )}

          {nav.level === 'zone' && nav.zone && (
            <ViewZone
              zone={nav.zone}
              busy={busy}
              onOpenShelf={goShelf}
              onAddShelf={handleAddShelf}
              onUpdateShelf={handleUpdateShelf}
              onDeleteShelf={(s) => setConfirming({ type: 'shelf', shelf: s })}
            />
          )}

          {nav.level === 'shelf' && nav.shelf && (
            <ViewShelf
              shelf={nav.shelf}
              boxes={layout?.boxes_by_shelf?.[nav.shelf.id] || []}
              allBoxesInLayout={null}
              busy={busy}
              warehouseId={nav.warehouse.id}
              shelfId={nav.shelf.id}
              onAddBox={handleAddBox}
              onUpdateBox={handleUpdateBox}
              onDeleteBox={(b) => setConfirming({ type: 'box', box: b })}
            />
          )}
        </div>

        {/* مربع التأكيد */}
        {confirming && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-xl p-5 max-w-sm w-full">
              <h4 className="text-sm font-display font-bold mb-2">تأكيد الحذف</h4>
              <p className="text-xs text-stone-600 mb-4">
                {confirming.type === 'warehouse' && `سيُحذف المستودع "${confirming.warehouse.name}" مع كل ما فيه. هذا الإجراء نهائي.`}
                {confirming.type === 'zone' && `سيُحذف ${confirming.zone.letter} - ${confirming.zone.name} مع أرففه وصناديقه.`}
                {confirming.type === 'shelf' && `سيُحذف الرف ${confirming.shelf.shelf_index} مع صناديقه.`}
                {confirming.type === 'box' && `سيُحذف الصندوق ${confirming.box.code}.`}
              </p>
              <div className="flex gap-2">
                <button onClick={() => {
                  if (confirming.type === 'warehouse') handleDeleteWarehouse(confirming.warehouse);
                  else if (confirming.type === 'zone') handleDeleteZone(confirming.zone);
                  else if (confirming.type === 'shelf') handleDeleteShelf(confirming.shelf);
                  else if (confirming.type === 'box') handleDeleteBox(confirming.box);
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

// ========================================================
// شريط التنقّل (Breadcrumb)
// ========================================================
function Breadcrumb({ nav, onGoWarehouses, onGoWarehouse, onGoZone }) {
  return (
    <div className="bg-white border-b border-stone-200 px-5 py-2 flex items-center gap-1.5 text-xs flex-wrap">
      <button onClick={onGoWarehouses}
        className={`hover:bg-stone-100 px-2 py-1 rounded transition flex items-center gap-1 ${nav.level === 'warehouses' ? 'font-bold text-blue-700' : 'text-stone-600'}`}>
        🏢 المستودعات
      </button>
      {nav.warehouse && (
        <>
          <span className="text-stone-300">‹</span>
          <button onClick={onGoWarehouse}
            className={`hover:bg-stone-100 px-2 py-1 rounded transition flex items-center gap-1 ${nav.level === 'warehouse' ? 'font-bold text-blue-700' : 'text-stone-600'}`}>
            📦 {nav.warehouse.name}
          </button>
        </>
      )}
      {nav.zone && (
        <>
          <span className="text-stone-300">‹</span>
          <button onClick={onGoZone}
            className={`hover:bg-stone-100 px-2 py-1 rounded transition flex items-center gap-1 ${nav.level === 'zone' ? 'font-bold text-blue-700' : 'text-stone-600'}`}
            style={{ color: nav.level !== 'zone' ? nav.zone.color : undefined }}>
            📍 {nav.zone.letter} — {nav.zone.name}
          </button>
        </>
      )}
      {nav.shelf && (
        <>
          <span className="text-stone-300">‹</span>
          <span className="px-2 py-1 font-bold text-blue-700">📚 رف {nav.shelf.shelf_index}</span>
        </>
      )}
    </div>
  );
}

// ========================================================
// Level 1: قائمة المستودعات
// ========================================================
function ViewWarehouses({ warehouses, busy, onOpen, onCreate, onRename, onDelete }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-bold text-stone-800">جميع المستودعات ({warehouses.length})</h3>
        <button onClick={() => setShowCreate(s => !s)} disabled={busy}
          className="text-xs bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
          + إنشاء مستودع جديد
        </button>
      </div>

      {showCreate && (
        <CreateWarehouseForm
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSave={async (values) => {
            const ok = await onCreate(values);
            if (ok) setShowCreate(false);
          }}
        />
      )}

      <div className="space-y-2">
        {warehouses.map(wh => (
          <div key={wh.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-2">
              <button onClick={() => onOpen(wh)} className="flex-1 text-right hover:bg-stone-50 -m-4 p-4 rounded-xl transition">
                <h4 className="text-sm font-display font-bold flex items-center gap-2">
                  📦 {wh.name}
                  <span className="text-stone-300 mr-auto group-hover:text-stone-600">→</span>
                </h4>
                {wh.description && <p className="text-[11px] text-stone-500 mt-0.5">{wh.description}</p>}
                <p className="text-[10px] text-stone-400 mt-1">
                  {wh.width_m}م × {wh.depth_m}م × {wh.height_m}م · اضغط للدخول والتعديل
                </p>
              </button>
              <div className="flex gap-1">
                <button onClick={() => setEditingId(editingId === wh.id ? null : wh.id)} disabled={busy}
                  className="text-[11px] border border-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100">
                  ✏️
                </button>
                <button onClick={() => onDelete(wh)}
                  disabled={busy || warehouses.length <= 1}
                  className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100 disabled:opacity-30">
                  🗑
                </button>
              </div>
            </div>
            {editingId === wh.id && (
              <div className="px-4 pb-4 border-t border-stone-100 bg-stone-50">
                <RenameWarehouseForm
                  initial={wh}
                  busy={busy}
                  onCancel={() => setEditingId(null)}
                  onSave={async (values) => {
                    const ok = await onRename(wh, values);
                    if (ok) setEditingId(null);
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================================
// Level 2: داخل مستودع — قائمة المساحات
// ========================================================
function ViewWarehouse({ layout, busy, onOpenZone, onAddZone, onUpdateZone, onDeleteZone }) {
  const [showAddZone, setShowAddZone] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState(null);

  return (
    <div className="p-5 space-y-3">
      {/* خريطة معاينة */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="text-xs font-display font-bold mb-2 text-stone-700">📐 المعاينة الحيّة</h3>
        <div className="flex justify-center bg-stone-100 rounded-lg p-3">
          <div className="relative w-64 aspect-square bg-white rounded border-2 border-dashed border-stone-300 px-3 py-7">
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

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-bold text-stone-800">مساحات التخزين ({layout.zones.length})</h3>
        <button onClick={() => setShowAddZone(s => !s)} disabled={busy}
          className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          + إضافة مساحة جديدة
        </button>
      </div>

      {showAddZone && (
        <AddZoneForm
          busy={busy}
          existingLetters={layout.zones.map(z => z.letter)}
          onCancel={() => setShowAddZone(false)}
          onSave={async (values) => {
            const ok = await onAddZone(values);
            if (ok) setShowAddZone(false);
          }}
        />
      )}

      <div className="space-y-2">
        {layout.zones.length === 0 ? (
          <p className="text-center text-sm text-stone-400 py-12">لا توجد مساحات بعد — أضف أوّل مساحة للبدء</p>
        ) : (
          layout.zones.map(z => (
            <div key={z.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-2">
                <button onClick={() => onOpenZone(z)} className="flex-1 text-right hover:bg-stone-50 -m-4 p-4 rounded-xl transition flex items-center gap-3">
                  <span className="text-2xl font-display font-bold leading-none" style={{ color: z.color }}>{z.letter}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-display font-bold truncate">{z.name}</h4>
                    <p className="text-[10px] text-stone-500 mt-0.5">
                      {z.width_cm}×{z.height_cm}×{z.depth_cm}سم · {z.shelves.length} رف
                    </p>
                  </div>
                  <span className="text-stone-300">→</span>
                </button>
                <div className="flex gap-1">
                  <button onClick={() => setEditingZoneId(editingZoneId === z.id ? null : z.id)} disabled={busy}
                    className="text-[11px] border border-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100">
                    ✏️
                  </button>
                  <button onClick={() => onDeleteZone(z)} disabled={busy}
                    className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100">
                    🗑
                  </button>
                </div>
              </div>
              {editingZoneId === z.id && (
                <div className="px-4 pb-4 border-t border-stone-100 bg-stone-50 pt-3">
                  <ZoneEditForm
                    zone={z}
                    busy={busy}
                    onCancel={() => setEditingZoneId(null)}
                    onSave={async (patch) => {
                      const ok = await onUpdateZone(z, patch);
                      if (ok) setEditingZoneId(null);
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ========================================================
// Level 3: داخل مساحة — قائمة الأرفف
// ========================================================
function ViewZone({ zone, busy, onOpenShelf, onAddShelf, onUpdateShelf, onDeleteShelf }) {
  const [showAddShelf, setShowAddShelf] = useState(false);
  const [editingShelfId, setEditingShelfId] = useState(null);

  return (
    <div className="p-5 space-y-3">
      <div className="bg-white border-2 rounded-xl p-4" style={{ borderColor: zone.color }}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl font-display font-bold leading-none" style={{ color: zone.color }}>{zone.letter}</span>
          <div>
            <h4 className="text-sm font-display font-bold">{zone.name}</h4>
            <p className="text-[11px] text-stone-500">{zone.width_cm}×{zone.height_cm}×{zone.depth_cm}سم</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-bold text-stone-800">الأرفف ({zone.shelves.length})</h3>
        <button onClick={() => setShowAddShelf(s => !s)} disabled={busy}
          className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          + إضافة رف جديد
        </button>
      </div>

      {showAddShelf && (
        <AddShelfForm
          busy={busy}
          onCancel={() => setShowAddShelf(false)}
          onSave={async (values) => {
            const ok = await onAddShelf(values);
            if (ok) setShowAddShelf(false);
          }}
        />
      )}

      <div className="space-y-2">
        {zone.shelves.length === 0 ? (
          <p className="text-center text-sm text-stone-400 py-12">لا توجد أرفف — أضف أوّل رف</p>
        ) : (
          zone.shelves.map(s => (
            <div key={s.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-2">
                <button onClick={() => onOpenShelf(s)} className="flex-1 text-right hover:bg-stone-50 -m-4 p-4 rounded-xl transition flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">📚</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-display font-bold truncate">رف {s.shelf_index}{s.label ? ` — ${s.label}` : ''}</h4>
                    <p className="text-[10px] text-stone-500 mt-0.5">
                      ارتفاع {s.height_cm}سم · يسع {s.max_boxes} صناديق
                    </p>
                  </div>
                  <span className="text-stone-300">→</span>
                </button>
                <div className="flex gap-1">
                  <button onClick={() => setEditingShelfId(editingShelfId === s.id ? null : s.id)} disabled={busy}
                    className="text-[11px] border border-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100">
                    ✏️
                  </button>
                  <button onClick={() => onDeleteShelf(s)} disabled={busy}
                    className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100">
                    🗑
                  </button>
                </div>
              </div>
              {editingShelfId === s.id && (
                <div className="px-4 pb-4 border-t border-stone-100 bg-stone-50 pt-3">
                  <ShelfEditForm
                    shelf={s}
                    busy={busy}
                    onCancel={() => setEditingShelfId(null)}
                    onSave={async (patch) => {
                      const ok = await onUpdateShelf(s, patch);
                      if (ok) setEditingShelfId(null);
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ========================================================
// Level 4: داخل رف — قائمة الصناديق
// ========================================================
function ViewShelf({ shelf, busy, warehouseId, shelfId, onAddBox, onUpdateBox, onDeleteBox }) {
  const [boxes, setBoxes] = useState([]);
  const [showAddBox, setShowAddBox] = useState(false);
  const [editingBoxId, setEditingBoxId] = useState(null);
  const [loadingBoxes, setLoadingBoxes] = useState(true);

  useEffect(() => {
    loadBoxes();
  }, [shelfId, warehouseId]);

  async function loadBoxes() {
    setLoadingBoxes(true);
    const { data } = await supabase
      .from('boxes')
      .select('*, items(*)')
      .eq('shelf_id', shelfId)
      .order('box_index');
    setBoxes(data || []);
    setLoadingBoxes(false);
  }

  const canAddMore = boxes.length < shelf.max_boxes;

  return (
    <div className="p-5 space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-sm font-display font-bold flex items-center gap-2">
          📚 رف {shelf.shelf_index}{shelf.label ? ` — ${shelf.label}` : ''}
        </h4>
        <p className="text-[11px] text-stone-600 mt-1">
          ارتفاع {shelf.height_cm}سم · يسع {shelf.max_boxes} صناديق · يحتوي حالياً {boxes.length}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-bold text-stone-800">الصناديق ({boxes.length}/{shelf.max_boxes})</h3>
        <button
          onClick={() => setShowAddBox(s => !s)}
          disabled={busy || !canAddMore}
          title={!canAddMore ? 'الرف ممتلئ — زد الحدّ الأقصى أو احذف صندوقاً' : ''}
          className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-30 font-medium">
          + إضافة صندوق
        </button>
      </div>

      {showAddBox && (
        <AddBoxForm
          busy={busy}
          onCancel={() => setShowAddBox(false)}
          onSave={async (values) => {
            const ok = await onAddBox(values);
            if (ok) {
              setShowAddBox(false);
              await loadBoxes();
            }
          }}
        />
      )}

      <div className="space-y-2">
        {loadingBoxes ? (
          <p className="text-center text-sm text-stone-400 py-12">جاري التحميل...</p>
        ) : boxes.length === 0 ? (
          <p className="text-center text-sm text-stone-400 py-12">لا توجد صناديق — أضف أوّل صندوق</p>
        ) : (
          boxes.map(b => (
            <div key={b.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-2">
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">📦</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-display font-bold">{b.code}</h4>
                    {b.description && <p className="text-[11px] text-stone-500 truncate">{b.description}</p>}
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {b.width_cm}×{b.height_cm}سم · {(b.items || []).length} صنف
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditingBoxId(editingBoxId === b.id ? null : b.id)} disabled={busy}
                    className="text-[11px] border border-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100">
                    ✏️
                  </button>
                  <button onClick={() => onDeleteBox(b)} disabled={busy}
                    className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100">
                    🗑
                  </button>
                </div>
              </div>
              {editingBoxId === b.id && (
                <div className="px-4 pb-4 border-t border-stone-100 bg-stone-50 pt-3">
                  <BoxEditForm
                    box={b}
                    busy={busy}
                    onCancel={() => setEditingBoxId(null)}
                    onSave={async (patch) => {
                      const ok = await onUpdateBox(b, patch);
                      if (ok) {
                        setEditingBoxId(null);
                        await loadBoxes();
                      }
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ========================================================
// النماذج (Forms)
// ========================================================

function CreateWarehouseForm({ busy, onCancel, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [width_m, setWidthM] = useState(4);
  const [depth_m, setDepthM] = useState(4);
  const [height_m, setHeightM] = useState(2.3);
  const isValid = name.trim().length > 0;

  return (
    <div className="bg-white border-2 border-green-400 rounded-xl p-4 animate-fade-in">
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

function RenameWarehouseForm({ initial, busy, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const dirty = name !== (initial?.name || '') || description !== (initial?.description || '');

  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-2 mb-2">
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

function AddZoneForm({ busy, existingLetters, onCancel, onSave }) {
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

function ZoneEditForm({ zone, busy, onCancel, onSave }) {
  const [name, setName] = useState(zone.name);
  const [color, setColor] = useState(zone.color);
  const [width_cm, setWidth] = useState(zone.width_cm);
  const [height_cm, setHeight] = useState(zone.height_cm);
  const [depth_cm, setDepth] = useState(zone.depth_cm);
  const [position, setPosition] = useState(null);

  const dirty =
    name !== zone.name ||
    color !== zone.color ||
    Number(width_cm) !== Number(zone.width_cm) ||
    Number(height_cm) !== Number(zone.height_cm) ||
    Number(depth_cm) !== Number(zone.depth_cm) ||
    position !== null;

  function buildPatch() {
    const patch = {
      name, color,
      width_cm: Number(width_cm),
      height_cm: Number(height_cm),
      depth_cm: Number(depth_cm)
    };
    if (position) {
      patch.pos_top = position.pos_top;
      patch.pos_left = position.pos_left;
      patch.pos_right = position.pos_right;
      patch.pos_width = position.pos_width;
      patch.pos_height = position.pos_height;
    }
    return patch;
  }

  return (
    <div className="text-xs space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الاسم</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
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
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الموقع على خريطة المستودع</label>
          <div className="flex gap-1 flex-wrap">
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
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave(buildPatch())} disabled={busy || !dirty}
          className="flex-1 bg-brand-blue text-white py-1.5 rounded text-xs font-medium hover:bg-blue-800 disabled:opacity-30">
          💾 حفظ التعديلات
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

function AddShelfForm({ busy, onCancel, onSave }) {
  const [height_cm, setHeight] = useState(70);
  const [max_boxes, setMax] = useState(4);
  const [label, setLabel] = useState('');

  return (
    <div className="bg-white border-2 border-blue-400 rounded-xl p-4 animate-fade-in">
      <h4 className="text-xs font-display font-bold text-blue-900 mb-3">+ رف جديد</h4>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">اسم/تسمية الرف (اختياري)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="مثال: الرف العلوي"
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">أقصى عدد صناديق</label>
          <input type="number" min="1" value={max_boxes} onChange={e => setMax(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ height_cm, max_boxes, label })} disabled={busy}
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

function ShelfEditForm({ shelf, busy, onCancel, onSave }) {
  const [height_cm, setHeight] = useState(shelf.height_cm);
  const [max_boxes, setMax] = useState(shelf.max_boxes);
  const [label, setLabel] = useState(shelf.label || '');
  const dirty =
    Number(height_cm) !== Number(shelf.height_cm) ||
    Number(max_boxes) !== Number(shelf.max_boxes) ||
    label !== (shelf.label || '');

  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">اسم الرف (اختياري)</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">أقصى صناديق</label>
          <input type="number" value={max_boxes} onChange={e => setMax(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ height_cm: Number(height_cm), max_boxes: Number(max_boxes), label })} disabled={busy || !dirty}
          className="flex-1 bg-brand-blue text-white py-1.5 rounded text-xs font-medium hover:bg-blue-800 disabled:opacity-30">
          💾 حفظ التعديلات
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

function AddBoxForm({ busy, onCancel, onSave }) {
  const [description, setDescription] = useState('');
  const [width_cm, setWidth] = useState(50);
  const [height_cm, setHeight] = useState(65);

  return (
    <div className="bg-white border-2 border-blue-400 rounded-xl p-4 animate-fade-in">
      <h4 className="text-xs font-display font-bold text-blue-900 mb-3">+ صندوق جديد</h4>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الوصف (اختياري)</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            placeholder="مثال: حبال وأدوات تحكيم"
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
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
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ description, width_cm, height_cm })} disabled={busy}
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

function BoxEditForm({ box, busy, onCancel, onSave }) {
  const [description, setDescription] = useState(box.description || '');
  const [width_cm, setWidth] = useState(box.width_cm || 50);
  const [height_cm, setHeight] = useState(box.height_cm || 65);

  const dirty =
    description !== (box.description || '') ||
    Number(width_cm) !== Number(box.width_cm || 50) ||
    Number(height_cm) !== Number(box.height_cm || 65);

  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الوصف</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
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
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ description, width_cm: Number(width_cm), height_cm: Number(height_cm) })}
          disabled={busy || !dirty}
          className="flex-1 bg-brand-blue text-white py-1.5 rounded text-xs font-medium hover:bg-blue-800 disabled:opacity-30">
          💾 حفظ التعديلات
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}
