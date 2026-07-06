// ============================================================
// ZoneInteriorEditor — التقسيم الحرّ لداخل مكان التخزين، بنفس أدوات
// الخريطة الخارجية: ⬜ مستطيل · ⬠ مضلّع · 🧱 فاصل/حدّ (خط) + تعامد
// والتقاط. كل قسم = رفّ (shelf) بموضع pos JSONB
// {top,left,width,height,kind,points?} — يتطلّب ترقية 21.
// ============================================================
import { useState, useRef, useMemo } from 'react';
import { FormModal } from './BuilderForms';
import MapDrawLayer from './MapDrawLayer';
import WallStrokeOverlay from './WallStrokeOverlay';
import MidMarks from './MidMarks';
import CenterGuides from './CenterGuides';
import useDragResize from '../lib/useDragResize';
import { rpcAddShelf, rpcUpdateShelfPos, rpcDeleteShelf } from '../lib/warehouseOps';
import { shelfDisplayName } from '../lib/helpers';

export const SHELF_KINDS = [
  { key: 'shelf',   icon: '➖', label: 'رفّ' },
  { key: 'drawer',  icon: '🗄', label: 'درج' },
  { key: 'cabinet', icon: '🗃', label: 'خزانة كبيرة' },
  { key: 'decor',   icon: '🎨', label: 'شكلية (بدون تخزين)' },
];
export function kindIcon(kind) {
  if (kind === 'divider') return '🧱';
  return SHELF_KINDS.find(k => k.key === kind)?.icon || '';
}

// الموضع الافتراضي لقسم بلا pos: صفوف متساوية فوق بعض (مطابق للعرض القديم)
export function defaultShelfRect(index, count) {
  const gap = 1.5;
  const h = (100 - gap * Math.max(count - 1, 0)) / Math.max(count, 1);
  return { top: index * (h + gap), left: 0, width: 100, height: h };
}

function toolBtnCls(active) {
  return active
    ? 'text-[11px] px-3 py-1.5 rounded-lg border border-indigo-700 bg-indigo-600 text-white font-bold shadow-sm'
    : 'text-[11px] px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 font-medium';
}

