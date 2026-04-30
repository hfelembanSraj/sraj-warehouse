import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function WarehouseSwitcher({ onCreateNew }) {
  const { warehouses, activeWarehouse, setWarehouseId, isFounder } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!activeWarehouse) {
    return <div className="text-xs text-stone-400">— لا يوجد مستودع —</div>;
  }

  // غير المؤسّس مع مستودع واحد فقط: لا حاجة للقائمة
  if (!isFounder && warehouses.length <= 1) {
    return (
      <div>
        <h1 className="text-sm font-display font-bold">جمعية المسؤولية الاجتماعية</h1>
        <p className="text-xs text-stone-500">{activeWarehouse.name}</p>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-right hover:bg-stone-100 rounded-md px-2 py-1 transition flex items-center gap-2"
        aria-label="تبديل المستودع"
      >
        <div>
          <h1 className="text-sm font-display font-bold flex items-center gap-1 justify-end">
            جمعية المسؤولية الاجتماعية
          </h1>
          <p className="text-xs text-stone-500 flex items-center gap-1 justify-end">
            {activeWarehouse.name}
            <svg className={`w-3 h-3 transition ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </p>
        </div>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-stone-200 rounded-xl shadow-lg z-50 animate-fade-in overflow-hidden">
          <div className="px-3 py-2 border-b border-stone-100 bg-stone-50">
            <p className="text-[10px] text-stone-500 font-medium">اختر المستودع</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {warehouses.map(wh => (
              <button
                key={wh.id}
                onClick={() => { setWarehouseId(wh.id); setOpen(false); }}
                className={`w-full text-right px-3 py-2 hover:bg-stone-50 flex items-center gap-2 transition border-b border-stone-50 last:border-b-0 ${
                  wh.id === activeWarehouse.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{wh.name}</div>
                  {wh.description && <div className="text-[10px] text-stone-500 truncate">{wh.description}</div>}
                </div>
                {wh.id === activeWarehouse.id && (
                  <span className="text-blue-600 text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
          {isFounder && onCreateNew && (
            <button
              onClick={() => { setOpen(false); onCreateNew(); }}
              className="w-full text-right px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm font-medium border-t border-amber-200 transition"
            >
              👑 + إنشاء مستودع جديد
            </button>
          )}
        </div>
      )}
    </div>
  );
}
