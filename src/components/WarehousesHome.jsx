import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { CreateWarehouseForm, EditWarehouseForm, ConfirmDelete, StatusToast, FormModal, useFlash } from './BuilderForms';
import { rpcCreateWarehouse, rpcRenameWarehouse, rpcDeleteWarehouse, fetchWarehouseLayout, rpcAddZone } from '../lib/warehouseOps';

const VIEW_MODE_KEY = 'sraj.warehousesViewMode';

export default function WarehousesHome({ onEnterWarehouse, onRefresh }) {
  const { warehouses, isFounder } = useAuth();
  const [stats, setStats] = useState({});
  const [layouts, setLayouts] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();
  const [viewMode, setViewMode] = useState(() => localStorage.getItem(VIEW_MODE_KEY) || 'grid'); // grid | pages

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    loadStatsAndLayouts();
  }, [warehouses.length, viewMode]);

  async function loadStatsAndLayouts() {
    const statsResult = {};
    const layoutsResult = {};
    await Promise.all(warehouses.map(async (wh) => {
      // نُطابق فلترة Dashboard.loadAllData تماماً ليتطابق العدّ بين الواجهتين
      const [zonesR, boxesR, itemsAssignedR, itemsUnassignedR] = await Promise.all([
        supabase.from('zones').select('id', { count: 'exact', head: true })
          .eq('warehouse_id', wh.id).is('deleted_at', null),
        supabase.from('boxes').select('id', { count: 'exact', head: true })
          .eq('warehouse_id', wh.id).is('deleted_at', null).not('shelf_id', 'is', null),
        supabase.from('items').select('id, quantity, boxes!inner(warehouse_id, deleted_at, shelf_id)')
          .eq('boxes.warehouse_id', wh.id)
          .is('deleted_at', null).is('boxes.deleted_at', null).not('boxes.shelf_id', 'is', null),
        supabase.from('items').select('id, quantity, zones!inner(warehouse_id)')
          .eq('zones.warehouse_id', wh.id)
          .is('box_id', null).is('deleted_at', null)
      ]);
      const allItems = [...(itemsAssignedR.data || []), ...(itemsUnassignedR.data || [])];
      const totalQty = allItems.reduce((s, it) => s + (it.quantity || 0), 0);
      statsResult[wh.id] = {
        zones: zonesR.count || 0,
        boxes: boxesR.count || 0,
        items: allItems.length,   // عدد الأصناف (يطابق ما بداخل المستودع)
        pieces: totalQty           // مجموع القطع (تفصيل اختياري)
      };

      // وضع "صفحات": نحتاج التخطيط الكامل لرسم المعاينة
      if (viewMode === 'pages') {
        const { data: layout } = await fetchWarehouseLayout(wh.id);
        layoutsResult[wh.id] = layout;
      }
    }));
    setStats(statsResult);
    setLayouts(layoutsResult);
  }

  async function handleCreate(values) {
    setBusy(true);
    const { data: newWhId, error } = await rpcCreateWarehouse(values);
    if (error) {
      setBusy(false);
      return flash('فشل: ' + error.message, 'error');
    }

    // إن اختار المستخدم قالب "بمدرج تخزين"، أنشئ المساحات الأربع تلقائياً
    if (values.template === 'stairway' && newWhId) {
      const stairwayZones = [
        // الدرج السفلي (يمين الوسط، يسار الوسط) — مساحة عادية بـ2 رفّ
        { letter: 'A', name: 'درج سفلي · يمين', color: '#F58220', shelves_count: 2,
          pos: { pos_top: 52, pos_left: 22, pos_right: null, pos_width: 18, pos_height: 42 } },
        { letter: 'B', name: 'درج سفلي · يسار', color: '#FFCC00', shelves_count: 2,
          pos: { pos_top: 52, pos_left: 4,  pos_right: null, pos_width: 18, pos_height: 42 } },
        // الدرج العلوي (يمين، يسار) — مساحة مضاعفة بـ4 أرفف (التخزين يمتدّ للأرض)
        { letter: 'C', name: 'درج علوي · يمين', color: '#7B2D8E', shelves_count: 4,
          pos: { pos_top: 6,  pos_left: 22, pos_right: null, pos_width: 18, pos_height: 42 } },
        { letter: 'D', name: 'درج علوي · يسار', color: '#E91E8B', shelves_count: 4,
          pos: { pos_top: 6,  pos_left: 4,  pos_right: null, pos_width: 18, pos_height: 42 } }
      ];

      for (const z of stairwayZones) {
        const { data: zoneId, error: zErr } = await rpcAddZone(newWhId, {
          letter: z.letter,
          name: z.name,
          color: z.color,
          width_cm: 100, height_cm: 230, depth_cm: 65,
          shelves_count: z.shelves_count
        });
        if (zErr) {
          setBusy(false);
          return flash('فشل إنشاء مساحة: ' + zErr.message, 'error');
        }
        // اضبط الموقع المخصّص بعد الإنشاء (رمز الإنشاء يستخدم مواقع افتراضيّة)
        await supabase.rpc('update_zone', {
          z_id: zoneId,
          z_name: null, z_color: null,
          z_width_cm: null, z_height_cm: null, z_depth_cm: null,
          z_pos_top: z.pos.pos_top,
          z_pos_left: z.pos.pos_left,
          z_pos_right: z.pos.pos_right,
          z_pos_width: z.pos.pos_width,
          z_pos_height: z.pos.pos_height
        });
      }
    }

    setBusy(false);
    flash(`✅ تم إنشاء "${values.name}"${values.template === 'stairway' ? ' مع مساحات المدرج' : ''}`);
    setShowCreate(false);
    await onRefresh();
    await loadStatsAndLayouts();
  }

  async function handleRename(wh, values) {
    setBusy(true);
    const { error } = await rpcRenameWarehouse(wh.id, values);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditingId(null);
    await onRefresh();
  }

  async function handleDelete() {
    if (warehouses.length <= 1) {
      flash('لا يمكن حذف آخر مستودع', 'error');
      setConfirming(null);
      return;
    }
    setBusy(true);
    const { error } = await rpcDeleteWarehouse(confirming.warehouse.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحذف');
    await onRefresh();
    await loadStatsAndLayouts();
  }

  if (!isFounder) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-sm text-stone-500">
        هذه الصفحة للمؤسّس فقط.
      </div>
    );
  }

  return (
    <>
      <StatusToast msg={msg} />

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-display font-bold">🏢 جميع المستودعات ({warehouses.length})</h2>
          <p className="text-xs text-stone-500 mt-0.5">اضغط على مستودع للدخول وإدارته</p>
        </div>
        <div className="flex items-center gap-2">
          {/* مبدّل وضع العرض */}
          <div className="bg-stone-100 rounded-lg p-0.5 flex">
            <button
              onClick={() => setViewMode('grid')}
              className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'grid' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}
              title="عرض شبكي"
            >
              ▦ شبكة
            </button>
            <button
              onClick={() => setViewMode('pages')}
              className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'pages' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}
              title="عرض صفحات بصور مصغّرة"
            >
              📑 صفحات
            </button>
          </div>
          <button onClick={() => setShowCreate(s => !s)} disabled={busy}
            className="text-xs bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
            + إنشاء مستودع جديد
          </button>
        </div>
      </div>

      {showCreate && (
        <FormModal
          title="🏢 إنشاء مستودع جديد"
          onClose={() => setShowCreate(false)}
          maxWidth="max-w-lg"
        >
          <CreateWarehouseForm
            busy={busy}
            onCancel={() => setShowCreate(false)}
            onSave={handleCreate}
          />
        </FormModal>
      )}

      {viewMode === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {warehouses.map(wh => (
            <GridCard
              key={wh.id} wh={wh} stats={stats[wh.id] || {}}
              busy={busy} editingId={editingId} totalCount={warehouses.length}
              onEnter={() => onEnterWarehouse(wh.id)}
              onToggleEdit={() => setEditingId(editingId === wh.id ? null : wh.id)}
              onCancelEdit={() => setEditingId(null)}
              onRename={(values) => handleRename(wh, values)}
              onDelete={() => setConfirming({ warehouse: wh })}
            />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {warehouses.map(wh => (
            <PageCard
              key={wh.id} wh={wh} stats={stats[wh.id] || {}} layout={layouts[wh.id]}
              busy={busy} editingId={editingId} totalCount={warehouses.length}
              onEnter={() => onEnterWarehouse(wh.id)}
              onToggleEdit={() => setEditingId(editingId === wh.id ? null : wh.id)}
              onCancelEdit={() => setEditingId(null)}
              onRename={(values) => handleRename(wh, values)}
              onDelete={() => setConfirming({ warehouse: wh })}
            />
          ))}
        </div>
      )}

      {confirming && (
        <ConfirmDelete
          message={`سيُحذف المستودع "${confirming.warehouse.name}" مع كل ما فيه. هذا الإجراء نهائي.`}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}

// بطاقة العرض الشبكي
function GridCard({ wh, stats, busy, editingId, totalCount, onEnter, onToggleEdit, onCancelEdit, onRename, onDelete }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition">
      <button onClick={onEnter} className="w-full text-right p-4 hover:bg-stone-50 transition">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-2xl">📦</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-display font-bold truncate">{wh.name}</h3>
            {wh.description && <p className="text-[11px] text-stone-500 truncate">{wh.description}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          <Stat label="مساحات" value={stats.zones} />
          <Stat label="صناديق" value={stats.boxes} />
          <Stat label="أصناف" value={stats.items} />
        </div>
        <div className="mt-2 text-[10px] text-stone-400 flex items-center justify-between">
          <span>{wh.width_m}م × {wh.depth_m}م</span>
          <span className="text-blue-600 font-medium">ادخل ←</span>
        </div>
      </button>
      <div className="border-t border-stone-100 p-2 flex gap-1 bg-stone-50">
        <button onClick={onToggleEdit} disabled={busy}
          className="flex-1 text-[11px] border border-stone-300 px-2 py-1.5 rounded bg-white hover:bg-stone-100">
          ✏️ تعديل المعلومات
        </button>
        <button onClick={onDelete}
          disabled={busy || totalCount <= 1}
          className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100 disabled:opacity-30">
          🗑
        </button>
      </div>
      {editingId === wh.id && (
        <FormModal
          title={`✏️ تعديل "${wh.name}"`}
          onClose={onCancelEdit}
          maxWidth="max-w-md"
        >
          <EditWarehouseForm
            initial={wh}
            busy={busy}
            onCancel={onCancelEdit}
            onSave={onRename}
          />
        </FormModal>
      )}
    </div>
  );
}

// بطاقة العرض على شكل صفحة بصورة مصغّرة عن المستودع
function PageCard({ wh, stats, layout, busy, editingId, totalCount, onEnter, onToggleEdit, onCancelEdit, onRename, onDelete }) {
  const zones = layout?.zones || [];
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden hover:shadow-lg transition shadow-sm">
      <button onClick={onEnter} className="w-full text-right p-4 hover:bg-stone-50 transition">
        {/* معلومات المستودع — في الأعلى */}
        <div className="flex items-start gap-2 mb-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xl flex-shrink-0">📦</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-display font-bold truncate">{wh.name}</h3>
            {wh.description && <p className="text-[11px] text-stone-500 truncate">{wh.description}</p>}
            <p className="text-[10px] text-stone-400 mt-0.5">{wh.width_m}م × {wh.depth_m}م</p>
          </div>
        </div>

        {/* الإحصائيّات */}
        <div className="grid grid-cols-3 gap-1 text-center mb-3">
          <Stat label="مساحات" value={stats.zones} />
          <Stat label="صناديق" value={stats.boxes} />
          <Stat label="أصناف" value={stats.items} />
        </div>

        {/* الصورة المصغّرة عن المستودع — في الأسفل */}
        <div className="bg-gradient-to-br from-stone-50 to-stone-100 rounded-xl p-3 mb-2 border border-stone-200">
          <div className="relative aspect-square bg-white rounded border-2 border-dashed border-stone-300 px-2 py-5">
            <div className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[7px] text-stone-400">الجدار الخلفي</div>
            {zones.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-stone-300 text-[10px]">
                📭 فارغ
              </div>
            ) : (
              zones.map(z => {
                const style = {
                  top:    z.pos_top    != null ? `${z.pos_top}%`    : undefined,
                  left:   z.pos_left   != null ? `${z.pos_left}%`   : undefined,
                  right:  z.pos_right  != null ? `${z.pos_right}%`  : undefined,
                  width:  z.pos_width  != null ? `${z.pos_width}%`  : undefined,
                  height: z.pos_height != null ? `${z.pos_height}%` : undefined,
                  borderColor: z.color,
                  backgroundColor: z.color + '15'
                };
                return (
                  <div key={z.id} style={style}
                    className="absolute border-2 rounded p-0.5 flex flex-col items-center justify-center">
                    <div className="text-[10px] font-display font-bold leading-none" style={{ color: z.color }}>{z.letter}</div>
                  </div>
                );
              })
            )}
            <div className="absolute -bottom-px left-1/2 -translate-x-1/2 bg-white border border-stone-300 border-b-0 rounded-t px-1.5 py-0.5 text-[7px] text-stone-600">المدخل</div>
          </div>
        </div>

        <div className="text-center text-[11px] text-blue-600 font-medium">ادخل المستودع ←</div>
      </button>
      <div className="border-t border-stone-100 p-2 flex gap-1 bg-stone-50">
        <button onClick={onToggleEdit} disabled={busy}
          className="flex-1 text-[11px] border border-stone-300 px-2 py-1.5 rounded bg-white hover:bg-stone-100">
          ✏️ تعديل المعلومات
        </button>
        <button onClick={onDelete}
          disabled={busy || totalCount <= 1}
          className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100 disabled:opacity-30">
          🗑
        </button>
      </div>
      {editingId === wh.id && (
        <FormModal
          title={`✏️ تعديل "${wh.name}"`}
          onClose={onCancelEdit}
          maxWidth="max-w-md"
        >
          <EditWarehouseForm
            initial={wh}
            busy={busy}
            onCancel={onCancelEdit}
            onSave={onRename}
          />
        </FormModal>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-stone-50 rounded p-1.5">
      <div className="text-base font-bold">{value ?? '—'}</div>
      <div className="text-[9px] text-stone-500">{label}</div>
    </div>
  );
}
