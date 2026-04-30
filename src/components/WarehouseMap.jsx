import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AddItemModal from './AddItemModal';

export default function WarehouseMap({ data, onZoneClick, onRefresh, onOpenBuilder }) {
  const { can, isFounder, activeWarehouse } = useAuth();
  const [showAddItem, setShowAddItem] = useState(false);

  const totalBoxes = data.boxes.length;
  const totalQty = data.items.reduce((s, it) => s + (it.quantity || 0), 0);
  const checkedOutCount = data.checkouts.length;
  const damagedCount = data.damaged.length;

  const zones = data.zones || [];

  function boxCountForZone(letter) {
    return data.boxes.filter(b => b.code.startsWith(letter + '-')).length;
  }

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard num={totalBoxes} label="صناديق" />
        <StatCard num={totalQty} label="إجمالي القطع" />
        <StatCard num={checkedOutCount} label="مُخرَج حالياً" color="orange" />
        <StatCard num={damagedCount} label="متلفات" color="red" />
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-bold">مخطّط المستودع — منظور علوي</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {activeWarehouse?.width_m || 4}م × {activeWarehouse?.depth_m || 4}م · {zones.length} مساحة تخزين
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isFounder && onOpenBuilder && (
              <button onClick={onOpenBuilder}
                className="bg-amber-100 border border-amber-300 text-amber-900 text-xs px-3 py-2 rounded-lg hover:bg-amber-200">
                🏗 منشئ المستودع
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

        {zones.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm mb-2">هذا المستودع فارغ — لا توجد مساحات تخزين بعد</p>
            {isFounder && (
              <button onClick={onOpenBuilder}
                className="mt-2 bg-amber-500 text-white text-xs px-4 py-2 rounded-lg hover:bg-amber-600">
                🏗 ابدأ بناء المستودع
              </button>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="relative w-full max-w-lg aspect-square bg-stone-100 rounded-lg border-2 border-dashed border-stone-300 px-3 py-7">
              <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-stone-400 tracking-widest">الجدار الخلفي</div>

              {zones.map(z => (
                <ZoneTile
                  key={z.id}
                  zone={z}
                  boxCount={boxCountForZone(z.letter)}
                  onClick={() => onZoneClick(z.letter)}
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
        )}
      </div>

      {showAddItem && <AddItemModal data={data} onClose={() => setShowAddItem(false)} onSaved={onRefresh} />}
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

function ZoneTile({ zone, boxCount, onClick }) {
  // الموضع المطلق بالنسبة المئوية
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
    <button onClick={onClick} style={style}
      className="absolute bg-white border-2 rounded-md p-2 flex flex-col justify-between cursor-pointer hover:shadow-md transition group">
      <div className="absolute inset-1 border border-dashed border-stone-200 rounded pointer-events-none"></div>
      <div>
        <div className="text-2xl font-display font-bold leading-none" style={{ color: zone.color }}>{zone.letter}</div>
        <div className="text-[9px] text-stone-500 mt-1 leading-tight">{zone.name}</div>
      </div>
      <div className="text-[9px] text-stone-400">{boxCount} صناديق</div>
    </button>
  );
}
