// ============================================================
// MapDrawLayer — طبقة الرسم التفاعليّة فوق خريطة المستودع.
// ثلاث أدوات: rect (مستطيل بالسحب) · poly (مضلّع بالنقاط) · wall (جدار مفتوح).
// معاينة حيّة تتبع المؤشّر + قياسات بالمتر على كل ضلع + تعامد 45° +
// التقاط لرؤوس الأشكال القائمة والشبكة + لوحة مفاتيح (Esc/Enter/Backspace).
// النقاط والتسميات عناصر HTML (لا SVG) كي لا تتشوّه مع فرق مقياس المحورين.
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { snapValue, formatDim } from '../lib/gridConfig';
import {
  pctFromClient, geometryFromAbsPoints, polygonArea,
  segmentMeters, orthoSnap, snapToTargets, snapToSegments, nearPoint, midPoint
} from '../lib/mapDraw';

export default function MapDrawLayer({
  containerRef, warehouse, tool, snapX, snapY, ortho,
  targets = [], segments = [], onFinish, onCancel, flash
}) {
  const [pts, setPts] = useState([]);          // نقاط مثبّتة (مطلقة ٪)
  const [cursor, setCursor] = useState(null);  // معاينة حيّة {x,y,hit}
  const [dragStart, setDragStart] = useState(null); // بداية سحب المستطيل
  // أبعاد مكتوبة (بالمتر) — نقرة واحدة تضع مستطيلاً بهذا المقاس بالضبط
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const lastClickRef = useRef(0);
  const isRect = tool === 'rect';
  const isWall = tool === 'wall';
  const lastPt = pts[pts.length - 1] || null;
  const whW = Number(warehouse?.width_m) || 4;
  const whD = Number(warehouse?.depth_m) || 4;
  const fixedW = Number(dimW) > 0 ? (Number(dimW) / whW) * 100 : null;
  const fixedH = Number(dimH) > 0 ? (Number(dimH) / whD) * 100 : null;

  // معالجة نقطة خام: التقاط رأس ← حافّة جدار (لصق) ← تعامد ← شبكة
  function processPoint(raw, anchor) {
    const hit = snapToTargets(raw, targets);
    if (hit) return { x: hit.x, y: hit.y, hit: true };
    const edge = snapToSegments(raw, segments, warehouse);
    if (edge) return { x: edge.x, y: edge.y, hit: true };
    let p = { x: raw.x, y: raw.y };
    let axis = null;
    if (ortho && anchor && !isRect) {
      const o = orthoSnap(anchor, p, warehouse);
      p = o.point; axis = o.axis;
    }
    // الشبكة: على المحورين بلا تعامد؛ وعلى المحور الحرّ فقط مع التعامد
    if (axis === null || axis === 'h') p.x = snapValue(p.x, snapX);
    if (axis === null || axis === 'v') p.y = snapValue(p.y, snapY);
    if (axis === 'h') p.y = anchor.y;
    if (axis === 'v') p.x = anchor.x;
    return { ...p, hit: false };
  }

  function raw(e) { return pctFromClient(containerRef.current, e.clientX, e.clientY); }

  function finishShape(curPts = pts) {
    if (isWall) {
      if (curPts.length < 2) return flash?.('حدّد نقطتين على الأقل للجدار', 'error');
      const g = geometryFromAbsPoints(curPts, { open: true });
      if (g.width < 0.8 && g.height < 0.8) return flash?.('الجدار قصير جداً', 'error');
      setPts([]); setCursor(null);
      onFinish(g, tool);
    } else {
      if (curPts.length < 3) return flash?.('حدّد ثلاث نقاط على الأقل', 'error');
      if (polygonArea(curPts) < 0.4) return flash?.('الشكل خطّ مستقيم تقريباً — وسّعه ليصير له مساحة', 'error');
      setPts([]); setCursor(null);
      onFinish(geometryFromAbsPoints(curPts), tool);
    }
  }

  function addPoint(p) {
    const now = Date.now();
    // سماحية ضيّقة جداً (0.35%) حتى يمكن رسم أضلاع قصيرة بحريّة
    if (lastPt && nearPoint(p, lastPt, 0.35)) {
      // نقرتان في نفس المكان خلال 400مل = إنهاء (double-click)
      if (now - lastClickRef.current < 400) return finishShape();
      lastClickRef.current = now;
      return;
    }
    if (!isWall && pts.length >= 3 && nearPoint(p, pts[0], 2.2)) return finishShape();
    // جدار: الضغط على النقطة الأولى (مع ≥3 نقاط) يُغلق المسار على نفسه تماماً
    if (isWall && pts.length >= 3 && nearPoint(p, pts[0], 2.2)) {
      return finishShape([...pts, { x: pts[0].x, y: pts[0].y }]);
    }
    lastClickRef.current = now;
    setPts(a => [...a, p]);
  }

  function finishRect() {
    const s = dragStart, c = cursor;
    setDragStart(null);
    if (!s || !c) return;
    const left = Math.min(s.x, c.x), top = Math.min(s.y, c.y);
    const width = Math.abs(s.x - c.x), height = Math.abs(s.y - c.y);
    if (width < 0.8 && height < 0.8) {
      // نقرة بلا سحب: إن كُتبت الأبعاد، ضع مستطيلاً بمقاسها بالضبط (مركزه النقرة)
      if (fixedW && fixedH) {
        const w = Math.min(100, fixedW), h = Math.min(100, fixedH);
        const l = Math.max(0, Math.min(100 - w, c.x - w / 2));
        const t = Math.max(0, Math.min(100 - h, c.y - h / 2));
        onFinish({ top: t, left: l, width: w, height: h }, tool);
      }
      return;
    }
    if (width < 0.8 || height < 0.8) return flash?.('المستطيل رفيع جداً — اسحب قطريّاً', 'error');
    onFinish({ top, left, width, height }, tool);
  }

  // لوحة المفاتيح: Esc إلغاء · Enter إنهاء · Backspace حذف آخر نقطة
  useEffect(() => {
    function onKey(e) {
      // لا تتدخّل أثناء الكتابة في حقول الأبعاد
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (pts.length > 0 || dragStart) { setPts([]); setDragStart(null); setCursor(null); }
        else onCancel?.();
      } else if (e.key === 'Enter' && !isRect) {
        e.preventDefault(); finishShape();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && !isRect) {
        e.preventDefault(); setPts(a => a.slice(0, -1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, dragStart, tool]);

  // الأضلاع المعروضة (مثبّتة + الضلع المطّاطي حتى المؤشّر)
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1], live: false });
  if (!isRect && lastPt && cursor) segs.push({ a: lastPt, b: cursor, live: true });
  const totalM = segs.reduce((s, g) => s + segmentMeters(g.a, g.b, warehouse), 0);
  // النقطة الأولى مغناطيسيّة للإغلاق (مضلّع ومسار جدار على السواء)
  const nearFirst = !isRect && cursor && pts.length >= 3 && nearPoint(cursor, pts[0], 2.2);

  // معاينة المستطيل
  const rectPrev = isRect && dragStart && cursor ? {
    left: Math.min(dragStart.x, cursor.x), top: Math.min(dragStart.y, cursor.y),
    width: Math.abs(dragStart.x - cursor.x), height: Math.abs(dragStart.y - cursor.y)
  } : null;

  const hints = {
    rect: (fixedW && fixedH)
      ? `نقرة واحدة تضع مستطيلاً ${dimW}×${dimH}م مكانها — أو اسحب لرسم حرّ`
      : 'اسحب لرسم مستطيل — أو اكتب العرض×الطول بالأعلى ثم انقر مكانه',
    poly: `اضغط لإضافة نقطة · نقرة مزدوجة أو النقطة الأولى للإغلاق (${pts.length})`,
    wall: `اضغط نقاط المسار · النقطة الأولى تُغلقه · نقرة مزدوجة أو Enter تنهيه مفتوحاً (${pts.length})${totalM > 0 ? ' · الطول: ' + formatDim(totalM) : ''}`
  };

  return (
    <div
      className="absolute inset-0 z-50 cursor-crosshair select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (isRect) {
          const p = processPoint(raw(e), null);
          setDragStart(p); setCursor(p);
        }
      }}
      onPointerMove={(e) => {
        const anchor = isRect ? dragStart : lastPt;
        setCursor(processPoint(raw(e), anchor));
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (isRect) finishRect();
        else addPoint(processPoint(raw(e), lastPt));
      }}
    >
      {/* الخطوط والتعبئة — SVG بخطوط ثابتة السماكة */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {rectPrev && (
          <rect x={rectPrev.left} y={rectPrev.top} width={rectPrev.width} height={rectPrev.height}
            fill="rgba(37,99,235,0.10)" stroke="#2563eb" strokeWidth="2"
            strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
        )}
        {!isRect && !isWall && pts.length >= 2 && (
          <polygon points={[...pts, ...(cursor ? [cursor] : [])].map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(37,99,235,0.10)" stroke="none" />
        )}
        {segs.map((g, i) => (
          <line key={i} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y}
            stroke={g.live ? '#60a5fa' : '#2563eb'} strokeWidth="2"
            strokeDasharray={g.live ? '4 3' : undefined}
            strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
        {/* ضلع الإغلاق التلميحي للمضلّع */}
        {!isRect && !isWall && pts.length >= 2 && cursor && (
          <line x1={cursor.x} y1={cursor.y} x2={pts[0].x} y2={pts[0].y}
            stroke="#93c5fd" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* النقاط المثبّتة — عناصر HTML (دوائر سليمة لا تتشوّه) */}
      {pts.map((p, i) => (
        <div key={i}
          className={`absolute rounded-full border-2 border-white shadow pointer-events-none -translate-x-1/2 -translate-y-1/2 ${
            i === 0
              ? (nearFirst ? 'w-5 h-5 bg-green-500 ring-4 ring-green-300/60' : 'w-3.5 h-3.5 bg-blue-700')
              : 'w-2.5 h-2.5 bg-blue-500'}`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }} />
      ))}

      {/* مؤشّر الالتقاط لرأس قائم */}
      {cursor?.hit && (
        <div className="absolute w-4 h-4 rounded-full border-2 border-green-500 bg-green-400/30 pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }} />
      )}

      {/* قياسات الأضلاع بالمتر — منتصف كل ضلع */}
      {segs.map((g, i) => {
        const m = midPoint(g.a, g.b);
        return (
          <div key={i}
            className="absolute text-[9px] font-bold text-blue-800 dark:text-blue-200 bg-white/90 dark:bg-stone-900/90 rounded px-1 shadow-sm pointer-events-none -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}>
            {formatDim(segmentMeters(g.a, g.b, warehouse))}
          </div>
        );
      })}
      {rectPrev && rectPrev.width > 2 && rectPrev.height > 2 && (
        <div className="absolute text-[10px] font-bold text-blue-800 dark:text-blue-200 bg-white/90 dark:bg-stone-900/90 rounded px-1.5 py-0.5 shadow pointer-events-none -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
          style={{ left: `${rectPrev.left + rectPrev.width / 2}%`, top: `${rectPrev.top + rectPrev.height / 2}%` }}>
          {formatDim(segmentMeters({ x: 0, y: 0 }, { x: rectPrev.width, y: 0 }, warehouse))} × {formatDim(segmentMeters({ x: 0, y: 0 }, { x: 0, y: rectPrev.height }, warehouse))}
        </div>
      )}

      {/* أزرار التحكّم */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 items-center"
        onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        {isRect && (
          <span className="flex items-center gap-1 bg-white/95 dark:bg-stone-800/95 rounded-lg px-2 py-1 shadow border border-stone-300 dark:border-stone-600">
            <input type="number" inputMode="decimal" min="0" step="0.1" value={dimW}
              onChange={(e) => setDimW(e.target.value)} placeholder="العرض"
              className="w-14 text-[11px] px-1 py-0.5 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-900 dark:text-stone-200 text-center" />
            <span className="text-[10px] text-stone-500 dark:text-stone-400">×</span>
            <input type="number" inputMode="decimal" min="0" step="0.1" value={dimH}
              onChange={(e) => setDimH(e.target.value)} placeholder="الطول"
              className="w-14 text-[11px] px-1 py-0.5 border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-900 dark:text-stone-200 text-center" />
            <span className="text-[10px] text-stone-500 dark:text-stone-400">م</span>
          </span>
        )}
        {!isRect && (
          <>
            <button onClick={() => finishShape()} disabled={pts.length < (isWall ? 2 : 3)}
              className="text-[11px] bg-green-600 text-white px-3 py-1.5 rounded-lg shadow hover:bg-green-700 font-bold disabled:opacity-40">
              ✅ {isWall ? 'إنهاء الجدار' : 'إغلاق الشكل'}
            </button>
            <button onClick={() => setPts(a => a.slice(0, -1))} disabled={pts.length === 0}
              className="text-[11px] bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-600 px-3 py-1.5 rounded-lg shadow hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40">
              ↶ نقطة
            </button>
          </>
        )}
        <button onClick={onCancel}
          className="text-[11px] bg-white dark:bg-stone-800 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 px-3 py-1.5 rounded-lg shadow hover:bg-red-50 dark:hover:bg-red-950/40">
          ✕ إلغاء
        </button>
      </div>

      {/* شريط التلميح */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-blue-800 dark:text-blue-200 bg-white/90 dark:bg-stone-800/90 px-3 py-1 rounded-full font-medium text-center shadow pointer-events-none whitespace-nowrap">
        {hints[tool]}
      </div>
    </div>
  );
}
