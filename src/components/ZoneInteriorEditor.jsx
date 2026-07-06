// ============================================================
// ZoneInteriorEditor — التقسيم الحرّ لداخل مكان التخزين.
// ارسم أقساماً (درج 🗄 / رفّ ➖ / خزانة كبيرة 🗃) بأي أحجام على واجهة
// المكان، اسحبها وغيّر أحجامها بحريّة. كل قسم = رفّ (shelf) في القاعدة
// بموضع pos JSONB {top,left,width,height,kind} — يتطلّب ترقية 21.
// ============================================================
import { useState, useRef } from 'react';
import { FormModal } from './BuilderForms';
import MapDrawLayer from './MapDrawLayer';
import useDragResize from '../lib/useDragResize';
import { rpcAddShelf, rpcUpdateShelfPos, rpcDeleteShelf } from '../lib/warehouseOps';
import { shelfDisplayName } from '../lib/helpers';

export const SHELF_KINDS = [
  { key: 'shelf',   icon: '➖', label: 'رفّ' },
  { key: 'drawer',  icon: '🗄', label: 'درج' },
  { key: 'cabinet', icon: '🗃', label: 'خزانة كبيرة' },
];
export function kindIcon(kind) {
  return SHELF_KINDS.find(k => k.key === kind)?.icon || '';
}

// الموضع الافتراضي لقسم بلا pos: صفوف متساوية فوق بعض (مطابق للعرض القديم)
export function defaultShelfRect(index, count) {
  const gap = 1.5;
  const h = (100 - gap * Math.max(count - 1, 0)) / Math.max(count, 1);
  return { top: index * (h + gap), left: 0, width: 100, height: h };
}

