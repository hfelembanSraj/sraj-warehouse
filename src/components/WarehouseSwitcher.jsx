import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function WarehouseSwitcher() {
  const { warehouses, activeWarehouse, setWarehouseId } = useAuth();
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
    return (
      <div>
        <h1 className="text-sm font-display font-bold">جمعية المسؤولية الاجتماعية</h1>
        <p className="text-xs text-stone-400">— لا يوجد مستودع —</p>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-right hover:bg-stone-100 rounded-md px-2 py-1 transition flex items-center gap-1.5 group"
        aria-label="تبديل المستودع"
        aria-expanded={open}
      >
        <div>
          <h1 className="text-sm font-display font-bold">جمعية المسؤولية الاجتماعية</h1>
          <p className="text-xs text-stone-500 flex items-center gap-1 justify-end">
            {activeWarehouse.name}
            <span className="text-[10px] text-stone-400 group-hover:text-stone-600">
              ({warehouses.length} {warehouses.length === 1 ? 'مستودع' : 'مستودعات'})
            </span>
          </p>
        </div>
        <svg className={`w-3.5 h-3.5 text-stone-500 transition ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-stone-200 rounded-xl shadow-lg z-50 animate-fade-in overflow-hidden">
          <div className="px-3 py-2 border-b border-stone-100 bg-stone-50">
            <p className="text-[10px] text-stone-500 font-medium">اختر المستودع</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
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
                  <span className="text-blue-600 text-xs font-bold">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
