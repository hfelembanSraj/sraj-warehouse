import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import AddItemModal from './AddItemModal';
import { AddZoneForm, EditZoneForm, ConfirmDelete, StatusToast, useFlash } from './BuilderForms';
import { rpcAddZone, rpcUpdateZone, rpcDeleteZone, softDeleteItem } from '../lib/warehouseOps';

export default function WarehouseMap({ data, onZoneClick, onItemClick, onRefresh }) {
  const { can, isFounder, activeWarehouse } = useAuth();
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  // وضع العرض: map (الخريطة) | items (كل الأغراض)
  const [viewMode, setViewMode] = useState('map');

  const totalBoxes = data.boxes.length;
  const totalItemTypes = data.items.length;          // عدد الأغراض (الأصناف المتميّزة)
  const totalQty = data.items.reduce((s, it) => s + (it.quantity || 0), 0);
  const checkedOutCount = data.checkouts.length;

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

  return (
    <>
      <StatusToast msg={msg} />

      {/* الإحصائيّات (المتلفات تظهر في تبويب التقارير) */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard num={totalBoxes} label="عدد الصناديق" />
        <StatCard num={totalItemTypes} label="عدد الأغراض" />
        <StatCard num={checkedOutCount} label="مُخرَج حالياً" color={checkedOutCount > 0 ? 'orange' : 'default'} />
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-bold">{activeWarehouse?.name || 'المستودع'}</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {activeWarehouse?.width_m || 4}م × {activeWarehouse?.depth_m || 4}م · {zones.length} مساحة · {totalBoxes} صندوق · {data.items.length} صنف
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isFounder && viewMode === 'map' && (
              <button onClick={() => setShowAddZone(s => !s)}
                className="bg-amber-100 border border-amber-300 text-amber-900 text-xs px-3 py-2 rounded-lg hover:bg-amber-200">
                + 👑 مساحة جديدة
              </button>
            )}
            {can('add') && (
              <button onClick={() => setShowAddItem(true)}
                className="bg-brand-blue text-white text-xs px-3 py-2 rounded-lg hover:bg-blue-800">
                + إضافة أداة جديدة
              </button>
            )}
          </div>
        </div>

        {/* مبدّل وضع العرض */}
        <div className="bg-stone-100 rounded-lg p-0.5 inline-flex mb-4">
          <button onClick={() => setViewMode('map')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'map' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
            🗺 الخريطة
          </button>
          <button onClick={() => setViewMode('items')}
            className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'items' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
            📋 كل الأغراض ({data.items.length})
          </button>
        </div>

        {showAddZone && viewMode === 'map' && (
          <div className="mb-4">
            <AddZoneForm
              busy={busy}
              existingLetters={zones.map(z => z.letter)}
              onCancel={() => setShowAddZone(false)}
              onSave={handleAddZone}
            />
          </div>
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
                <div className="relative w-full max-w-lg aspect-square bg-stone-100 rounded-lg border-2 border-dashed border-stone-300 px-3 py-7">
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-stone-400 tracking-widest">الجدار الخلفي</div>

                  {zones.map(z => (
                    <ZoneTile
                      key={z.id}
                      zone={z}
                      boxCount={boxCountForZone(z.letter)}
                      onClick={() => onZoneClick(z)}
                      isFounder={isFounder}
                      busy={busy}
                      onEdit={() => setEditingZoneId(editingZoneId === z.id ? null : z.id)}
                      onDelete={() => setConfirming({ zone: z })}
                    />
                  ))}

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-stone-400 tracking-widest">ممرّ الحركة</span>
                  </div>

                  <div className="absolute -bottom-px left-1/2 -translate-x-1/2 bg-white border border-stone-300 border-b-0 rounded-t-lg px-4 py-1 text-[10px] text-stone-600">
                    المدخل
                  </div>
                </div>
              </div>

              {isFounder && editingZoneId && (
                <div className="mt-4 bg-stone-50 border border-stone-200 rounded-xl p-3">
                  {(() => {
                    const z = zones.find(z2 => z2.id === editingZoneId);
                    if (!z) return null;
                    return (
                      <>
                        <h4 className="text-xs font-display font-bold mb-2">
                          ✏️ تعديل مساحة {z.letter} — {z.name}
                        </h4>
                        <EditZoneForm
                          zone={z}
                          busy={busy}
                          onCancel={() => setEditingZoneId(null)}
                          onSave={(patch) => handleUpdateZone(z, patch)}
                        />
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )
        ) : (
          <AllItemsList data={data} onItemClick={onItemClick} onRefresh={onRefresh} />
        )}
      </div>

      {showAddItem && <AddItemModal data={data} onClose={() => setShowAddItem(false)} onSaved={onRefresh} />}
      {confirming && (
        <ConfirmDelete
          message={`سيُحذف ${confirming.zone.letter} — ${confirming.zone.name} مع كل أرففه وصناديقه. هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={handleDeleteZone}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}

function StatCard({ num, label, color = 'default' }) {
  const colors = {
    default: 'text-stone-900',
    orange: 'text-orange-600',
    red: 'text-red-600'
  };
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
      <div className={`text-2xl font-display font-bold ${colors[color]}`}>{num}</div>
      <div className="text-[11px] text-stone-500 mt-0.5">{label}</div>
    </div>
  );
}

function ZoneTile({ zone, boxCount, onClick, isFounder, busy, onEdit, onDelete }) {
  const style = {
    top:    zone.pos_top    != null ? `${zone.pos_top}%`    : undefined,
    bottom: (zone.pos_top == null && zone.pos_height != null) ? `${100 - zone.pos_height - 6}%` : undefined,
    left:   zone.pos_left   != null ? `${zone.pos_left}%`   : undefined,
    right:  zone.pos_right  != null ? `${zone.pos_right}%`  : undefined,
    width:  zone.pos_width  != null ? `${zone.pos_width}%`  : undefined,
    height: zone.pos_height != null ? `${zone.pos_height}%` : undefined,
    borderColor: zone.color
  };
  return (
    <div style={style} className="absolute bg-white border-2 rounded-md flex flex-col group">
      <button onClick={onClick} className="flex-1 p-2 hover:bg-stone-50 rounded-md transition relative flex flex-col items-center justify-center">
        <div className="absolute inset-1 border border-dashed border-stone-200 rounded pointer-events-none"></div>
        <div className="text-3xl font-display font-bold leading-none" style={{ color: zone.color }}>{zone.letter}</div>
        <div className="text-[10px] text-stone-600 mt-1.5 leading-tight text-center px-1">{zone.name}</div>
        <div className="text-[9px] text-stone-400 mt-1">{boxCount} صناديق</div>
      </button>
      {isFounder && (
        <div className="absolute top-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} disabled={busy}
            className="text-[9px] bg-white border border-stone-300 px-1 py-0.5 rounded shadow-sm hover:bg-stone-100"
            title="تعديل"
          >✏️</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={busy}
            className="text-[9px] bg-white border border-red-300 px-1 py-0.5 rounded shadow-sm text-red-600 hover:bg-red-50"
            title="حذف"
          >🗑</button>
        </div>
      )}
    </div>
  );
}

// ====== قائمة كل الأغراض في المستودع ======
function AllItemsList({ data, onItemClick, onRefresh }) {
  const { isFounder, can } = useAuth();
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleQuickDelete(item) {
    setBusy(true);
    const { error } = await softDeleteItem(item.id);
    setBusy(false);
    setConfirmDelete(null);
    if (error) return alert('فشل الحذف: ' + error.message);
    onRefresh?.();
  }

  const enriched = useMemo(() => {
    return data.items.map(it => {
      const box = data.boxes.find(b => b.id === it.box_id);
      const zoneLetter = box?.code?.split('-')[0];
      const zone = (data.zones || []).find(z => z.letter === zoneLetter);
      return {
        ...it,
        boxCode: box?.code || '—',
        zoneLetter,
        zoneName: zone?.name || '—',
        zoneColor: zone?.color || '#888',
        zone
      };
    });
  }, [data.items, data.boxes, data.zones]);

  const filtered = enriched.filter(it => {
    if (search.trim() && !`${it.name} ${it.boxCode}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterZone !== 'all' && it.zoneLetter !== filterZone) return false;
    return true;
  });

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 ابحث في كل أغراض المستودع..."
          className="px-3 py-2 border border-stone-300 rounded-lg text-xs"
        />
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white">
          <option value="all">كل المساحات</option>
          {(data.zones || []).map(z => (
            <option key={z.id} value={z.letter}>{z.letter} — {z.name}</option>
          ))}
        </select>
      </div>

      <div className="text-[11px] text-stone-500 mb-2">
        عرض {filtered.length} من {enriched.length} صنف · اضغط أيّ صنف للذهاب لمكانه مباشرة
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
              className="bg-white border border-stone-200 rounded-lg p-2.5 flex items-center gap-3 hover:shadow-md transition"
            >
              <button
                onClick={() => onItemClick && onItemClick(it.boxCode)}
                className="flex items-center gap-3 flex-1 text-right -m-2.5 p-2.5 hover:bg-stone-50 rounded-lg transition min-w-0"
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
                <span className="text-[10px] px-2 py-1 rounded font-bold font-mono" style={{ color: it.zoneColor, backgroundColor: it.zoneColor + '15' }}>
                  {it.boxCode}
                </span>
                <span className="text-stone-400">→</span>
              </button>
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
    </div>
  );
}
