// ============================================================
// VertexEditLayer — محرّر نقاط شكل قائم (مساحة/عنصر/جدار) على الخريطة.
// اسحب النقاط لتعديل الشكل · «+» في منتصف الضلع لإضافة نقطة · نقرة
// مزدوجة على نقطة لحذفها · حفظ صريح («💾 حفظ الشكل») أو إلغاء يتجاهل.
// مستطيل بلا نقاط يتحوّل عند الحفظ إلى شكل رباعي حرّ (نقاط زواياه).
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { snapValue, formatDim } from '../lib/gridConfig';
import {
  pctFromClient, geometryFromAbsPoints, absPointsOfZone, polygonArea,
  segmentMeters, snapToTargets, snapToSegments, midPoint, naturalZoneRect
} from '../lib/mapDraw';

export default function VertexEditLayer({
  containerRef, warehouse, zone, snapX, snapY, targets = [], segments = [],
  onSave, onClose, flash, busy
}) {
  const isOpen = Array.isArray(zone.points) && zone.points[0]?.open;
  const initialRef = useRef(absPointsOfZone(naturalZoneRect(zone), zone.points));
  const [pts, setPts] = useState(initialRef.current);
  const [history, setHistory] = useState([]);  // لقطات للتراجع المحلّي
  const [dragIdx, setDragIdx] = useState(null);
  const dirty = history.length > 0;
  const minPts = isOpen ? 2 : 3;

  function pushHistory() { setHistory(h => [...h, pts]); }

  function beginDrag(idx, e) {
    e.preventDefault(); e.stopPropagation();
    pushHistory();
    setDragIdx(idx);
  }

  // سحب النقطة عبر مستمعات النافذة (يستمرّ خارج حدود المقبض)
  useEffect(() => {
    if (dragIdx == null) return;
    function mv(e) {
      const c = e.touches ? e.touches[0] : e;
      if (!c) return;
      if (e.cancelable) e.preventDefault();
      let p = pctFromClient(containerRef.current, c.clientX, c.clientY);
      const hit = snapToTargets(p, targets) || snapToSegments(p, segments, warehouse);
      p = hit ? { x: hit.x, y: hit.y } : { x: snapValue(p.x, snapX), y: snapValue(p.y, snapY) };
      setPts(a => a.map((q, i) => (i === dragIdx ? p : q)));
    }
    function up() { setDragIdx(null); }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('touchmove', mv, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('touchmove', mv);
      window.removeEventListener('touchend', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIdx, snapX, snapY, targets, segments]);

  function insertAt(i, p) {
    pushHistory();
    setPts(a => [...a.slice(0, i), p, ...a.slice(i)]);
  }

  function removeAt(i) {
    if (pts.length <= minPts) return flash?.(`الحدّ الأدنى ${minPts} نقاط لهذا الشكل`, 'error');
    pushHistory();
    setPts(a => a.filter((_, k) => k !== i));
  }

  function handleSave() {
    if (!dirty || busy) return;
    if (!isOpen && polygonArea(pts) < 0.4) return flash?.('الشكل صار خطّاً مستقيماً — عدّل النقاط', 'error');
    onSave(geometryFromAbsPoints(pts, { open: isOpen }));
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
      else if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
      else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setHistory(h => {
          if (h.length === 0) return h;
          setPts(h[h.length - 1]);
          return h.slice(0, -1);
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, dirty, busy]);

  // الأضلاع: متتابعة، والمغلق يضيف ضلع الإقفال
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], insertIdx: i + 1 });
  if (!isOpen && pts.length >= 3) segs.push({ a: pts[pts.length - 1], b: pts[0], insertIdx: pts.length });

  const color = zone.color || '#2563eb';

  return (
    <div className="absolute inset-0 z-[60] select-none" style={{ touchAction: 'none' }}>
      {/* معاينة الشكل الحيّة */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {isOpen ? (
          <path d={`M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}
            fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke" />
        ) : (
          <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')}
            fill={`${color}26`} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* قياسات الأضلاع */}
      {segs.map((g, i) => {
        const m = midPoint(g.a, g.b);
        return (
          <div key={`m${i}`}
            className="absolute text-[9px] font-bold text-stone-700 dark:text-stone-200 bg-white/90 dark:bg-stone-900/90 rounded px-1 shadow-sm pointer-events-none -translate-x-1/2 -translate-y-[130%] whitespace-nowrap"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}>
            {formatDim(segmentMeters(g.a, g.b, warehouse))}
          </div>
        );
      })}

      {/* مقابض إضافة نقطة في منتصف الضلع */}
      {segs.map((g, i) => {
        const m = midPoint(g.a, g.b);
        return (
          <button key={`+${i}`}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); insertAt(g.insertIdx, { x: m.x, y: m.y }); }}
            className="absolute w-4 h-4 rounded-full bg-white dark:bg-stone-800 border border-stone-400 dark:border-stone-500 text-stone-600 dark:text-stone-300 text-[10px] leading-none font-bold shadow -translate-x-1/2 -translate-y-1/2 hover:bg-green-100 dark:hover:bg-green-900/40 hover:border-green-500 z-10"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
            title="إضافة نقطة هنا">+</button>
        );
      })}

      {/* مقابض النقاط */}
      {pts.map((p, i) => (
        <div key={i}
          onPointerDown={(e) => beginDrag(i, e)}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAt(i); }}
          className={`absolute w-5 h-5 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 z-20 ${
            dragIdx === i ? 'bg-green-500 cursor-grabbing scale-110' : 'bg-blue-600 cursor-grab hover:scale-110'} transition-transform`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          title="اسحب لتعديل الشكل · نقرة مزدوجة للحذف" />
      ))}

      {/* أزرار التحكّم */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-30"
        onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <button onClick={handleSave} disabled={!dirty || busy}
          className="text-[11px] bg-green-600 text-white px-3 py-1.5 rounded-lg shadow hover:bg-green-700 font-bold disabled:opacity-40">
          {busy ? '...' : '💾 حفظ الشكل'}
        </button>
        <button
          onClick={() => setHistory(h => { if (h.length === 0) return h; setPts(h[h.length - 1]); return h.slice(0, -1); })}
          disabled={history.length === 0}
          className="text-[11px] bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-600 px-3 py-1.5 rounded-lg shadow hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40">
          ↶ تراجع
        </button>
        <button onClick={onClose}
          className="text-[11px] bg-white dark:bg-stone-800 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 px-3 py-1.5 rounded-lg shadow hover:bg-red-50 dark:hover:bg-red-950/40">
          ✕ إلغاء
        </button>
      </div>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-stone-700 dark:text-stone-200 bg-white/90 dark:bg-stone-800/90 px-3 py-1 rounded-full font-medium shadow pointer-events-none whitespace-nowrap">
        ⬡ {zone.name} — اسحب النقاط · «+» يضيف نقطة · نقرة مزدوجة تحذف
      </div>
    </div>
  );
}