export default function ZoneInteriorEditor({ zone, shelves, boxCountForShelf, onClose, onRefresh, onDeleteShelf, flash }) {
  const containerRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState(null);          // 'rect' | 'poly' | 'wall' | null
  const [ortho, setOrtho] = useState(false);
  const [snapOn, setSnapOn] = useState(false);
  const [pendingRect, setPendingRect] = useState(null); // شكل مرسوم بانتظار التفاصيل
  // مكدس التراجع: تحريك/تحجيم/نوع (pos) وإنشاء (create)
  const [undoStack, setUndoStack] = useState([]);

  // ↩ إلغاء كل تغييرات الجلسة (يفكّ المكدس) ثم يغلق المحرّر
  async function handleCancelAll() {
    if (busy) return;
    if (undoStack.length === 0) { onClose?.(); return; }
    if (!confirm(`إلغاء التعديل سيتراجع عن كل تغييرات هذه الجلسة (${undoStack.length}). متابعة؟`)) return;
    setBusy(true);
    for (let i = undoStack.length - 1; i >= 0; i--) {
      const e = undoStack[i];
      if (e.kind === 'pos') await rpcUpdateShelfPos(e.shelfId, e.prev);
      else if (e.kind === 'create') await rpcDeleteShelf(e.shelfId);
    }
    setBusy(false);
    setUndoStack([]);
    flash?.('↩ أُلغيت كل تغييرات الجلسة');
    onRefresh?.();
    onClose?.();
  }

  async function handleUndo() {
    if (busy || undoStack.length === 0) return;
    const e = undoStack[undoStack.length - 1];
    setBusy(true);
    let error = null;
    if (e.kind === 'pos') ({ error } = await rpcUpdateShelfPos(e.shelfId, e.prev));
    else if (e.kind === 'create') ({ error } = await rpcDeleteShelf(e.shelfId));
    setBusy(false);
    if (error) return flash?.('فشل التراجع: ' + error.message, 'error');
    setUndoStack(s => s.slice(0, -1));
    flash?.('↶ تمّ التراجع');
    onRefresh?.();
  }

  // «مستودع زائف» بأبعاد المكان بالمتر — فتظهر قياسات الرسم صحيحة (سم/م)
  const pseudoWh = {
    width_m: (Number(zone.width_cm) || 100) / 100,
    depth_m: (Number(zone.height_cm) || 100) / 100
  };

  // مواضع الأقسام الحاليّة (pos أو الافتراضي)
  const rects = useMemo(
    () => shelves.map((s, i) => s.pos ?? defaultShelfRect(i, shelves.length)),
    [shelves]
  );
  // رؤوس/أضلاع الالتقاط: زوايا المكان + زوايا الأقسام (مع 🧲)
  const targets = useMemo(() => {
    const t = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 50 }, { x: 100, y: 50 }];
    rects.forEach(r => {
      t.push({ x: r.left, y: r.top }, { x: r.left + r.width, y: r.top },
        { x: r.left + r.width, y: r.top + r.height }, { x: r.left, y: r.top + r.height },
        { x: r.left + r.width / 2, y: r.top }, { x: r.left + r.width / 2, y: r.top + r.height },
        { x: r.left, y: r.top + r.height / 2 }, { x: r.left + r.width, y: r.top + r.height / 2 },
        { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    return t;
  }, [rects]);
  const segments = useMemo(() => {
    const segs = [];
    rects.forEach(r => {
      const c = [
        { x: r.left, y: r.top }, { x: r.left + r.width, y: r.top },
        { x: r.left + r.width, y: r.top + r.height }, { x: r.left, y: r.top + r.height }
      ];
      for (let i = 0; i < 4; i++) segs.push({ a: c[i], b: c[(i + 1) % 4] });
    });
    return segs;
  }, [rects]);

  // حواف الأقسام المجاورة — لصق القسم بجاره أثناء السحب/التحجيم
  function edgesExcluding(idx) {
    const x = [0, 100, 50], y = [0, 100, 50];
    rects.forEach((r, i) => {
      if (i === idx) return;
      x.push(r.left, r.left + r.width, r.left + r.width / 2);
      y.push(r.top, r.top + r.height, r.top + r.height / 2);
    });
    return { x, y };
  }

  async function savePos(shelf, rect, kind) {
    setUndoStack(s => [...s, { kind: 'pos', shelfId: shelf.id, prev: shelf.pos ?? null }]);
    setBusy(true);
    const { error } = await rpcUpdateShelfPos(shelf.id, {
      top: rect.top, left: rect.left, width: rect.width, height: rect.height,
      kind: kind ?? shelf.pos?.kind ?? 'shelf',
      // الشكل الحرّ (نقاط) يُحمَل كما هو عند التحريك/التحجيم
      ...(shelf.pos?.points ? { points: shelf.pos.points } : {})
    });
    setBusy(false);
    if (error) return flash?.('فشل الحفظ: ' + error.message + (/(update_shelf_pos|schema)/i.test(error.message) ? ' — يلزم تطبيق ترقية 21' : ''), 'error');
    onRefresh?.();
  }

  function cycleKind(shelf, rect) {
    if (shelf.pos?.kind === 'divider') return;
    const order = SHELF_KINDS.map(k => k.key);
    const cur = shelf.pos?.kind ?? 'shelf';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    savePos(shelf, rect, next);
  }

  // شكل اكتمل رسمه: الفاصل (خط) يُنشأ فوراً؛ المستطيل/المضلّع يمرّ بنموذج التفاصيل
  async function handleDrawn(geom, drawnTool) {
    if (drawnTool === 'wall') {
      setBusy(true);
      const { data: newId, error } = await rpcAddShelf(zone.id, {
        position: 'bottom', height_cm: 5, max_boxes: 1, label: 'فاصل'
      });
      if (error || !newId) { setBusy(false); return flash?.('فشل: ' + (error?.message || ''), 'error'); }
      const { error: posErr } = await rpcUpdateShelfPos(newId, {
        top: geom.top, left: geom.left, width: geom.width, height: geom.height,
        kind: 'divider', points: geom.points
      });
      setBusy(false);
      if (posErr) { await rpcDeleteShelf(newId); return flash?.('تعذّر حفظ الفاصل: ' + posErr.message, 'error'); }
      setUndoStack(s => [...s, { kind: 'create', shelfId: newId }]);
      flash?.('✅ أُضيف فاصل — ↶ للتراجع');
      onRefresh?.();
      return; // تبقى الأداة نشطة لرسم فواصل متتالية
    }
    setTool(null);
    setPendingRect(geom);
  }

  async function handleCreate(values) {
    const rect = pendingRect;
    if (!rect) return;
    setBusy(true);
    const { data: newId, error } = await rpcAddShelf(zone.id, {
      position: 'bottom',
      height_cm: Math.max(10, Math.round((rect.height / 100) * (Number(zone.height_cm) || 100))),
      max_boxes: values.kind === 'decor' ? 1 : Math.max(1, Number(values.slots) || 4),
      label: values.kind === 'decor' ? (values.label || 'شكل') : values.label
    });
    if (error || !newId) { setBusy(false); return flash?.('فشل: ' + (error?.message || 'تعذّر الإنشاء'), 'error'); }
    const { error: posErr } = await rpcUpdateShelfPos(newId, {
      top: rect.top, left: rect.left, width: rect.width, height: rect.height,
      kind: values.kind,
      ...(Array.isArray(rect.points) ? { points: rect.points } : {})
    });
    setBusy(false);
    if (posErr) {
      await rpcDeleteShelf(newId);
      return flash?.('تعذّر حفظ القسم: ' + posErr.message + ' — هل طُبِّقت ترقية 21؟', 'error');
    }
    setPendingRect(null);
    setUndoStack(s => [...s, { kind: 'create', shelfId: newId }]);
    flash?.(`✅ أُضيف ${SHELF_KINDS.find(k => k.key === values.kind)?.label || 'قسم'} — ↶ للتراجع`);
    onRefresh?.();
  }

  return (
    <FormModal
      title={`🧰 تقسيم «${zone.letter} — ${zone.name}» من الداخل`}
      subtitle="نفس أدوات الخريطة: ارسم أقساماً وفواصل بأي أشكال وأحجام · اسحب وحجّم بحريّة"
      onClose={onClose}
      maxWidth="max-w-4xl"
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <button onClick={() => setTool(t => t === 'rect' ? null : 'rect')} className={toolBtnCls(tool === 'rect')} title="اسحب لرسم قسم مستطيل">⬜ مستطيل</button>
        <button onClick={() => setTool(t => t === 'poly' ? null : 'poly')} className={toolBtnCls(tool === 'poly')} title="اضغط نقاطاً وأغلق الشكل — قسم بشكل حرّ">⬠ مضلّع</button>
        <button onClick={() => setTool(t => t === 'wall' ? null : 'wall')} className={toolBtnCls(tool === 'wall')} title="خطّ فاصل/حدّ داخل المكان — يُنشأ فور الإنهاء">🧱 فاصل</button>
        <span className="w-px h-5 bg-stone-300 dark:bg-stone-600 mx-1" />
        <button onClick={() => setSnapOn(s => !s)} className={toolBtnCls(snapOn)} title="التقاط مغناطيسي لزوايا وحوافّ الأقسام">🧲 التقاط</button>
        <button onClick={() => setOrtho(o => !o)} className={toolBtnCls(ortho)} title="تقييد الخطوط أفقيّاً/رأسيّاً/45°">∟ تعامد</button>
        <button onClick={handleUndo} disabled={busy || undoStack.length === 0}
          className={`${toolBtnCls(false)} disabled:opacity-40`} title="تراجع عن آخر تغيير (تحريك/تحجيم/نوع/إنشاء)">
          ↶ تراجع{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
        </button>
        <span className="w-px h-5 bg-stone-300 dark:bg-stone-600 mx-1" />
        <button onClick={onClose} disabled={busy}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-green-700 bg-green-600 text-white font-bold shadow-sm hover:bg-green-700 disabled:opacity-50"
          title="اعتماد كل التغييرات وإغلاق المحرّر">
          ✅ حفظ وإغلاق
        </button>
        <button onClick={handleCancelAll} disabled={busy}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50"
          title="تراجع عن كل تغييرات الجلسة ثم إغلاق">
          ↩ إلغاء التعديلات
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative w-full border-4 rounded-md bg-white dark:bg-stone-900"
        style={{ aspectRatio: `${Number(zone.width_cm) || 100} / ${Number(zone.height_cm) || 100}`, borderColor: zone.color }}
      >
        <CenterGuides />
        {shelves.map((s, i) => (
          <CompartmentTile
            key={s.id}
            shelf={s}
            shelves={shelves}
            rect={s.pos ?? defaultShelfRect(i, shelves.length)}
            color={zone.color}
            zone={zone}
            containerRef={containerRef}
            busy={busy}
            boxCount={boxCountForShelf?.(s) ?? 0}
            edges={edgesExcluding(i)}
            onGeometry={(r) => savePos(s, r)}
            onCycleKind={(r) => cycleKind(s, r)}
            onDelete={() => onDeleteShelf?.(s)}
          />
        ))}

        {tool && (
          <MapDrawLayer
            key={tool}
            containerRef={containerRef}
            warehouse={pseudoWh}
            tool={tool}
            snapX={null}
            snapY={null}
            ortho={ortho}
            targets={snapOn ? targets : []}
            segments={snapOn ? segments : []}
            onFinish={handleDrawn}
            onCancel={() => setTool(null)}
            flash={flash}
          />
        )}
      </div>

      <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-2">
        كل تغيير يُحفَظ مباشرةً · زرّ النوع على القسم يبدّله (➖/🗄/🗃) · 🗑 يحذف القسم وما فيه · أغلق النافذة للعرض الطبيعي.
      </p>

      {pendingRect && (
        <FormModal title="تفاصيل القسم الجديد" subtitle="حدّد نوعه واسمه وعدد خانات الصناديق فيه"
          onClose={() => setPendingRect(null)} maxWidth="max-w-sm">
          <NewCompartmentForm busy={busy} onCancel={() => setPendingRect(null)} onSave={handleCreate} />
        </FormModal>
      )}
    </FormModal>
  );
}

// قسم واحد داخل المحرّر: سحب/تحجيم + تبديل النوع + حذف + قياسات بالسنتيمتر
function CompartmentTile({ shelf, shelves, rect, color, zone, containerRef, busy, boxCount, edges = null, onGeometry, onCycleKind, onDelete }) {
  const isDivider = shelf.pos?.kind === 'divider';
  const isDecorKind = shelf.pos?.kind === 'decor';
  const pts = shelf.pos?.points;
  const isOpen = Array.isArray(pts) && pts[0]?.open;
  const hasPoly = !isOpen && Array.isArray(pts) && pts.length >= 3;
  const { pos, mode, begin } = useDragResize({
    rect, containerRef, enabled: true, minW: isDivider ? 1 : 4, minH: isDivider ? 1 : 4,
    edgesX: edges?.x, edgesY: edges?.y,
    onChange: (r) => onGeometry(r)
  });
  const icon = kindIcon(shelf.pos?.kind) || '➖';
  const wCm = Math.round((pos.width / 100) * (Number(zone.width_cm) || 100));
  const hCm = Math.round((pos.height / 100) * (Number(zone.height_cm) || 100));
  const strokeOnly = isDivider || isOpen;
  return (
    <div
      style={{
        top: `${pos.top}%`, left: `${pos.left}%`, width: `${pos.width}%`, height: `${pos.height}%`,
        zIndex: mode ? 40 : undefined,
        transition: mode ? 'none' : 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
        cursor: mode === 'move' ? 'grabbing' : 'grab', touchAction: 'none',
        ...(strokeOnly || hasPoly ? {} : { borderColor: color, ...(isDecorKind ? { backgroundColor: `${color}30` } : {}) })
      }}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); begin('move', e.clientX, e.clientY); }}
      onTouchStart={(e) => { const t = e.touches[0]; if (t) begin('move', t.clientX, t.clientY); }}
      className={`absolute group select-none ${strokeOnly || hasPoly ? '' : 'border-2 rounded-md bg-stone-50 dark:bg-stone-800'}`}
    >
      {strokeOnly && (
        <>
          <WallStrokeOverlay points={pts || [{ x: 0, y: 50 }, { x: 100, y: 50 }]} color={color} thickness={3} />
          <div className="absolute inset-0 border border-dashed border-blue-400/60 rounded" />
        </>
      )}
      {hasPoly && (
        <>
          <div className="absolute inset-0 bg-stone-50 dark:bg-stone-800"
            style={{ clipPath: `polygon(${pts.map(p => `${p.x}% ${p.y}%`).join(', ')})` }} />
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </>
      )}
      {!isDivider && (
        <span className="absolute -top-2.5 right-2 text-white text-[10px] px-2 py-0.5 rounded-md font-bold shadow pointer-events-none z-10 whitespace-nowrap" style={{ backgroundColor: color }}>
          {icon} {isDecorKind ? (shelf.label || 'شكل') : `${shelfDisplayName(shelf, shelves)} · ${boxCount} 📦`}
        </span>
      )}
      <span className="absolute bottom-1 right-1.5 text-[9px] font-bold text-stone-500 dark:text-stone-400 pointer-events-none">
        {wCm}×{hCm}سم
      </span>
      {!isDivider && <MidMarks />}
      <div className="absolute top-1 left-1 flex gap-1 z-20">
        {!isDivider && (
          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCycleKind(pos); }} disabled={busy}
            className="text-[11px] bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 w-6 h-6 rounded-md shadow-md hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center justify-center"
            title="تبديل النوع: رفّ ← درج ← خزانة">{icon}</button>
        )}
        <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={busy}
          className="text-[10px] bg-white dark:bg-stone-800 border border-red-300 dark:border-red-800 w-6 h-6 rounded-md shadow-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center justify-center"
          title={isDivider ? 'حذف الفاصل' : 'حذف القسم (وما فيه إلى سلّة المحذوفات)'}>🗑</button>
      </div>
      <div
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); begin('resize', e.clientX, e.clientY); }}
        onTouchStart={(e) => { e.stopPropagation(); const t = e.touches[0]; if (t) begin('resize', t.clientX, t.clientY); }}
        className="absolute bottom-0 left-0 w-5 h-5 flex items-end justify-start cursor-nesw-resize z-30"
        title="اسحب لتغيير الحجم">
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue-600 drop-shadow">
          <path d="M22 22H2v-2h2v-2H2v-2h4v-2H2v-2h6V8H2V6h8V2h2v18h2v-6h2v6h2v-4h2v4h2v2z" transform="scale(-1,1) translate(-24,0)" />
        </svg>
      </div>
    </div>
  );
}

