// مُنتقي مكان موحّد: يُعرض في مودال ويعرض خريطة المستودع كاملة
//   - mode 'box':  يختار المستخدم مساحة → ثمّ موقعاً شاغراً في رفّ
//   - mode 'item': يختار المستخدم مساحة → ثمّ صندوقاً موجوداً
// يحذِّر إذا المساحة "ممتلئة" (لا مواقع شاغرة) للصناديق، أو "بدون صناديق" للأغراض.

import { useState } from 'react';
import { FormModal } from './BuilderForms';
import { shelfDisplayName } from '../lib/helpers';

export default function LocationPicker({
  mode,                  // 'box' | 'item'
  data,
  activeWarehouse,
  onSelect,
  onCancel,
  initialZone = null,    // المساحة المُختارة مسبقاً (لتخطّي الخطوة 1)
  lockZone = false,      // هل المساحة الأوّليّة مقفلة (لا يمكن تغييرها؟)
  title: customTitle,    // عنوان مخصّص (للنقل)
  subtitle: customSubtitle
}) {
  const [selectedZone, setSelectedZone] = useState(initialZone);
  const zones = data.zones || [];

  const title = customTitle || (mode === 'box'
    ? '📦 اختيار مكان للصندوق'
    : '🔧 اختيار مكان للغرض');

  const defaultSubtitle = !selectedZone
    ? 'اختر المساحة من خريطة المستودع'
    : mode === 'box'
      ? `اختر موقعاً شاغراً في مساحة ${selectedZone.letter} — ${selectedZone.name}`
      : `اختر صندوقاً في مساحة ${selectedZone.letter} — ${selectedZone.name}`;
  const subtitle = customSubtitle || defaultSubtitle;

  function getZoneStatus(zone) {
    const zoneBoxes = data.boxes.filter(b => b.code.startsWith(zone.letter + '-'));
    const shelves = zone.shelves || [];
    if (mode === 'box') {
      if (shelves.length === 0) {
        return { full: true, label: 'لا توجد أرفف', color: 'red' };
      }
      const totalCap = shelves.reduce((s, sh) => s + (sh.max_boxes || 0), 0);
      const used = zoneBoxes.length;
      const available = totalCap - used;
      if (available <= 0) {
        return { full: true, label: 'ممتلئة 🚫', color: 'red' };
      }
      return { full: false, label: `${available} مكان متاح`, color: 'green' };
    }
    // mode === 'item'
    if (zoneBoxes.length === 0) {
      return { full: true, label: 'لا توجد صناديق', color: 'red' };
    }
    return { full: false, label: `${zoneBoxes.length} صندوق`, color: 'green' };
  }

  return (
    <FormModal title={title} subtitle={subtitle} onClose={onCancel} maxWidth="max-w-3xl">
      {!selectedZone ? (
        <ZonePickerStep
          zones={zones}
          activeWarehouse={activeWarehouse}
          getZoneStatus={getZoneStatus}
          onPick={setSelectedZone}
        />
      ) : mode === 'box' ? (
        <PositionPickerStep
          zone={selectedZone}
          data={data}
          onPick={(shelf, position) => onSelect({ zone: selectedZone, shelf, position })}
          onBack={lockZone ? null : () => setSelectedZone(null)}
        />
      ) : (
        <BoxPickerStep
          zone={selectedZone}
          data={data}
          onPick={(box) => onSelect({ zone: selectedZone, box })}
          onBack={lockZone ? null : () => setSelectedZone(null)}
        />
      )}
    </FormModal>
  );
}

