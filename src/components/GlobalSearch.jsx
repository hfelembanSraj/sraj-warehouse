import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// مكوّن بحث شامل في الهيدر — يبحث عبر كل المستودعات
export default function GlobalSearch({ onJump }) {
  const { warehouses } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // debounce البحث
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => runSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query, warehouses.length]);

  async function runSearch(q) {
    setLoading(true);
    const ilike = `%${q}%`;
    try {
      const [itemsR, boxesR, zonesR, whR] = await Promise.all([
        supabase
          .from('items')
          .select('id, name, quantity, box_id, photo_url, boxes!inner(code, warehouse_id, shelf_id, deleted_at, shelves(zone_id, shelf_index, zones(letter, name, color)))')
          .ilike('name', ilike)
          .is('deleted_at', null)
          .is('boxes.deleted_at', null)
          .limit(15),
        supabase
          .from('boxes')
          .select('id, code, description, photo_url, warehouse_id, shelf_id, shelves(zone_id, shelf_index, zones(letter, name, color))')
          .or(`code.ilike.${ilike},description.ilike.${ilike}`)
          .is('deleted_at', null)
          .limit(15),
        supabase
          .from('zones')
          .select('id, letter, name, color, warehouse_id')
          .or(`name.ilike.${ilike},letter.ilike.${ilike}`)
          .limit(10),
        supabase
          .from('warehouses')
          .select('id, name, description')
          .or(`name.ilike.${ilike},description.ilike.${ilike}`)
          .limit(10)
      ]);

      const whMap = Object.fromEntries((warehouses || []).map(w => [w.id, w.name]));

      setResults({
        items: (itemsR.data || []).map(it => ({
          ...it,
          warehouseName: whMap[it.boxes?.warehouse_id] || '—'
        })),
        boxes: (boxesR.data || []).map(b => ({
          ...b,
          warehouseName: whMap[b.warehouse_id] || '—'
        })),
        zones: (zonesR.data || []).map(z => ({
          ...z,
          warehouseName: whMap[z.warehouse_id] || '—'
        })),
        warehouses: whR.data || []
      });
    } catch (e) {
      console.error('Search failed:', e);
      setResults({ items: [], boxes: [], zones: [], warehouses: [] });
    }
    setLoading(false);
  }

  const totalResults = results
    ? results.items.length + results.boxes.length + results.zones.length + results.warehouses.length
    : 0;

  function handleJump(target) {
    setOpen(false);
    setQuery('');
    setResults(null);
    onJump(target);
  }

  return (
    <div className="relative" ref={ref}>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="🔍 بحث شامل..."
        className="w-40 sm:w-56 text-xs px-3 py-1.5 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-blue"
      />

      {open && query.trim() && (
        <div className="absolute top-full mt-1 right-0 w-80 sm:w-96 max-h-[60vh] overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-xl z-50">
          {loading ? (
            <div className="p-4 text-center text-xs text-stone-500">جاري البحث...</div>
          ) : !results ? (
            <div className="p-4 text-center text-xs text-stone-400">اكتب للبحث</div>
          ) : totalResults === 0 ? (
            <div className="p-4 text-center text-xs text-stone-400">لا توجد نتائج لـ "{query}"</div>
          ) : (
            <div>
              <div className="px-3 py-1.5 text-[10px] text-stone-500 bg-stone-50 border-b border-stone-100 sticky top-0">
                {totalResults} نتيجة
              </div>

              {results.warehouses.length > 0 && (
                <Section title="🏢 مستودعات">
                  {results.warehouses.map(w => (
                    <ResultRow
                      key={w.id}
                      icon="📦"
                      title={w.name}
                      subtitle={w.description || ''}
                      onClick={() => handleJump({ type: 'warehouse', id: w.id })}
                    />
                  ))}
                </Section>
              )}

              {results.zones.length > 0 && (
                <Section title="📍 مساحات تخزين">
                  {results.zones.map(z => (
                    <ResultRow
                      key={z.id}
                      icon={<span className="text-lg font-bold" style={{ color: z.color }}>{z.letter}</span>}
                      title={z.name}
                      subtitle={`${z.warehouseName}`}
                      onClick={() => handleJump({ type: 'zone', id: z.id, warehouseId: z.warehouse_id, letter: z.letter })}
                    />
                  ))}
                </Section>
              )}

              {results.boxes.length > 0 && (
                <Section title="📦 صناديق">
                  {results.boxes.map(b => {
                    const z = b.shelves?.zones;
                    return (
                      <ResultRow
                        key={b.id}
                        icon={b.photo_url
                          ? <img src={b.photo_url} alt="" className="w-8 h-8 object-cover rounded" />
                          : '📦'
                        }
                        title={b.code}
                        subtitle={`${b.warehouseName}${z ? ` ← ${z.letter} ${z.name}` : ''}${b.description ? ` · ${b.description}` : ''}`}
                        onClick={() => handleJump({ type: 'box', boxCode: b.code, warehouseId: b.warehouse_id })}
                      />
                    );
                  })}
                </Section>
              )}

              {results.items.length > 0 && (
                <Section title="🔧 أصناف">
                  {results.items.map(it => {
                    const z = it.boxes?.shelves?.zones;
                    return (
                      <ResultRow
                        key={it.id}
                        icon={it.photo_url
                          ? <img src={it.photo_url} alt="" className="w-8 h-8 object-cover rounded" />
                          : <div className="w-8 h-8 rounded bg-gradient-to-br from-amber-50 to-stone-100 border border-stone-200 flex items-center justify-center text-[7px] font-bold text-stone-700 text-center p-0.5 leading-tight overflow-hidden"><span className="line-clamp-2">{it.name}</span></div>
                        }
                        title={it.name}
                        subtitle={`${it.warehouseName}${z ? ` ← ${z.letter}` : ''} ← ${it.boxes?.code || '—'} · كميّة: ${it.quantity}`}
                        onClick={() => handleJump({ type: 'box', boxCode: it.boxes?.code, warehouseId: it.boxes?.warehouse_id })}
                      />
                    );
                  })}
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="px-3 py-1.5 text-[10px] font-bold text-stone-600 bg-stone-50 border-y border-stone-100">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({ icon, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-right px-3 py-2 hover:bg-blue-50 flex items-center gap-2 border-b border-stone-50 last:border-b-0 transition"
    >
      <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
        {typeof icon === 'string' ? <span className="text-lg">{icon}</span> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{title}</div>
        {subtitle && <div className="text-[10px] text-stone-500 truncate">{subtitle}</div>}
      </div>
      <span className="text-stone-400 text-xs">→</span>
    </button>
  );
}
