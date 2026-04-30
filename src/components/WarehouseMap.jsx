import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ZONE_CATEGORIES } from '../lib/constants';
import AddItemModal from './AddItemModal';

export default function WarehouseMap({ data, onZoneClick, onRefresh }) {
  const { can } = useAuth();
  const [showAddItem, setShowAddItem] = useState(false);

  const totalBoxes = data.boxes.length;
  const totalQty = data.items.reduce((s, it) => s + (it.quantity || 0), 0);
  const checkedOutCount = data.checkouts.length;
  const damagedCount = data.damaged.length;

  const zoneStats = {};
  Object.keys(ZONE_CATEGORIES).forEach(cat => {
    const letter = ZONE_CATEGORIES[cat].letter;
    zoneStats[letter] = data.boxes.filter(b => b.code.startsWith(letter + '-')).length;
  });

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
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-display font-bold">مخطّط المستودع — منظور علوي</h2>
            <p className="text-xs text-stone-500 mt-0.5">المساحات على الجدارَين الأيمن والأيسر · 4م × 4م</p>
          </div>
          {can('add') && (
            <button onClick={() => setShowAddItem(true)}
              className="bg-brand-blue text-white text-xs px-3 py-2 rounded-lg hover:bg-blue-800">
              + إضافة أداة جديدة
            </button>
          )}
        </div>

        {/* Top-down floor plan */}
        <div className="flex justify-center">
          <div className="relative w-full max-w-lg aspect-square bg-stone-100 rounded-lg border-2 border-dashed border-stone-300 px-3 py-7">
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-stone-400 tracking-widest">الجدار الخلفي</div>

            {/* Zone A - top right */}
            <ZoneTile letter="A" stats={zoneStats} position="top-[6%] right-[4%] w-[18%] h-[42%]" onClick={() => onZoneClick('A')} />
            {/* Zone B - bottom right */}
            <ZoneTile letter="B" stats={zoneStats} position="bottom-[6%] right-[4%] w-[18%] h-[42%]" onClick={() => onZoneClick('B')} />
            {/* Zone C - top left */}
            <ZoneTile letter="C" stats={zoneStats} position="top-[6%] left-[4%] w-[18%] h-[42%]" onClick={() => onZoneClick('C')} />
            {/* Zone D - bottom left */}
            <ZoneTile letter="D" stats={zoneStats} position="bottom-[6%] left-[4%] w-[18%] h-[42%]" onClick={() => onZoneClick('D')} />

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] text-stone-400 tracking-widest">ممرّ الحركة</span>
            </div>

            <div className="absolute -bottom-px left-1/2 -translate-x-1/2 bg-white border border-stone-300 border-b-0 rounded-t-lg px-4 py-1 text-[10px] text-stone-600">
              المدخل
            </div>
          </div>
        </div>
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

function ZoneTile({ letter, stats, position, onClick }) {
  const cat = Object.values(ZONE_CATEGORIES).find(z => z.letter === letter);
  return (
    <button onClick={onClick}
      className={`absolute ${position} bg-white border border-stone-300 rounded-md p-2 flex flex-col justify-between cursor-pointer hover:bg-orange-50 hover:border-orange-400 transition group`}>
      <div className="absolute inset-1 border border-dashed border-stone-200 rounded pointer-events-none"></div>
      <div>
        <div className="text-2xl font-display font-bold text-stone-900 leading-none">{letter}</div>
        <div className="text-[9px] text-stone-500 mt-1 leading-tight">{cat?.name}</div>
      </div>
      <div className="text-[9px] text-stone-400">{stats[letter] || 0} صناديق</div>
    </button>
  );
}
