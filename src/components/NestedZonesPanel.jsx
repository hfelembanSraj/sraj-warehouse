// ============================================================
// NestedZonesPanel — «مساحة داخل مساحة»: مساحات مستقلّة داخل مكان
// تخزين (دولاب فيه ٤ مستودعات مثلاً). كل مساحة داخليّة كاملة: لها
// أرففها وصناديقها وتقسيمها الحرّ 🧰 وحتى مساحات أعمق.
// الرسم بنفس أدوات الخريطة (⬜ مستطيل / ⬠ مضلّع + تعامد + التقاط).
// يتطلّب ترقية 22 (parent_zone_id).
// ============================================================
import { useState, useRef, useMemo } from 'react';
import { AddZoneForm, ConfirmDelete, FormModal } from './BuilderForms';
import MapDrawLayer from './MapDrawLayer';
import useDragResize from '../lib/useDragResize';
import MidMarks from './MidMarks';
import CenterGuides from './CenterGuides';
import { rpcAddZone, rpcUpdateZone, rpcDeleteZone, STRUCTURE_COLOR } from '../lib/warehouseOps';
import { naturalZoneRect, absPointsOfZone } from '../lib/mapDraw';

function toolBtnCls(active) {
  return active
    ? 'text-[11px] px-3 py-1.5 rounded-lg border border-indigo-700 bg-indigo-600 text-white font-bold shadow-sm'
    : 'text-[11px] px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 font-medium';
}

