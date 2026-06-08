// مُنتقي مكان موحّد: يُعرض في مودال ويعرض خريطة المستودع كاملة
//   - mode 'box':  يختار المستخدم مساحة → ثمّ موقعاً شاغراً في رفّ
//   - mode 'item': يختار المستخدم مساحة → ثمّ صندوقاً موجوداً
// يحذِّر إذا المساحة "ممتلئة" (لا مواقع شاغرة) للصناديق، أو "بدون صناديق" للأغراض.

import { useState, useEffect } from 'react';
import { FormModal } from './BuilderForms';
import { shelfDisplayName } from '../lib/helpers';
import { CardboardBoxMini } from './CardboardBox';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchWarehouseLayout } from '../lib/warehouseOps';

export default function LocationPicker({
  mode,                  // 'box' | 'item'
  data,
  activeWarehouse,
  onSelect,
  onCancel,
  initialZone = null,
  lockZone = false,
  title: customTitle,
  subtitle: customSubtitle
}) {
  const { warehouses } = useAuth();
  // المستودع الهدف (قد يختلف عن الحالي عند النقل لمستودع آخر)
  const [currentWh, setCurrentWh] = useState(activeWarehouse);
  const [currentData, setCurrentData] = useState(data);
  const [loadingWh, setLoadingWh] = useState(false);
  const [switchError, setSwitchError] = useState(null);
  const [showWhPicker, setShowWhPicker] = useState(false);
  const [selectedZone, setSelectedZone] = useState(initialZone);
  const zones = currentData?.zones || [];

  // تحميل بيانات مستودع مختلف
  async function switchWarehouse(wh) {
    if (wh.id === currentWh?.id) {
      setShowWhPicker(false);
      return;
    }
    setLoadingWh(true);
    setSwitchError(null);
    setShowWhPicker(false);
    setSelectedZone(null);  // إعادة تعيين المساحة عند تبديل المستودع
    try {
      const [layoutR, boxesR] = await Promise.all([
        fetchWarehouseLayout(wh.id),
        supabase.from('boxes').select('*')
          .eq('warehouse_id', wh.id).is('deleted_at', null).not('shelf_id', 'is', null)
      ]);
      // استعلامات Supabase لا ترمي استثناءً — الخطأ يأتي في النتيجة
      if (layoutR.error || boxesR.error) {
        throw new Error((layoutR.error || boxesR.error).message);
      }
      setCurrentData({
        zones: layoutR.data?.zones || [],
        boxes: boxesR.data || [],
        items: data?.items || []  // عناصر الواجهة الأصليّة (لا تتغيّر بين المستودعات بقدر اللزوم)
      });
      setCurrentWh(wh);
    } catch (e) {
      console.error('فشل تحميل بيانات المستودع:', e);
      setSwitchError(`تعذّر تحميل بيانات "${wh.name}". تحقّق من الاتصال وحاول مجدّداً.`);
    }
    setLoadingWh(false);
  }

  const isCrossWh = currentWh?.id !== activeWarehouse?.id;
  const title = customTitle || (mode === 'box'
    ? '📦 اختيار مكان للصندوق'
    : '🔧 اختيار مكان للغرض');

  const defaultSubtitle = !selectedZone
    ? `${isCrossWh ? '🔄 نقل لمستودع: ' + currentWh?.name + ' · ' : ''}اختر المساحة من الخريطة`
    : mode === 'box'
      ? `اختر موقعاً شاغراً في مساحة ${selectedZone.letter} — ${selectedZone.name}`
      : `اختر صندوقاً في مساحة ${selectedZone.letter} — ${selectedZone.name}`;
  const subtitle = customSubtitle || defaultSubtitle;

  function getZoneStatus(zone) {
    const zoneBoxes = (currentData?.boxes || []).filter(b => b.code.startsWith(zone.letter + '-'));
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
    if ((zone.shelves || []).length === 0) {
      return { full: true, label: 'لا توجد أرفف', color: 'red' };
    }
    if (zoneBoxes.length === 0) {
      // المساحة فارغة لكن قابلة للاختيار — يستطيع المستخدم إنشاء صندوق بداخلها
      return { full: false, label: 'فارغة · أضِف صندوقاً', color: 'amber' };
    }
    return { full: false, label: `${zoneBoxes.length} صندوق`, color: 'green' };
  }

  return (
    <FormModal title={title} subtitle={subtitle} onClose={onCancel} maxWidth="max-w-3xl">
      {/* شريط اختيار المستودع — يظهر إن كان هناك أكثر من مستودع وليس مقفلاً على المساحة */}
      {warehouses.length > 1 && !lockZone && (
        <div className="mb-3">
          <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-600">📦 المستودع:</span>
              <strong className="text-brand-navy">{currentWh?.name}</strong>
              {isCrossWh && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">↻ نقل بين المستودعات</span>}
            </div>
            <button onClick={() => setShowWhPicker(s => !s)} disabled={loadingWh}
              className="text-[11px] bg-white border border-stone-300 px-2.5 py-1 rounded hover:bg-stone-100 font-medium">
              🔄 تبديل المستودع
            </button>
          </div>
          {showWhPicker && (
            <div className="mt-2 bg-white border-2 border-brand-navy rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
              {warehouses.map(wh => (
                <button key={wh.id} onClick={() => switchWarehouse(wh)} disabled={loadingWh}
                  className={`text-right p-2.5 rounded-lg border-2 transition disabled:opacity-50 ${
                    wh.id === currentWh?.id
                      ? 'bg-brand-navy/10 border-brand-navy'
                      : 'bg-white border-stone-200 hover:border-brand-navy hover:bg-stone-50'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📦</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{wh.name}</div>
                      {wh.description && <div className="text-[10px] text-stone-500 truncate">{wh.description}</div>}
                    </div>
                    {wh.id === currentWh?.id && <span className="text-brand-navy">✓</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {switchError && !loadingWh && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>⚠️ {switchError}</span>
          <button onClick={() => setSwitchError(null)}
            className="text-[10px] underline shrink-0">إغلاق</button>
        </div>
      )}

      {loadingWh ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-3 border-brand-navy border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-stone-500">جاري تحميل بيانات المستودع...</p>
        </div>
      ) : !selectedZone ? (
        <ZonePickerStep
          zones={zones}
          activeWarehouse={currentWh}
          getZoneStatus={getZoneStatus}
          onPick={setSelectedZone}
        />
      ) : mode === 'box' ? (
        <PositionPickerStep
          zone={selectedZone}
          data={currentData}
          onPick={(shelf, position) => onSelect({ zone: selectedZone, shelf, position, warehouse: currentWh, isCrossWh })}
          onBack={lockZone ? null : () => setSelectedZone(null)}
        />
      ) : (
        <BoxPickerStep
          zone={selectedZone}
          data={currentData}
          onPick={(box) => onSelect({ zone: selectedZone, box, warehouse: currentWh, isCrossWh })}
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
                  status.color === 'red'   ? 'bg-red-100 text-red-700' :
                  status.color === 'amber' ? 'bg-amber-100 text-amber-800' :
                  'bg-green-100 text-green-700'
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

// ====== الخطوة 2 (للأغراض): اختيار صندوق — يعرض الرفّ بنفس شكل المساحة الحقيقيّة ======
function BoxPickerStep({ zone, data, onPick, onBack }) {
  const [creating, setCreating] = useState(false);
  const [pickingNewBoxPosition, setPickingNewBoxPosition] = useState(false);
  const shelves = (zone.shelves || []).slice().sort((a, b) => a.shelf_index - b.shelf_index);
  const zoneBoxes = data.boxes.filter(b => b.code.startsWith(zone.letter + '-'));

  function getShelfBoxes(shelfIndex) {
    return zoneBoxes.filter(b => b.code.split('-')[1] === String(shelfIndex));
  }

  // إنشاء صندوق جديد في موقع محدّد ثمّ اختياره
  async function createBoxAtPositionAndPick(shelf, position) {
    setCreating(true);
    const { data: newBoxId, error } = await supabase.rpc('add_box_at_position', {
      s_id: shelf.id,
      p_position: position,
      b_description: '',
      b_width_cm: 50,
      b_height_cm: 65
    });
    if (error || !newBoxId) {
      setCreating(false);
      console.error('فشل إنشاء صندوق:', error);
      alert('فشل إنشاء صندوق: ' + (error?.message || 'خطأ غير معروف'));
      return;
    }
    const { data: newBox, error: fetchErr } = await supabase.from('boxes').select('*').eq('id', newBoxId).single();
    setCreating(false);
    if (fetchErr || !newBox) {
      console.error('تعذّر جلب الصندوق بعد إنشائه:', fetchErr);
      alert('أُنشئ الصندوق لكن تعذّر تحميل بياناته. أغلق النافذة وستجده في مكانه.');
      return;
    }
    setPickingNewBoxPosition(false);
    onPick(newBox);
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
        <div className="text-center py-6 space-y-2">
          <div className="text-3xl">📭</div>
          <p className="text-sm text-stone-600">هذه المساحة بدون أرفف</p>
          <p className="text-[11px] text-stone-500">ادخل المساحة وأضِف رفّاً أوّلاً، ثمّ ارجع لاختيار المكان</p>
        </div>
      </>
    );
  }

  // وضع "اختر موقع الصندوق الجديد" — يعرض الرفّ ويسمح بنقر موقع شاغر
  if (pickingNewBoxPosition) {
    return (
      <>
        <button onClick={() => setPickingNewBoxPosition(false)} disabled={creating}
          className="text-[11px] mb-3 px-3 py-1 border border-stone-300 rounded-lg hover:bg-stone-100 inline-flex items-center gap-1">
          ← الرجوع
        </button>
        <div className="text-[11px] text-stone-600 mb-2 text-center">
          🆕 اختر الموقع الذي سيُنشَأ فيه الصندوق الجديد
        </div>
        <PositionPickerStep
          zone={zone}
          data={data}
          onPick={(shelf, position) => createBoxAtPositionAndPick(shelf, position)}
          onBack={null}
        />
        {creating && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-5 shadow-2xl">
              <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-xs text-stone-600">جاري إنشاء الصندوق...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  // مساحة بأرفف لكن بدون صناديق — أتح إنشاء صندوق فوراً
  if (zoneBoxes.length === 0) {
    return (
      <>
        {onBack && (
          <button onClick={onBack}
            className="text-[11px] mb-3 px-3 py-1 border border-stone-300 rounded-lg hover:bg-stone-100 inline-flex items-center gap-1">
            ← الرجوع لاختيار المساحة
          </button>
        )}
        <div className="text-center py-8 space-y-3 border-2 border-dashed border-amber-300 rounded-xl bg-amber-50/50">
          <div className="text-4xl">📭</div>
          <p className="text-sm text-stone-700 font-medium">هذه المساحة بدون صناديق بعد</p>
          <p className="text-[11px] text-stone-500">أنشئ صندوقاً في الموقع الذي تختاره واستخدمه</p>
          <button onClick={() => setPickingNewBoxPosition(true)}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-md">
            + 📦 اختر موقعاً وأنشئ صندوقاً
          </button>
        </div>
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

      <div className="text-[11px] text-stone-500 mb-2 text-center">
        اضغط على أيّ صندوق لاختياره · {zoneBoxes.length} {zoneBoxes.length === 1 ? 'صندوق' : 'صناديق'}
      </div>

      {/* الرفّ المرئي الكامل — مطابق لشكل الـZoneView */}
      <div className="flex justify-center">
        <div className="w-full max-w-md bg-stone-100 rounded-lg p-4">
          <div
            className="relative w-full bg-white border-4 rounded-md p-2 flex flex-col gap-1.5"
            style={{
              aspectRatio: `${zone.width_cm}/${zone.height_cm}`,
              borderColor: zone.color
            }}
          >
            {shelves.map(shelf => {
              const shelfBoxes = getShelfBoxes(shelf.shelf_index);
              const maxBoxIdx = shelfBoxes.length > 0
                ? Math.max(...shelfBoxes.map(b => b.box_index || 0))
                : 0;
              const totalSlots = Math.max(shelf.max_boxes || 4, maxBoxIdx);
              return (
                <div key={shelf.id}
                  className="flex-1 bg-stone-50 border-2 rounded p-1 flex gap-1 relative"
                  style={{ borderColor: zone.color }}
                >
                  <span className="absolute top-0 right-0 text-white text-[9px] px-1.5 py-0.5 rounded-bl rounded-tr font-medium pointer-events-none"
                    style={{ backgroundColor: zone.color }}>
                    {shelfDisplayName(shelf, shelves)}
                  </span>
                  {Array.from({ length: totalSlots }).map((_, idx) => {
                    const position = idx + 1;
                    const box = shelfBoxes.find(b => b.box_index === position);
                    if (box) {
                      const items = data.items.filter(it => it.box_id === box.id);
                      return (
                        <button key={`box-${position}`}
                          onClick={() => onPick(box)}
                          className="flex-1 relative cursor-pointer hover:scale-110 hover:z-10 transition-transform"
                          title={`اختر ${box.code}`}>
                          <CardboardBoxMini
                            code={box.code}
                            itemCount={items.length}
                            photoUrl={box.photo_url}
                          />
                          <div className="absolute inset-0 ring-2 ring-blue-400 ring-offset-1 rounded opacity-0 hover:opacity-100 transition pointer-events-none"></div>
                        </button>
                      );
                    }
                    return (
                      <button key={`empty-${position}`}
                        onClick={() => createBoxAtPositionAndPick(shelf, position)}
                        disabled={creating}
                        className="flex-1 border-2 border-dashed border-amber-400 bg-amber-50 hover:bg-amber-100 hover:border-amber-600 rounded text-[10px] text-amber-800 font-bold flex flex-col items-center justify-center transition disabled:opacity-50"
                        title={`أنشئ صندوقاً جديداً هنا (موقع ${position})`}>
                        <span className="text-base leading-none">+</span>
                        <span className="text-[8px] leading-none mt-0.5">جديد #{position}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="text-center text-[10px] text-stone-400 mt-2">{zone.width_cm} سم</div>
        </div>
      </div>
    </>
  );
}
