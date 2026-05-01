// خريطة مصغّرة عائمة في أسفل اليسار — تعرض كلّ مساحات المستودع كأهداف إسقاط
// تُستخدم في ZoneView/ShelfView/BoxView لنقل صناديق أو أغراض إلى مساحة أخرى بالسحب
import { useState } from 'react';

export default function WarehouseMiniMap({
  zones = [],
  currentZoneId = null,
  hasActiveSelection = false,   // هل هناك اختيار يستحقّ السحب إليه؟
  onDropOnZone,                  // (zone) => void — يُستدعى عند إفلات/نقر على المساحة
  selectionLabel = ''            // وصف نصّي للاختيار الحالي (للإرشاد)
}) {
  const [hoverZoneId, setHoverZoneId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  if (!zones || zones.length === 0) return null;

  return (
    <div
      className={`fixed bottom-6 left-6 z-40 transition-all ${collapsed ? 'w-12 h-12' : 'w-56 sm:w-64'}`}
      style={{ direction: 'rtl' }}
    >
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-12 h-12 bg-white rounded-full shadow-2xl border-2 border-stone-300 flex items-center justify-center hover:bg-stone-50"
          title="إظهار خريطة المستودع"
        >
          🗺
        </button>
      ) : (
        <div className="bg-white rounded-2xl shadow-2xl border border-stone-300 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-l from-stone-100 to-stone-50 border-b border-stone-200">
            <span className="text-[10px] font-bold text-stone-700 flex items-center gap-1">
              🗺 خريطة المستودع
            </span>
            <button
              onClick={() => setCollapsed(true)}
              className="text-stone-500 hover:text-stone-700 text-xs leading-none"
              title="طيّ"
            >
              ✕
            </button>
          </div>

          {hasActiveSelection && (
            <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-200 text-[10px] text-blue-800 text-center">
              ⬇ اسحب أو اضغط مساحة لنقل {selectionLabel || 'الاختيار'}
            </div>
          )}

          <div className="relative w-full aspect-square bg-gradient-to-br from-stone-50 to-stone-100 p-1.5">
            {zones.map(z => {
              const isCurrent = z.id === currentZoneId;
              const isHover   = z.id === hoverZoneId;
              const style = {
                top:    z.pos_top    != null ? `${z.pos_top}%`    : undefined,
                bottom: (z.pos_top == null && z.pos_height != null) ? `${100 - z.pos_height - 6}%` : undefined,
                left:   z.pos_left   != null ? `${z.pos_left}%`   : undefined,
                right:  z.pos_right  != null ? `${z.pos_right}%`  : undefined,
                width:  z.pos_width  != null ? `${z.pos_width}%`  : undefined,
                height: z.pos_height != null ? `${z.pos_height}%` : undefined,
                borderColor: z.color,
                backgroundColor: isHover ? z.color + 'cc' : z.color + (isCurrent ? '40' : '20'),
                color: isHover ? 'white' : z.color,
                cursor: hasActiveSelection ? 'pointer' : 'default'
              };
              return (
                <div
                  key={z.id}
                  style={style}
                  onDragOver={(e) => { if (hasActiveSelection) { e.preventDefault(); setHoverZoneId(z.id); } }}
                  onDragLeave={() => setHoverZoneId(null)}
                  onDrop={(e) => {
                    if (!hasActiveSelection) return;
                    e.preventDefault();
                    setHoverZoneId(null);
                    onDropOnZone?.(z);
                  }}
                  onClick={() => {
                    if (!hasActiveSelection) return;
                    onDropOnZone?.(z);
                  }}
                  className={`absolute border-2 rounded transition-all flex items-center justify-center font-bold text-[11px] ${
                    isCurrent ? 'ring-2 ring-offset-1 ring-blue-500' : ''
                  } ${
                    hasActiveSelection ? 'hover:scale-110 hover:shadow-lg' : ''
                  }`}
                  title={`${z.letter} — ${z.name}${isCurrent ? ' (الحالية)' : ''}`}
                >
                  {z.letter}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