// ====== الخطوة 1: اختيار المساحة (خريطة المستودع كاملة) ======
function ZonePickerStep({ zones, activeWarehouse, getZoneStatus, onPick }) {
  if (zones.length === 0) {
    return (
      <div className="text-center py-8 text-stone-500">
        <div className="text-3xl mb-2">📭</div>
        <p className="text-sm">لا توجد مساحات في هذا المستودع. أنشئ مساحة أوّلاً.</p>
      </div>
    );
  }
  return (
    <>
      <div className="bg-stone-50 rounded-xl p-2 mb-2 border border-stone-200">
        <div className="relative w-full max-w-xl mx-auto aspect-square bg-gradient-to-br from-stone-50 to-stone-100 rounded-xl border-2 border-dashed border-stone-300 px-3 py-7">
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] text-stone-400 font-medium tracking-widest">الجدار الخلفي</div>

          {zones.map(z => {
            const status = getZoneStatus(z);
            const style = {
              top:    z.pos_top    != null ? `${z.pos_top}%`    : undefined,
              bottom: (z.pos_top == null && z.pos_height != null) ? `${100 - z.pos_height - 6}%` : undefined,
              left:   z.pos_left   != null ? `${z.pos_left}%`   : undefined,
              right:  z.pos_right  != null ? `${z.pos_right}%`  : undefined,
              width:  z.pos_width  != null ? `${z.pos_width}%`  : undefined,
              height: z.pos_height != null ? `${z.pos_height}%` : undefined,
              borderColor: z.color,
              backgroundColor: status.full ? '#f3f4f6' : z.color + '15',
              cursor: status.full ? 'not-allowed' : 'pointer',
              opacity: status.full ? 0.55 : 1
            };
            return (
              <button
                key={z.id}
                style={style}
                disabled={status.full}
                onClick={() => onPick(z)}
                className="absolute border-2 rounded-xl flex flex-col items-center justify-center transition hover:scale-105 hover:shadow-lg disabled:hover:scale-100 disabled:hover:shadow-none"
              >
                <div className="text-2xl font-display font-bold leading-none" style={{ color: z.color }}>
                  {z.letter}
                </div>
                <div className="text-[10px] text-stone-700 mt-1 font-semibold text-center leading-tight px-1">
                  {z.name}
                </div>
                <span className={`mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  status.color === 'red'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {status.label}
                </span>
              </button>
            );
          })}

          <div className="absolute -bottom-px left-1/2 -translate-x-1/2 bg-white border border-stone-300 border-b-0 rounded-t-xl px-5 py-1 text-[10px] text-stone-600 font-medium">
            🚪 المدخل
          </div>
        </div>
      </div>
      <p className="text-[11px] text-stone-500 text-center">اضغط على مساحة (المساحات الرماديّة ممتلئة ولا يمكن اختيارها)</p>
    </>
  );
}

// ====== الخطوة 2 (للصناديق): اختيار موقع شاغر ======
function PositionPickerStep({ zone, data, onPick, onBack }) {
  const shelves = (zone.shelves || []).slice().sort((a, b) => a.shelf_index - b.shelf_index);
  const zoneBoxes = data.boxes.filter(b => b.code.startsWith(zone.letter + '-'));

  function getShelfBoxes(shelfIndex) {
    return zoneBoxes.filter(b => b.code.split('-')[1] === String(shelfIndex));
  }

  return (
    <>
      {onBack && (
        <button onClick={onBack}
          className="text-[11px] mb-3 px-3 py-1 border border-stone-300 rounded-lg hover:bg-stone-100 inline-flex items-center gap-1">
          ← الرجوع لاختيار المساحة
        </button>
      )}

      <div className="space-y-3">
        {shelves.map(sh => {
          const shelfBoxes = getShelfBoxes(sh.shelf_index);
          const totalSlots = sh.max_boxes || 4;
          const fullShelf = shelfBoxes.length >= totalSlots;
          return (
            <div key={sh.id} className="bg-stone-50 border-2 rounded-xl p-2.5" style={{ borderColor: zone.color + '50' }}>
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="font-display font-bold" style={{ color: zone.color }}>
                  📚 {shelfDisplayName(sh, shelves)}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${fullShelf ? 'bg-red-100 text-red-700' : 'bg-stone-200 text-stone-700'}`}>
                  {shelfBoxes.length}/{totalSlots}
                  {fullShelf && ' · ممتلئ'}
                </span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: totalSlots }).map((_, idx) => {
                  const position = idx + 1;
                  const box = shelfBoxes.find(b => b.box_index === position);
                  if (box) {
                    return (
                      <div key={`occ-${position}`}
                        className="flex-1 h-14 rounded-lg flex flex-col items-center justify-center text-[9px] font-mono opacity-60"
                        style={{
                          backgroundColor: zone.color + '40',
                          border: `1px solid ${zone.color}80`
                        }}>
                        <span className="font-bold">{box.code}</span>
                        <span className="text-[8px] text-stone-700">مشغول</span>
                      </div>
                    );
                  }
                  return (
                    <button key={`empty-${position}`}
                      onClick={() => onPick(sh, position)}
                      className="flex-1 h-14 border-2 border-dashed border-green-400 bg-green-50 hover:bg-green-100 hover:border-green-600 rounded-lg flex flex-col items-center justify-center text-green-800 transition">
                      <span className="text-lg leading-none">+</span>
                      <span className="text-[9px] leading-none mt-0.5">موقع #{position}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {shelves.length === 0 && (
          <div className="text-center py-6 text-stone-400 text-sm">
            هذه المساحة لا تحوي أيّ رفّ
          </div>
        )}
      </div>
    </>
  );
}

// ====== الخطوة 2 (للأغراض): اختيار صندوق — عرض بصريّ بالأرفف ======
function BoxPickerStep({ zone, data, onPick, onBack }) {
  const shelves = (zone.shelves || []).slice().sort((a, b) => a.shelf_index - b.shelf_index);
  const zoneBoxes = data.boxes.filter(b => b.code.startsWith(zone.letter + '-'));

  function getShelfBoxes(shelfIndex) {
    return zoneBoxes.filter(b => b.code.split('-')[1] === String(shelfIndex))
      .sort((a, b) => (a.box_index || 0) - (b.box_index || 0));
  }

  if (shelves.length === 0) {
    return (
      <>
        {onBack && (
          <button onClick={onBack}
            className="text-[11px] mb-3 px-3 py-1 border border-stone-300 rounded-lg hover:bg-stone-100">
            ← الرجوع لاختيار المساحة
          </button>
        )}
        <p className="text-center text-sm text-stone-400 py-6">هذه المساحة لا تحوي أرففاً</p>
      </>
    );
  }

  return (
    <>
      {onBack && (
        <button onClick={onBack}
          className="text-[11px] mb-3 px-3 py-1 border border-stone-300 rounded-lg hover:bg-stone-100 inline-flex items-center gap-1">
          ← الرجوع لاختيار المساحة
        </button>
      )}

      <div className="text-[11px] text-stone-500 mb-2 text-center">اضغط على أيّ صندوق لاختياره</div>

      <div className="space-y-3">
        {shelves.map(sh => {
          const shelfBoxes = getShelfBoxes(sh.shelf_index);
          return (
            <div key={sh.id} className="bg-stone-50 border-2 rounded-xl p-2.5"
              style={{ borderColor: zone.color + '50' }}>
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="font-display font-bold flex items-center gap-1" style={{ color: zone.color }}>
                  📚 {shelfDisplayName(sh, shelves)}
                </span>
                <span className="text-[10px] bg-white px-2 py-0.5 rounded-full text-stone-700 border border-stone-200">
                  {shelfBoxes.length} {shelfBoxes.length === 1 ? 'صندوق' : 'صناديق'}
                </span>
              </div>
              {shelfBoxes.length === 0 ? (
                <p className="text-[10px] text-stone-400 italic text-center py-3">— رفّ فارغ —</p>
              ) : (
                <div className="flex gap-1.5 flex-wrap">
                  {shelfBoxes.map(b => {
                    const itemCount = data.items.filter(it => it.box_id === b.id).length;
                    return (
                      <button key={b.id}
                        onClick={() => onPick(b)}
                        className="flex-1 min-w-[110px] bg-white border-2 border-stone-200 rounded-lg p-2 text-center hover:border-blue-500 hover:bg-blue-50 hover:shadow-md transition">
                        <div className="flex items-center justify-center mb-1">
                          {b.photo_url ? (
                            <img src={b.photo_url} alt={b.code} className="w-9 h-9 object-cover rounded" />
                          ) : (
                            <div className="w-9 h-9 rounded bg-amber-100 flex items-center justify-center text-base">📦</div>
                          )}
                        </div>
                        <div className="text-xs font-mono font-bold" style={{ color: zone.color }}>{b.code}</div>
                        {b.description && (
                          <div className="text-[9px] text-stone-500 mt-0.5 truncate">{b.description}</div>
                        )}
                        <div className="text-[9px] text-stone-400 mt-0.5">{itemCount} صنف</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
