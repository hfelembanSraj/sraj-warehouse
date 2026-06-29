// مربّع غرض حرّ — قابل للسحب لتغيير الموقع + مقبض لتغيير الحجم
// يُستخدم في خريطة المستودع (أغراض خارج المساحات) وداخل المساحات (أغراض كبيرة على الرفّ)
// minTopPct: أصغر قيمة top مسموحة (لتقييد الغرض في منطقة معيّنة) — افتراضي 0 (حرّ كامل)
// obstacles: مستطيلات ممنوع التداخل معها (مساحات التخزين) — [{left,top,width,height} %]
import { useState, useEffect, useRef } from 'react';

function rectsOverlap(a, b) {
  return a.left < b.left + b.width &&
         a.left + a.width > b.left &&
         a.top  < b.top + b.height &&
         a.top  + a.height > b.top;
}
function hits(rect, obstacles) {
  return obstacles.some(o => rectsOverlap(rect, o));
}
// يدفع المستطيل لأسفل حتى يخرج من كل العوائق (الفراغ الحرّ تحت/حول المساحات)
function resolveBelow(rect, obstacles) {
  if (!hits(rect, obstacles)) return rect;
  let top = rect.top;
  for (let i = 0; i < 64; i++) {
    const test = { ...rect, top };
    const hit = obstacles.find(o => rectsOverlap(test, o));
    if (!hit) return test;
    top = hit.top + hit.height + 0.5;            // اقفز أسفل العائق الذي اصطدم به
    if (top + rect.height > 100) break;
  }
  return { ...rect, top: Math.max(0, 100 - rect.height) };  // احتياط: القاع
}

