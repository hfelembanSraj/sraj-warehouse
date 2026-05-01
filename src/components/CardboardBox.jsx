// مكوّن صندوق بشكل كرتوني واقعي (يستخدم في ShelfView والقوائم)
export default function CardboardBox({
  box,
  itemCount = 0,
  onClick,
  isFounder = false,
  busy = false,
  onDelete = null,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative rounded-md overflow-hidden border-2 border-amber-700/70 shadow-md hover:shadow-lg transition group ${
        isDragging ? 'opacity-30' : ''
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{
        background: 'linear-gradient(135deg, #d4a574 0%, #c19661 30%, #b08754 60%, #a07a4a 100%)',
        boxShadow: '0 2px 4px rgba(120,80,40,0.3), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.15)'
      }}
    >
      {/* الشريط الأعلى — لاصق الكرتون */}
      <div className="absolute top-0 left-0 right-0 h-2.5 bg-gradient-to-b from-amber-200/80 to-amber-300/60 border-b border-amber-700/40"></div>
      {/* خط الطيّ في المنتصف الأفقي */}
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-amber-900/20 -translate-x-1/2 pointer-events-none"></div>

      <button
        onClick={onClick}
        disabled={!onClick}
        className="w-full text-right pt-3 pb-2.5 px-3 flex items-center gap-2.5 hover:bg-amber-100/20 transition"
      >
        {box.photo_url ? (
          <img src={box.photo_url} alt={box.code}
            className="w-12 h-12 object-cover rounded-sm border-2 border-amber-900/30 shadow-sm flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-sm bg-amber-900/20 border-2 border-amber-900/30 flex items-center justify-center text-2xl flex-shrink-0">
            📦
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-display font-bold text-amber-950 drop-shadow-sm">{box.code}</h4>
          {box.description && <p className="text-[11px] text-amber-900/80 truncate">{box.description}</p>}
          <p className="text-[10px] text-amber-900/60 mt-0.5">
            {box.width_cm}×{box.height_cm}سم · <span className="font-bold">{itemCount}</span> صنف
          </p>
        </div>
        {onClick && <span className="text-amber-900/60 text-base">→</span>}
      </button>

      {isFounder && onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={busy}
          className="absolute top-1 left-1 text-[10px] bg-white/90 border border-red-300 text-red-700 w-6 h-6 rounded shadow-sm hover:bg-red-50 leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition flex items-center justify-center"
          title="حذف الصندوق">
          🗑
        </button>
      )}
    </div>
  );
}

// مصغّرة (للمواضع الضيّقة)
export function CardboardBoxMini({ code, itemCount = 0, isHighlighted = false, isOut = false, photoUrl = null }) {
  let bg = 'linear-gradient(135deg, #d4a574 0%, #c19661 50%, #a07a4a 100%)';
  let textColor = 'text-amber-950';
  if (isHighlighted) {
    bg = 'linear-gradient(135deg, #86efac 0%, #4ade80 50%, #22c55e 100%)';
    textColor = 'text-green-950';
  } else if (isOut) {
    bg = 'linear-gradient(135deg, #fca5a5 0%, #f87171 50%, #dc2626 100%)';
    textColor = 'text-red-950';
  }

  return (
    <div className={`relative rounded-sm border border-amber-900/40 ${textColor} h-full flex flex-col items-center justify-center gap-0.5 overflow-hidden`}
      style={{ background: bg, boxShadow: '0 1px 2px rgba(120,80,40,0.3), inset 0 1px 0 rgba(255,255,255,0.3)' }}>
      <div className="absolute top-0 left-0 right-0 h-1 bg-amber-200/60 border-b border-amber-900/20"></div>
      {photoUrl && (
        <img src={photoUrl} alt={code} className="absolute inset-0 w-full h-full object-cover opacity-30" />
      )}
      <span className="text-[10px] font-bold leading-none relative">{code}</span>
      <span className="text-[8px] opacity-75 leading-none relative">{itemCount} أصناف</span>
    </div>
  );
}
