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
import { rpcAddZone, rpcUpdateZone, rpcDeleteZone } from '../lib/warehouseOps';
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
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);

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

  if (children.length === 0 && !canEdit) return null;

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
    flash?.(`✅ أُنشئت مساحة داخليّة: ${values.letter.toUpperCase()} — ${values.name}`);
    onRefresh?.();
  }

  async function saveGeom(child, rect) {
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
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <div
          ref={containerRef}
          className="relative w-full max-w-md border-4 rounded-md bg-stone-50 dark:bg-stone-900"
          style={{ aspectRatio: `${Number(parentZone.width_cm) || 100} / ${Number(parentZone.height_cm) || 100}`, borderColor: parentZone.color }}
        >
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
              onEnter={() => onEnter?.(child)}
              onGeometry={(r) => saveGeom(child, r)}
              onDelete={() => setConfirmDel(child)}
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
              onFinish={(geom) => { setTool(null); setPendingGeom(geom); }}
              onCancel={() => setTool(null)}
              flash={flash}
            />
          )}
        </div>
      </div>

      {pendingGeom && (
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

      {confirmDel && (
        <ConfirmDelete
          message={`ستُحذف المساحة الداخليّة ${confirmDel.letter} — ${confirmDel.name} مع كل أرففها وصناديقها. هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// مساحة داخليّة واحدة: دخول بالضغط · سحب/تحجيم وحذف في وضع التعديل
function ChildZoneTile({ zone, boxCount, containerRef, canEdit, busy, onEnter, onGeometry, onDelete }) {
  const rect = naturalZoneRect(zone);
  const { pos, mode, begin } = useDragResize({
    rect, containerRef, enabled: canEdit, minW: 4, minH: 4,
    onChange: (r) => onGeometry(r)
  });
  const r = canEdit ? pos : rect;
  const isOpenWall = Array.isArray(zone.points) && zone.points[0]?.open;
  const hasPoly = !isOpenWall && Array.isArray(zone.points) && zone.points.length >= 3;
  const polyClip = hasPoly ? `polygon(${zone.points.map(p => `${p.x}% ${p.y}%`).join(', ')})` : undefined;
  return (
    <div
      style={{
        top: `${r.top}%`, left: `${r.left}%`, width: `${r.width}%`, height: `${r.height}%`,
        zIndex: mode ? 40 : undefined,
        transition: mode ? 'none' : 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
        cursor: canEdit ? (mode === 'move' ? 'grabbing' : 'grab') : 'pointer',
        touchAction: canEdit ? 'none' : undefined
      }}
      onMouseDown={canEdit ? (e) => { e.preventDefault(); e.stopPropagation(); begin('move', e.clientX, e.clientY); } : undefined}
      onTouchStart={canEdit ? (e) => { const t = e.touches[0]; if (t) begin('move', t.clientX, t.clientY); } : undefined}
      onClick={!canEdit ? onEnter : undefined}
      title={!canEdit ? `اضغط لدخول ${zone.letter} — ${zone.name}` : undefined}
      className={`absolute group select-none ${canEdit ? 'ring-1 ring-blue-400/70' : 'hover:scale-[1.02] transition-transform'}`}
    >
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center overflow-hidden ${hasPoly ? '' : 'border-2 rounded-lg'}`}
        style={{
          clipPath: polyClip,
          borderColor: hasPoly ? 'transparent' : zone.color,
          backgroundImage: `linear-gradient(135deg, ${zone.color}26 0%, var(--tile-bg) 60%)`
        }}
      >
        <div className="text-xl font-display font-bold leading-none drop-shadow-sm" style={{ color: zone.color }}>{zone.letter}</div>
        <div className="mt-0.5 text-[9px] font-semibold rounded-full px-1.5 py-0.5 shadow-sm leading-tight text-center"
          style={{ backgroundColor: 'var(--tile-pill-bg)', color: 'var(--tile-pill-text)' }}>
          {zone.name}
        </div>
        <div className="text-[8px] text-stone-500 dark:text-stone-400 mt-0.5">{boxCount} 📦</div>
      </div>
      {hasPoly && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={zone.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke={zone.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {canEdit && (
        <>
          <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition z-20">
            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={busy}
              className="text-[10px] bg-white dark:bg-stone-800 border border-red-300 dark:border-red-800 w-6 h-6 rounded-md shadow-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center justify-center"
              title="حذف المساحة الداخليّة">🗑</button>
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
