import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { CreateWarehouseForm, EditWarehouseForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import { rpcCreateWarehouse, rpcRenameWarehouse, rpcDeleteWarehouse } from '../lib/warehouseOps';

export default function WarehousesHome({ onEnterWarehouse, onRefresh }) {
  const { warehouses, isFounder, setWarehouseId } = useAuth();
  const [stats, setStats] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  useEffect(() => {
    loadStats();
  }, [warehouses.length]);

  async function loadStats() {
    const result = {};
    await Promise.all(warehouses.map(async (wh) => {
      const [zonesR, boxesR, itemsR] = await Promise.all([
        supabase.from('zones').select('id', { count: 'exact', head: true }).eq('warehouse_id', wh.id),
        supabase.from('boxes').select('id', { count: 'exact', head: true }).eq('warehouse_id', wh.id),
        supabase.from('items').select('quantity, boxes!inner(warehouse_id)').eq('boxes.warehouse_id', wh.id)
      ]);
      const totalQty = (itemsR.data || []).reduce((s, it) => s + (it.quantity || 0), 0);
      result[wh.id] = {
        zones: zonesR.count || 0,
        boxes: boxesR.count || 0,
        items: totalQty
      };
    }));
    setStats(result);
  }

  async function handleCreate(values) {
    setBusy(true);
    const { data, error } = await rpcCreateWarehouse(values);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تم إنشاء "${values.name}"`);
    setShowCreate(false);
    await onRefresh();
    await loadStats();
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
    await loadStats();
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
        <button onClick={() => setShowCreate(s => !s)} disabled={busy}
          className="text-xs bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
          + إنشاء مستودع جديد
        </button>
      </div>

      {showCreate && (
        <div className="mb-4">
          <CreateWarehouseForm
            busy={busy}
            onCancel={() => setShowCreate(false)}
            onSave={handleCreate}
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {warehouses.map(wh => {
          const s = stats[wh.id] || {};
          return (
            <div key={wh.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition">
              <button
                onClick={() => onEnterWarehouse(wh.id)}
                className="w-full text-right p-4 hover:bg-stone-50 transition"
              >
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-2xl">📦</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-display font-bold truncate">{wh.name}</h3>
                    {wh.description && <p className="text-[11px] text-stone-500 truncate">{wh.description}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div className="bg-stone-50 rounded p-1.5">
                    <div className="text-base font-bold">{s.zones ?? '—'}</div>
                    <div className="text-[9px] text-stone-500">مساحات</div>
                  </div>
                  <div className="bg-stone-50 rounded p-1.5">
                    <div className="text-base font-bold">{s.boxes ?? '—'}</div>
                    <div className="text-[9px] text-stone-500">صناديق</div>
                  </div>
                  <div className="bg-stone-50 rounded p-1.5">
                    <div className="text-base font-bold">{s.items ?? '—'}</div>
                    <div className="text-[9px] text-stone-500">قطع</div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-stone-400 flex items-center justify-between">
                  <span>{wh.width_m}م × {wh.depth_m}م</span>
                  <span className="text-blue-600 font-medium">ادخل ←</span>
                </div>
              </button>
              <div className="border-t border-stone-100 p-2 flex gap-1 bg-stone-50">
                <button onClick={() => setEditingId(editingId === wh.id ? null : wh.id)} disabled={busy}
                  className="flex-1 text-[11px] border border-stone-300 px-2 py-1.5 rounded bg-white hover:bg-stone-100">
                  ✏️ تعديل المعلومات
                </button>
                <button onClick={() => setConfirming({ warehouse: wh })}
                  disabled={busy || warehouses.length <= 1}
                  className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded hover:bg-red-100 disabled:opacity-30">
                  🗑
                </button>
              </div>
              {editingId === wh.id && (
                <div className="bg-white border-t border-stone-200 p-3">
                  <EditWarehouseForm
                    initial={wh}
                    busy={busy}
                    onCancel={() => setEditingId(null)}
                    onSave={(values) => handleRename(wh, values)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

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