export default function ZoneInteriorEditor({ zone, shelves, boxCountForShelf, onClose, onRefresh, onDeleteShelf, flash }) {
  const containerRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [pendingRect, setPendingRect] = useState(null); // مستطيل مرسوم بانتظار التفاصيل

  // «مستودع زائف» بأبعاد المكان بالمتر — فتظهر قياسات الرسم صحيحة (سم/م)
  const pseudoWh = {
    width_m: (Number(zone.width_cm) || 100) / 100,
    depth_m: (Number(zone.height_cm) || 100) / 100
  };

  async function savePos(shelf, rect, kind) {
    setBusy(true);
    const { error } = await rpcUpdateShelfPos(shelf.id, {
      top: rect.top, left: rect.left, width: rect.width, height: rect.height,
      kind: kind ?? shelf.pos?.kind ?? 'shelf'
    });
    setBusy(false);
    if (error) return flash?.('فشل الحفظ: ' + error.message + (/(update_shelf_pos|schema)/i.test(error.message) ? ' — يلزم تطبيق ترقية 21' : ''), 'error');
    onRefresh?.();
  }

  function cycleKind(shelf, rect) {
    const order = SHELF_KINDS.map(k => k.key);
    const cur = shelf.pos?.kind ?? 'shelf';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    savePos(shelf, rect, next);
  }

  async function handleCreate(values) {
    const rect = pendingRect;
    if (!rect) return;
    setBusy(true);
    const { data: newId, error } = await rpcAddShelf(zone.id, {
      position: 'bottom',
      height_cm: Math.max(10, Math.round((rect.height / 100) * (Number(zone.height_cm) || 100))),
      max_boxes: Math.max(1, Number(values.slots) || 4),
      label: values.label
    });
    if (error || !newId) { setBusy(false); return flash?.('فشل: ' + (error?.message || 'تعذّر الإنشاء'), 'error'); }
    const { error: posErr } = await rpcUpdateShelfPos(newId, {
      top: rect.top, left: rect.left, width: rect.width, height: rect.height, kind: values.kind
    });
    setBusy(false);
    if (posErr) {
      await rpcDeleteShelf(newId);
      return flash?.('تعذّر حفظ القسم: ' + posErr.message + ' — هل طُبِّقت ترقية 21؟', 'error');
    }
    setPendingRect(null);
    flash?.(`✅ أُضيف ${SHELF_KINDS.find(k => k.key === values.kind)?.label || 'قسم'} جديد`);
    onRefresh?.();
  }

  return (
    <FormModal
      title={`🧰 تقسيم «${zone.letter} — ${zone.name}» من الداخل`}
      subtitle="ارسم أقساماً بأي أحجام (درج/رفّ/خزانة) · اسحب القسم لتحريكه · المقبض ◢ للتحجيم"
      onClose={onClose}
      maxWidth="max-w-4xl"
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <button onClick={() => setDrawing(d => !d)}
          className={drawing
            ? 'text-[11px] px-3 py-1.5 rounded-lg border border-indigo-700 bg-indigo-600 text-white font-bold shadow-sm'
            : 'text-[11px] px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 font-medium'}>
          ⬜ ارسم قسماً جديداً
        </button>
        <span className="text-[10px] text-stone-500 dark:text-stone-400">
          زرّ النوع على القسم يبدّله (➖ رفّ ← 🗄 درج ← 🗃 خزانة) · 🗑 يحذف القسم وما فيه
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative w-full border-4 rounded-md bg-white dark:bg-stone-900"
        style={{ aspectRatio: `${Number(zone.width_cm) || 100} / ${Number(zone.height_cm) || 100}`, borderColor: zone.color }}
      >
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
            onGeometry={(r) => savePos(s, r)}
            onCycleKind={(r) => cycleKind(s, r)}
            onDelete={() => onDeleteShelf?.(s)}
          />
        ))}

        {drawing && (
          <MapDrawLayer
            key="interior-rect"
            containerRef={containerRef}
            warehouse={pseudoWh}
            tool="rect"
            snapX={null}
            snapY={null}
            ortho={false}
            targets={[]}
            segments={[]}
            onFinish={(geom) => { setDrawing(false); setPendingRect(geom); }}
            onCancel={() => setDrawing(false)}
            flash={flash}
          />
        )}
      </div>

      <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-2">
        كل تحريك/تحجيم يُحفَظ مباشرةً. أغلق النافذة لرؤية الأقسام بمواضعها في العرض الطبيعي.
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
function CompartmentTile({ shelf, shelves, rect, color, zone, containerRef, busy, boxCount, onGeometry, onCycleKind, onDelete }) {
  const { pos, mode, begin } = useDragResize({
    rect, containerRef, enabled: true, minW: 4, minH: 4,
    onChange: (r) => onGeometry(r)
  });
  const icon = kindIcon(shelf.pos?.kind) || '➖';
  const wCm = Math.round((pos.width / 100) * (Number(zone.width_cm) || 100));
  const hCm = Math.round((pos.height / 100) * (Number(zone.height_cm) || 100));
  return (
    <div
      style={{
        top: `${pos.top}%`, left: `${pos.left}%`, width: `${pos.width}%`, height: `${pos.height}%`,
        borderColor: color, zIndex: mode ? 40 : undefined,
        transition: mode ? 'none' : 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
        cursor: mode === 'move' ? 'grabbing' : 'grab', touchAction: 'none'
      }}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); begin('move', e.clientX, e.clientY); }}
      onTouchStart={(e) => { const t = e.touches[0]; if (t) begin('move', t.clientX, t.clientY); }}
      className="absolute border-2 rounded-md bg-stone-50 dark:bg-stone-800 group select-none"
    >
      <span className="absolute -top-2.5 right-2 text-white text-[10px] px-2 py-0.5 rounded-md font-bold shadow pointer-events-none z-10 whitespace-nowrap" style={{ backgroundColor: color }}>
        {icon} {shelfDisplayName(shelf, shelves)} · {boxCount} 📦
      </span>
      <span className="absolute bottom-1 right-1.5 text-[9px] font-bold text-stone-500 dark:text-stone-400 pointer-events-none">
        {wCm}×{hCm}سم
      </span>
      <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition z-20">
        <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCycleKind(pos); }} disabled={busy}
          className="text-[11px] bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 w-6 h-6 rounded-md shadow-md hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center justify-center"
          title="تبديل النوع: رفّ ← درج ← خزانة">{icon}</button>
        <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={busy}
          className="text-[10px] bg-white dark:bg-stone-800 border border-red-300 dark:border-red-800 w-6 h-6 rounded-md shadow-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center justify-center"
          title="حذف القسم (وما فيه إلى سلّة المحذوفات)">🗑</button>
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
        <div className="grid grid-cols-3 gap-1.5">
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
      <div>
        <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">اسم القسم (اختياري)</label>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="مثال: درج الأدوات الصغيرة" autoFocus
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
      </div>
      <div>
        <label className="block text-xs text-stone-600 dark:text-stone-300 mb-1">عدد خانات الصناديق</label>
        <input type="number" min="1" max="20" value={slots} onChange={e => setSlots(parseInt(e.target.value) || 1)}
          className="w-full px-3 py-2 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded-lg text-xs" />
      </div>
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