// نموذج القسم الجديد: النوع + الاسم + عدد الخانات
function NewCompartmentForm({ busy, onCancel, onSave }) {
  const [kind, setKind] = useState('shelf');
  const [label, setLabel] = useState('');
  const [slots, setSlots] = useState(4);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ kind, label: label.trim() || null, slots }); }} className="space-y-3">
      <div>
        <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">نوع القسم</label>
        <div className="grid grid-cols-2 gap-1.5">
          {SHELF_KINDS.map(k => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)}
              className={`py-2 rounded-lg text-[11px] font-bold border transition ${kind === k.key
                ? 'bg-indigo-600 text-white border-indigo-700'
                : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700'}`}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>
      </div>
      {kind === 'decor' && (
        <p className="text-[10px] text-stone-500 dark:text-stone-400">
          🎨 جزء جمالي/زينة من المكان — يظهر بشكله فقط، بلا خانات ولا صناديق ولا دخول.
        </p>
      )}
      <div>
        <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">اسم القسم (اختياري)</label>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="مثال: درج الأدوات الصغيرة" autoFocus
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
      </div>
      {kind !== 'decor' && (
        <div>
          <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">عدد خانات الصناديق</label>
          <input type="number" min="1" max="20" value={slots} onChange={e => setSlots(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={busy}
          className="flex-1 bg-brand-blue text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-800 disabled:opacity-50">
          {busy ? '...' : '💾 إنشاء القسم'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
          إلغاء
        </button>
      </div>
    </form>
  );
}