export default function FreeItemSquare({
  item, containerRef, isFounder,
  onEdit, onDelete, onDropped, onResized, onView,
  editMode = false, minTopPct = 0, obstacles = []
}) {
  // التحريك والتكبير والتعديل/الحذف: في وضع التعديل فقط (للمؤسّس). خارج وضع
  // التعديل: ضغطة تفتح بطاقة عرض الغرض (لكل المستخدمين).
  const canEdit = isFounder && editMode;
  const [pos, setPos] = useState({
    top:    item.pos_top    ?? Math.max(minTopPct, 40),
    left:   item.pos_left   ?? 40,
    width:  item.width_pct  ?? 12,
    height: item.height_pct ?? 12
  });
  const [mode, setMode] = useState(null);   // 'move' | 'resize' | null
  const stRef = useRef(null);
  const healedRef = useRef(false);
  const tapRef = useRef(null);              // لكشف النقرة (tap) على اللمس لفتح العرض

  useEffect(() => {
    if (!mode) {
      setPos({
        top:    item.pos_top    ?? Math.max(minTopPct, 40),
        left:   item.pos_left   ?? 40,
        width:  item.width_pct  ?? 12,
        height: item.height_pct ?? 12
      });
    }
  }, [item.pos_top, item.pos_left, item.width_pct, item.height_pct, mode, minTopPct]);

  // تصحيح ذاتي: إن كان الموقع المحفوظ متداخلاً مع مساحة تخزين، انقله للفراغ
  // الحرّ تحتها واحفظ ذلك مرّة واحدة (يُصلح الأغراض الموضوعة خطأً فوق المساحات)
  useEffect(() => {
    if (mode || obstacles.length === 0) return;
    const cur = { left: pos.left, top: pos.top, width: pos.width, height: pos.height };
    if (!hits(cur, obstacles)) { healedRef.current = false; return; }
    if (healedRef.current) return;
    healedRef.current = true;
    const fixed = resolveBelow(cur, obstacles);
    setPos(p => ({ ...p, top: fixed.top, left: fixed.left }));
    onDropped?.(item, { top: fixed.top, left: fixed.left });
  }, [mode, obstacles, pos.left, pos.top, pos.width, pos.height, item, onDropped]);

  function begin(kind, clientX, clientY) {
    if (!canEdit) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    stRef.current = {
      rect, startX: clientX, startY: clientY,
      startLeft: pos.left, startTop: pos.top,
      startW: pos.width, startH: pos.height
    };
    setMode(kind);
  }

  useEffect(() => {
    if (!mode) return;
    function handleMove(cx, cy) {
      const s = stRef.current;
      if (!s) return;
      const dxPct = ((cx - s.startX) / s.rect.width)  * 100;
      const dyPct = ((cy - s.startY) / s.rect.height) * 100;
      if (mode === 'move') {
        const newLeft = Math.max(0, Math.min(100 - s.startW, s.startLeft + dxPct));
        const maxTop = Math.max(minTopPct, 100 - s.startH);
        const newTop = Math.max(minTopPct, Math.min(maxTop, s.startTop + dyPct));
        setPos(p => {
          const desired = { left: newLeft, top: newTop, width: s.startW, height: s.startH };
          if (!hits(desired, obstacles)) return { ...p, left: newLeft, top: newTop };
          // محاصَر بمساحة تخزين — انزلق على حافّتها (أفقياً ثم عمودياً)
          const tryX = { left: newLeft, top: p.top, width: s.startW, height: s.startH };
          if (!hits(tryX, obstacles)) return { ...p, left: newLeft };
          const tryY = { left: p.left, top: newTop, width: s.startW, height: s.startH };
          if (!hits(tryY, obstacles)) return { ...p, top: newTop };
          return p;  // لا يدخل المساحة إطلاقاً
        });
      } else {
        // المقبض في الزاوية السفليّة-اليسرى: السحب لليسار يكبّر العرض، لأسفل يكبّر الطول
        const newW = Math.max(5, Math.min(70, s.startW - dxPct));
        const maxH = 100 - Math.max(minTopPct, s.startTop);
        const newH = Math.max(5, Math.min(maxH, s.startH + dyPct));
        const rightEdge = s.startLeft + s.startW;
        const newLeft = Math.max(0, rightEdge - newW);
        setPos(p => {
          const desired = { left: newLeft, top: p.top, width: newW, height: newH };
          if (hits(desired, obstacles)) return p;  // لا تكبّر الغرض داخل مساحة
          return { ...p, width: newW, height: newH, left: newLeft };
        });
      }
    }
    function onMove(e) { handleMove(e.clientX, e.clientY); }
    function onTM(e)   { if (e.touches[0]) { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); } }
    function onUp() {
      const m = mode;
      setMode(null);
      const s = stRef.current;
      stRef.current = null;
      if (!s) return;
      if (m === 'move')        onDropped?.(item, { top: pos.top, left: pos.left });
      else if (m === 'resize') onResized?.(item, { width: pos.width, height: pos.height });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTM, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTM);
      window.removeEventListener('touchend', onUp);
    };
  }, [mode, pos.top, pos.left, pos.width, pos.height, item, onDropped, onResized, minTopPct]);

  // التكديس: عدد الطبقات فوق الأساس (stack_index). 0 = غير مكدّس.
  // نرسم «بطاقات» مزاحة للأعلى-اليمين عبر box-shadow لإيحاء التكديس.
  const stack = Number(item.stack_index) || 0;
  const stackTotal = stack + 1;
  const stackShadow = stack > 0
    ? [...Array(Math.min(stack, 4))].map((_, i) =>
        `${(i + 1) * 4}px ${-(i + 1) * 5}px 0 0 ${['#eab366', '#d8954a', '#bd7733', '#9c5d22'][i] || '#9c5d22'}`
      ).join(', ') + ', 6px -7px 14px -3px rgba(0,0,0,0.45)'
    : undefined;

  const style = {
    position: 'absolute',
    top:    `${pos.top}%`,
    left:   `${pos.left}%`,
    width:  `${pos.width}%`,
    height: `${pos.height}%`,
    cursor: canEdit ? (mode === 'move' ? 'grabbing' : 'grab') : (onView ? 'pointer' : 'default'),
    zIndex: mode ? 40 : 25,
    boxShadow: stackShadow,
    // في وضع التعديل: امنع تمرير الصفحة أثناء السحب باللمس
    touchAction: canEdit ? 'none' : undefined
  };

  return (
    <div
      style={style}
      onMouseDown={canEdit ? (e) => { e.preventDefault(); e.stopPropagation(); begin('move', e.clientX, e.clientY); } : undefined}
      onTouchStart={
        canEdit
          ? (e) => { e.preventDefault(); const t = e.touches[0]; if (t) begin('move', t.clientX, t.clientY); }
          : (onView ? (e) => { const t = e.touches[0]; if (t) tapRef.current = { x: t.clientX, y: t.clientY }; } : undefined)
      }
      onTouchEnd={
        !canEdit && onView
          ? (e) => {
              const s = tapRef.current; tapRef.current = null;
              const t = e.changedTouches[0];
              // افتح العرض فقط إن كانت نقرة (حركة بسيطة) لا تمريراً
              if (s && t && Math.abs(t.clientX - s.x) < 12 && Math.abs(t.clientY - s.y) < 12) {
                e.preventDefault(); e.stopPropagation(); onView();
              }
            }
          : undefined
      }
      onClick={!canEdit && onView ? (e) => { e.stopPropagation(); onView(); } : undefined}
      className={`group rounded-md border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/40 shadow-md hover:shadow-lg transition select-none overflow-hidden ${
        mode ? 'ring-2 ring-amber-600 ring-offset-1' : ''
      }`}
      title={canEdit
        ? `${item.name} (الكميّة: ${item.quantity}) — اسحب للتحريك · المقبض ◢ لتغيير الحجم`
        : `${item.name} (الكميّة: ${item.quantity}) — اضغط للعرض`}
    >
      {item.photo_url ? (
        <img src={item.photo_url} alt={item.name} draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-800 dark:to-amber-900 pointer-events-none">
          <span className="text-[10px] font-bold text-amber-900 dark:text-amber-100 text-center px-1 leading-tight line-clamp-3">
            {item.name}
          </span>
        </div>
      )}
      <div className="absolute top-0.5 right-0.5 bg-amber-600 text-white text-[9px] font-bold px-1 py-0.5 rounded pointer-events-none">
        ×{item.quantity}
      </div>
      {stack > 0 && (
        <div className="absolute bottom-0.5 right-0.5 bg-purple-600 text-white text-[8px] font-bold px-1 py-0.5 rounded pointer-events-none shadow"
          title={`مكدّس ${stackTotal} طبقات فوق بعض`}>
          ⬆ {stackTotal}
        </div>
      )}

      {canEdit && (
        <div className="absolute top-0.5 left-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
          <button onMouseDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="w-5 h-5 rounded bg-white text-stone-700 text-[10px] hover:bg-stone-100 shadow flex items-center justify-center"
            title="تعديل">✏️</button>
          <button onMouseDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-5 h-5 rounded bg-red-500 text-white text-[10px] hover:bg-red-600 shadow flex items-center justify-center"
            title="حذف">🗑</button>
        </div>
      )}

      {canEdit && (
        <div
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); begin('resize', e.clientX, e.clientY); }}
          onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); const t = e.touches[0]; if (t) begin('resize', t.clientX, t.clientY); }}
          className="absolute bottom-0 left-0 w-5 h-5 flex items-end justify-start cursor-nesw-resize z-10"
          title="اسحب لتغيير حجم الغرض"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-amber-700 drop-shadow">
            <path d="M22 22H2v-2h2v-2H2v-2h4v-2H2v-2h6V8H2V6h8V2h2v18h2v-6h2v6h2v-4h2v4h2v2z" transform="scale(-1,1) translate(-24,0)"/>
          </svg>
        </div>
      )}
    </div>
  );
}