export default function NestedZonesPanel({
  parentZone, allZones, boxes, warehouseId,
  editMode, isFounder, onEnter, onRefresh, flash
}) {
  const containerRef = useRef(null);
  const [tool, setTool] = useState(null);          // 'rect' | 'poly' | null
  const [ortho, setOrtho] = useState(false);
  const [snapOn, setSnapOn] = useState(false);
  const [pendingGeom, setPendingGeom] = useState(null); // شكل مرسوم بانتظار نموذج المساحة
  const [askType, setAskType] = useState(false);        // اختيار: تخزين 📦 أم شكلية 🎨
  const [confirmDel, setConfirmDel] = useState(null);
  // مكدس التراجع: تحريك/تحجيم (geom) وإنشاء (create)
  const [undoStack, setUndoStack] = useState([]);

  function snapGeom(z) {
    return {
      pos_top: z.pos_top ?? null, pos_left: z.pos_left ?? null, pos_right: z.pos_right ?? null,
      pos_width: z.pos_width ?? null, pos_height: z.pos_height ?? null, points: z.points ?? null
    };
  }

  // ↩ إلغاء كل تغييرات الجلسة في هذه اللوحة
  async function handleCancelAll() {
    if (busy || undoStack.length === 0) return;
    if (!confirm(`سيتراجع عن كل تغييرات هذه الجلسة (${undoStack.length}). متابعة؟`)) return;
    setBusy(true);
    for (let i = undoStack.length - 1; i >= 0; i--) {
      const e = undoStack[i];
      if (e.kind === 'geom') {
        const g = e.prev;
        await rpcUpdateZone({ id: e.zoneId, pos_left: g.pos_left, pos_right: g.pos_right }, { ...g, points: g.points });
      } else if (e.kind === 'create') {
        await rpcDeleteZone(e.zoneId);
      }
    }
    setBusy(false);
    setUndoStack([]);
    flash?.('↩ أُلغيت كل تغييرات الجلسة');
    onRefresh?.();
  }

  async function handleUndo() {
    if (busy || undoStack.length === 0) return;
    const e = undoStack[undoStack.length - 1];
    setBusy(true);
    let error = null;
    if (e.kind === 'geom') {
      const g = e.prev;
      ({ error } = await rpcUpdateZone({ id: e.zoneId, pos_left: g.pos_left, pos_right: g.pos_right }, { ...g, points: g.points }));
    } else if (e.kind === 'create') {
      ({ error } = await rpcDeleteZone(e.zoneId));
    }
    setBusy(false);
    if (error) return flash?.('فشل التراجع: ' + error.message, 'error');
    setUndoStack(s => s.slice(0, -1));
    flash?.('↶ تمّ التراجع');
    onRefresh?.();
  }
  const [busy, setBusy] = useState(false);
  // اللوحة مطويّة افتراضيّاً حين لا توجد مساحات داخليّة — كي لا تُلتبس
  // بواجهة الأرفف وتبدو «مساحة ثانية». تُفتح بزرّ صريح فقط.
  const [expanded, setExpanded] = useState(false);

  const children = (allZones || []).filter(z => z.parent_zone_id === parentZone.id);
  const canEdit = editMode && isFounder;

  // «مستودع زائف» بأبعاد المكان بالمتر (لقياسات الرسم)
  const pseudoWh = {
    width_m: (Number(parentZone.width_cm) || 100) / 100,
    depth_m: (Number(parentZone.height_cm) || 100) / 100
  };

  // رؤوس/أضلاع الالتقاط من المساحات الداخليّة القائمة
  const targets = useMemo(() => {
    const t = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    children.forEach(z => absPointsOfZone(naturalZoneRect(z), z.points).forEach(p => t.push(p)));
    return t;
  }, [children]);
  const segments = useMemo(() => {
    const segs = [];
    children.forEach(z => {
      const pts = absPointsOfZone(naturalZoneRect(z), z.points);
      for (let i = 0; i < pts.length; i++) segs.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
    });
    return segs;
  }, [children]);

  // حواف المساحات الشقيقة — لصق المساحة بجارتها أثناء السحب/التحجيم
  function edgesExcluding(id) {
    const x = [0, 100, 50], y = [0, 100, 50];
    children.forEach(z => {
      if (z.id === id) return;
      const r = naturalZoneRect(z);
      x.push(r.left, r.left + r.width, r.left + r.width / 2);
      y.push(r.top, r.top + r.height, r.top + r.height / 2);
    });
    return { x, y };
  }

  if (children.length === 0 && !canEdit) return null;

  // لا مساحات داخليّة بعد: زرّ صغير صريح فقط — لا لوحة رسم ظاهرة
  if (children.length === 0 && !expanded) {
    return (
      <div className="flex justify-center mb-3">
        <button onClick={() => setExpanded(true)}
          className="text-[11px] px-4 py-2 rounded-lg border border-dashed border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-800/60 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700">
          + 🚪 مساحات داخل هذا المكان (اختياري — مثل دولاب فيه عدّة مستودعات)
        </button>
      </div>
    );
  }

  async function handleCreate(values) {
    const geom = pendingGeom;
    if (!geom) return;
    if ((allZones || []).find(z => z.letter === values.letter.toUpperCase())) {
      return flash?.('هذا الحرف موجود — اختر حرفاً آخر', 'error');
    }
    setBusy(true);
    const { data: newId, error } = await rpcAddZone(warehouseId, { ...values, parent_id: parentZone.id });
    if (error || !newId) {
      setBusy(false);
      return flash?.('فشل: ' + (error?.message || 'تعذّر الإنشاء') + (/(zone_parent|schema)/i.test(error?.message || '') ? ' — يلزم تطبيق ترقية 22' : ''), 'error');
    }
    const { error: posErr } = await rpcUpdateZone({ id: newId }, {
      pos_top: geom.top, pos_left: geom.left, pos_right: null,
      pos_width: geom.width, pos_height: geom.height,
      ...(Array.isArray(geom.points) ? { points: geom.points } : {})
    });
    setBusy(false);
    if (posErr) {
      await rpcDeleteZone(newId);
      return flash?.('تعذّر حفظ الشكل: ' + posErr.message, 'error');
    }
    setPendingGeom(null);
    setUndoStack(s => [...s, { kind: 'create', zoneId: newId }]);
    flash?.(`✅ أُنشئت مساحة داخليّة: ${values.letter.toUpperCase()} — ${values.name} — ↶ للتراجع`);
    onRefresh?.();
  }

  // مساحة شكليّة/جماليّة (بدون تخزين) — عنصر رصاصي بالشكل المرسوم
  async function createDecor(geom) {
    if (!geom) return;
    const used = new Set((allZones || []).map(z => z.letter));
    let letter = null;
    for (let i = 65; i <= 90 && !letter; i++) {
      const c = String.fromCharCode(i);
      if (!used.has(c)) letter = c;
    }
    for (let n = 2; n <= 99 && !letter; n++) {
      const c = `W${n}`;
      if (!used.has(c)) letter = c;
    }
    if (!letter) return flash?.('نفدت الحروف المتاحة', 'error');
    setBusy(true);
    const { data: newId, error } = await rpcAddZone(warehouseId, {
      letter, name: 'عنصر', color: STRUCTURE_COLOR,
      width_cm: 100, height_cm: 100, depth_cm: 30, shelves_count: 0,
      parent_id: parentZone.id
    });
    if (error || !newId) { setBusy(false); return flash?.('فشل: ' + (error?.message || ''), 'error'); }
    const { error: posErr } = await rpcUpdateZone({ id: newId }, {
      pos_top: geom.top, pos_left: geom.left, pos_right: null,
      pos_width: geom.width, pos_height: geom.height,
      ...(Array.isArray(geom.points) ? { points: geom.points } : {})
    });
    setBusy(false);
    if (posErr) { await rpcDeleteZone(newId); return flash?.('تعذّر حفظ الشكل: ' + posErr.message, 'error'); }
    setPendingGeom(null);
    setAskType(false);
    setUndoStack(s => [...s, { kind: 'create', zoneId: newId }]);
    flash?.('✅ أُضيفت مساحة شكليّة — ↶ للتراجع');
    onRefresh?.();
  }

  // 📦 مساحة شكليّة → تخزين: مساحة جديدة بنفس الشكل ثم حذف الشكليّة
  const [convertingChild, setConvertingChild] = useState(null);
  async function handleChildConvertSave(values) {
    const src = convertingChild;
    if (!src || busy) return;
    if ((allZones || []).find(z => z.letter === values.letter.toUpperCase())) {
      return flash?.('هذا الحرف موجود — اختر حرفاً آخر', 'error');
    }
    setBusy(true);
    const { data: newId, error } = await rpcAddZone(warehouseId, { ...values, parent_id: parentZone.id });
    if (error || !newId) { setBusy(false); return flash?.('فشل: ' + (error?.message || ''), 'error'); }
    const r = naturalZoneRect(src);
    const pts = Array.isArray(src.points) && src.points.length >= 2
      ? src.points.map(({ label, ...p }) => ({ ...p })) : null;
    const { error: posErr } = await rpcUpdateZone({ id: newId }, {
      pos_top: r.top, pos_left: r.left, pos_right: null,
      pos_width: r.width, pos_height: r.height,
      ...(pts ? { points: pts } : {})
    });
    if (posErr) { await rpcDeleteZone(newId); setBusy(false); return flash?.('تعذّر نقل الشكل: ' + posErr.message, 'error'); }
    const { error: delErr } = await rpcDeleteZone(src.id);
    setBusy(false);
    setConvertingChild(null);
    if (delErr) flash?.('⚠️ أُنشئت لكن تعذّر حذف الشكل القديم: ' + delErr.message, 'error');
    else flash?.(`✅ صارت تخزيناً: ${values.letter.toUpperCase()} — ${values.name}`);
    onRefresh?.();
  }

  // 🎨 مساحة تخزين → شكليّة (يشترط أن تكون فارغة)
  async function makeChildDecor(child) {
    const bx = (boxes || []).filter(b => b.code.startsWith(child.letter + '-')).length;
    if (bx > 0) return flash?.(`لا يمكن جعلها شكليّة وفيها ${bx} صندوق — أفرغها أولاً`, 'error');
    if ((allZones || []).some(z => z.parent_zone_id === child.id)) {
      return flash?.('فيها مساحات داخليّة — احذفها أولاً', 'error');
    }
    setBusy(true);
    const { error } = await rpcUpdateZone(child, { color: STRUCTURE_COLOR });
    setBusy(false);
    if (error) return flash?.('فشل: ' + error.message, 'error');
    flash?.('🎨 صارت شكليّة — زرّ 📦 يعيدها تخزيناً');
    onRefresh?.();
  }

  async function saveGeom(child, rect) {
    setUndoStack(s => [...s, { kind: 'geom', zoneId: child.id, prev: snapGeom(child) }]);
    const { error } = await rpcUpdateZone(child, {
      pos_top: rect.top, pos_left: rect.left, pos_right: null,
      pos_width: rect.width, pos_height: rect.height
    });
    if (error) return flash?.('فشل حفظ الموضع: ' + error.message, 'error');
    onRefresh?.();
  }

  async function handleDelete() {
    setBusy(true);
    const { error } = await rpcDeleteZone(confirmDel.id);
    setBusy(false);
    setConfirmDel(null);
    if (error) return flash?.('فشل الحذف: ' + error.message, 'error');
    flash?.('✅ حُذفت المساحة الداخليّة');
    onRefresh?.();
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="text-xs font-bold dark:text-stone-300">
          🚪 مساحات داخل هذا المكان {children.length > 0 && `(${children.length})`}
          <span className="font-normal text-[10px] text-stone-500 dark:text-stone-400 mr-2">
            {canEdit ? 'ارسم مساحة داخليّة أو اسحب/حجّم القائمة' : children.length > 0 ? 'اضغط أيّ مساحة لدخولها' : ''}
          </span>
        </h3>
        {canEdit && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setTool(t => t === 'rect' ? null : 'rect')} className={toolBtnCls(tool === 'rect')} title="اسحب لرسم مساحة مستطيلة">⬜ مستطيل</button>
            <button onClick={() => setTool(t => t === 'poly' ? null : 'poly')} className={toolBtnCls(tool === 'poly')} title="اضغط نقاطاً وأغلق — مساحة بشكل حرّ">⬠ مضلّع</button>
            <button onClick={() => setSnapOn(s => !s)} className={toolBtnCls(snapOn)} title="التقاط لزوايا وحوافّ المساحات">🧲</button>
            <button onClick={() => setOrtho(o => !o)} className={toolBtnCls(ortho)} title="تعامد 45°">∟</button>
            <button onClick={handleUndo} disabled={busy || undoStack.length === 0}
              className={`${toolBtnCls(false)} disabled:opacity-40`} title="تراجع عن آخر تغيير">
              ↶{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
            </button>
            <button onClick={handleCancelAll} disabled={busy || undoStack.length === 0}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-40"
              title="تراجع عن كل تغييرات هذه الجلسة">
              ↩ إلغاء الكل
            </button>
            {children.length === 0 && (
              <button onClick={() => { setExpanded(false); setTool(null); }}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700">
                ✕ إخفاء
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <div
          ref={containerRef}
          className="relative w-full max-w-md border-4 rounded-md bg-stone-50 dark:bg-stone-900"
          style={{ aspectRatio: `${Number(parentZone.width_cm) || 100} / ${Number(parentZone.height_cm) || 100}`, borderColor: parentZone.color }}
        >
          {canEdit && <CenterGuides />}
          {children.length === 0 && !tool && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-stone-400 pointer-events-none text-center px-4">
              لا توجد مساحات داخليّة بعد — ارسم أوّل مساحة بأداة ⬜ أو ⬠
            </div>
          )}

          {children.map(child => (
            <ChildZoneTile
              key={child.id}
              zone={child}
              boxCount={(boxes || []).filter(b => b.code.startsWith(child.letter + '-')).length}
              containerRef={containerRef}
              canEdit={canEdit}
              busy={busy}
              edges={edgesExcluding(child.id)}
              onEnter={() => onEnter?.(child)}
              onGeometry={(r) => saveGeom(child, r)}
              onDelete={() => setConfirmDel(child)}
              onConvert={() => setConvertingChild(child)}
              onMakeDecor={() => makeChildDecor(child)}
            />
          ))}

          {canEdit && tool && (
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
              onFinish={(geom) => { setTool(null); setPendingGeom(geom); setAskType(true); }}
              onCancel={() => setTool(null)}
              flash={flash}
            />
          )}
        </div>
      </div>

      {/* اختيار نوع الشكل المرسوم: تخزين 📦 أم شكلية 🎨 */}
      {pendingGeom && askType && (
        <FormModal title="ما نوع هذا المكان؟" subtitle="اختر ليُضاف بالشكل الذي رسمته"
          onClose={() => { setPendingGeom(null); setAskType(false); }} maxWidth="max-w-sm">
          <div className="grid gap-2">
            <button onClick={() => setAskType(false)} disabled={busy}
              className="flex items-center gap-3 p-3 rounded-lg border-2 border-brand-blue/60 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-right disabled:opacity-50">
              <span className="text-xl">📦</span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-brand-navy dark:text-blue-200">مساحة تخزين</span>
                <span className="block text-[11px] text-stone-500 dark:text-stone-400">تدخلها وتخزّن فيها — لها حرف واسم وأقسام</span>
              </span>
            </button>
            <button onClick={() => createDecor(pendingGeom)} disabled={busy}
              className="flex items-center gap-3 p-3 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-right disabled:opacity-50">
              <span className="text-xl">🎨</span>
              <span className="flex-1">
                <span className="block text-sm font-bold dark:text-stone-200">مساحة شكليّة (بدون تخزين)</span>
                <span className="block text-[11px] text-stone-500 dark:text-stone-400">جزء جمالي/زينة من الدولاب — رصاصي وغير قابل للضغط</span>
              </span>
            </button>
          </div>
        </FormModal>
      )}

      {pendingGeom && !askType && (
        <FormModal
          title="🚪 مساحة داخليّة جديدة"
          subtitle="ستُنشأ داخل هذا المكان بالشكل الذي رسمته — مساحة مستقلّة كاملة"
          onClose={() => setPendingGeom(null)}
          maxWidth="max-w-lg"
        >
          <AddZoneForm
            busy={busy}
            existingLetters={(allZones || []).map(z => z.letter)}
            onCancel={() => setPendingGeom(null)}
            onSave={handleCreate}
          />
        </FormModal>
      )}

      {/* 📦 تحويل مساحة شكليّة إلى تخزين */}
      {convertingChild && (
        <FormModal
          title={`📦 تحويل الشكل إلى مساحة تخزين`}
          subtitle="ستحتفظ بشكلها وموقعها — حدّد الحرف والاسم وعدد الأرفف"
          onClose={() => setConvertingChild(null)}
          maxWidth="max-w-lg"
        >
          <AddZoneForm
            busy={busy}
            existingLetters={(allZones || []).map(z => z.letter)}
            onCancel={() => setConvertingChild(null)}
            onSave={handleChildConvertSave}
          />
        </FormModal>
      )}

      {confirmDel && (
        <ConfirmDelete
          message={(() => {
            const bx = (boxes || []).filter(b => b.code.startsWith(confirmDel.letter + '-')).length;
            const kids = (allZones || []).filter(z => z.parent_zone_id === confirmDel.id).length;
            return `ستُحذف المساحة الداخليّة «${confirmDel.letter} — ${confirmDel.name}» وبداخلها: ${bx} صندوق (بكل أغراضها)${kids > 0 ? ` و${kids} مساحة داخليّة` : ''} وكل أقسامها. الصناديق والأغراض تذهب لسلّة المحذوفات ويمكن استرجاعها. هل أنت متأكّد؟`;
          })()}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// مساحة داخليّة واحدة: دخول بالضغط · سحب/تحجيم وحذف في وضع التعديل
function ChildZoneTile({ zone, boxCount, containerRef, canEdit, busy, edges = null, onEnter, onGeometry, onDelete, onConvert, onMakeDecor }) {
  const rect = naturalZoneRect(zone);
  const { pos, mode, begin } = useDragResize({
    rect, containerRef, enabled: canEdit, minW: 4, minH: 4,
    edgesX: edges?.x, edgesY: edges?.y,
    onChange: (r) => onGeometry(r)
  });
  const r = canEdit ? pos : rect;
  const isOpenWall = Array.isArray(zone.points) && zone.points[0]?.open;
  const hasPoly = !isOpenWall && Array.isArray(zone.points) && zone.points.length >= 3;
  const polyClip = hasPoly ? `polygon(${zone.points.map(p => `${p.x}% ${p.y}%`).join(', ')})` : undefined;
  // مساحة شكليّة/جماليّة (رصاصيّة): تُعرض بلا حرف ولا عدّاد وغير قابلة للضغط
  const isDecor = (zone.color || '').toUpperCase() === STRUCTURE_COLOR.toUpperCase();
  return (
    <div
      style={{
        top: `${r.top}%`, left: `${r.left}%`, width: `${r.width}%`, height: `${r.height}%`,
        zIndex: mode ? 40 : undefined,
        transition: mode ? 'none' : 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
        cursor: canEdit ? (mode === 'move' ? 'grabbing' : 'grab') : (isDecor ? 'default' : 'pointer'),
        touchAction: canEdit ? 'none' : undefined
      }}
      onMouseDown={canEdit ? (e) => { e.preventDefault(); e.stopPropagation(); begin('move', e.clientX, e.clientY); } : undefined}
      onTouchStart={canEdit ? (e) => { const t = e.touches[0]; if (t) begin('move', t.clientX, t.clientY); } : undefined}
      onClick={(!canEdit && !isDecor) ? onEnter : undefined}
      title={(!canEdit && !isDecor) ? `اضغط لدخول ${zone.letter} — ${zone.name}` : undefined}
      className={`absolute group select-none ${canEdit ? 'ring-1 ring-blue-400/70' : (isDecor ? '' : 'hover:scale-[1.02] transition-transform')}`}
    >
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center overflow-hidden ${hasPoly ? '' : 'border-2 rounded-lg'}`}
        style={{
          clipPath: polyClip,
          borderColor: hasPoly ? 'transparent' : zone.color,
          backgroundImage: zone.photo_url
            ? `url(${zone.photo_url})`
            : (isDecor ? 'none' : `linear-gradient(135deg, ${zone.color}26 0%, var(--tile-bg) 60%)`),
          backgroundSize: zone.photo_url ? 'cover' : undefined,
          backgroundPosition: zone.photo_url ? 'center' : undefined,
          backgroundColor: isDecor && !zone.photo_url ? `${zone.color}55` : undefined
        }}
      >
        {!isDecor && (
          <>
            {!(zone.name && zone.name !== zone.letter) && (
              <div className="text-xl font-display font-bold leading-none drop-shadow-sm" style={{ color: zone.color }}>{zone.letter}</div>
            )}
            {zone.name !== zone.letter && (
              <div className="mt-0.5 text-[9px] font-semibold rounded-full px-1.5 py-0.5 shadow-sm leading-tight text-center"
                style={{ backgroundColor: 'var(--tile-pill-bg)', color: 'var(--tile-pill-text)' }}>
                {zone.name}
              </div>
            )}
            <div className="text-[8px] text-stone-500 dark:text-stone-400 mt-0.5">{boxCount} 📦</div>
          </>
        )}
      </div>
      {hasPoly && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={zone.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke={zone.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {canEdit && <MidMarks />}
      {canEdit && (
        <>
          <div className="absolute top-1 left-1 flex gap-1 z-20">
            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={busy}
              className="text-[10px] bg-white dark:bg-stone-800 border border-red-300 dark:border-red-800 w-6 h-6 rounded-md shadow-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center justify-center"
              title="حذف المساحة الداخليّة">🗑</button>
            {isDecor ? (
              <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onConvert?.(); }} disabled={busy}
                className="text-[10px] bg-amber-100 dark:bg-amber-900/50 border border-amber-400 dark:border-amber-700 w-6 h-6 rounded-md shadow-md hover:bg-amber-200 dark:hover:bg-amber-900 flex items-center justify-center"
                title="تحويلها إلى مساحة تخزين (بنفس شكلها)">📦</button>
            ) : (
              <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onMakeDecor?.(); }} disabled={busy}
                className="text-[10px] bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 w-6 h-6 rounded-md shadow-md hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center justify-center"
                title="جعلها شكليّة (بدون تخزين) — يشترط أن تكون فارغة">🎨</button>
            )}
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
        </>
      )}
    </div>
  );
}
