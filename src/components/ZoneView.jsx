import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CheckoutModal from './CheckoutModal';
import AddBoxModal from './AddBoxModal';

export default function ZoneView({ zoneLetter, data, onBack, onRefresh }) {
  const { can } = useAuth();
  const [selectedBox, setSelectedBox] = useState(null);
  const [highlightedBox, setHighlightedBox] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [addBoxSlot, setAddBoxSlot] = useState(null);

  const zone = (data.zones || []).find(z => z.letter === zoneLetter);
  const shelves = zone?.shelves || [];
  const zoneBoxes = data.boxes.filter(b => b.code.startsWith(zoneLetter + '-'));
  const allItems = [];
  zoneBoxes.forEach(box => {
    data.items.filter(it => it.box_id === box.id).forEach(it => {
      allItems.push({ ...it, boxCode: box.code });
    });
  });

  function getBoxItems(boxId) {
    return data.items.filter(it => it.box_id === boxId);
  }

  function isCheckedOut(boxId) {
    return data.checkouts.some(c => c.box_id === boxId);
  }

  function getShelfBoxes(shelfIndex) {
    return zoneBoxes.filter(b => b.code.split('-')[1] === String(shelfIndex));
  }

  if (!zone) {
    return (
      <div className="text-center py-12">
        <button onClick={onBack} className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100 mb-4">→ الرجوع</button>
        <p className="text-sm text-stone-500">المساحة "{zoneLetter}" غير موجودة في هذا المستودع</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <button onClick={onBack} className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100">→ الرجوع</button>
        <div className="text-xs text-stone-500">المستودع ← مساحة {zone.letter}</div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <h2 className="text-sm font-display font-bold mb-1" style={{ color: zone.color }}>
          مساحة {zone.letter} — {zone.name}
        </h2>
        <p className="text-xs text-stone-500 mb-4">
          {zone.width_cm}×{zone.height_cm} سم · {shelves.length} رف · اضغط على غرض لتمييز موقعه أو على صندوق لرؤية محتوياته
        </p>

        {/* Search items */}
        {allItems.length > 0 && (
          <div className="bg-stone-50 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium mb-2">البحث عن غرض</p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {allItems.map((it, i) => (
                <button key={i}
                  onClick={() => { setHighlightedBox(highlightedBox === it.boxCode ? null : it.boxCode); setSelectedBox(null); }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                    highlightedBox === it.boxCode
                      ? 'bg-green-100 border-green-400 text-green-800'
                      : 'bg-white border-stone-300 hover:bg-orange-50 hover:border-orange-400'
                  }`}>
                  {it.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Front view rack */}
        <div className="flex justify-center mb-3">
          <div className="w-full max-w-md bg-stone-100 rounded-lg p-4">
            <div
              className="relative w-full bg-white border-4 rounded-md p-2 flex flex-col gap-1.5"
              style={{ aspectRatio: `${zone.width_cm}/${zone.height_cm}`, borderColor: zone.color }}
            >
              {shelves.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-stone-400">
                  لا توجد أرفف في هذه المساحة
                </div>
              ) : (
                shelves.map(shelf => {
                  const shelfBoxes = getShelfBoxes(shelf.shelf_index);
                  const emptySlots = Math.max(0, shelf.max_boxes - shelfBoxes.length);
                  return (
                    <div key={shelf.id} className="flex-1 bg-stone-50 border-2 rounded p-1 flex gap-1 relative" style={{ borderColor: zone.color }}>
                      <span className="absolute top-0 right-0 text-white text-[9px] px-1.5 py-0.5 rounded-bl rounded-tr font-medium" style={{ backgroundColor: zone.color }}>
                        {shelf.label || `رف ${shelf.shelf_index}`}
                      </span>
                      {shelfBoxes.map(box => {
                        const items = getBoxItems(box.id);
                        const isOut = isCheckedOut(box.id);
                        const isSelected = selectedBox === box.code;
                        const isHighlighted = highlightedBox === box.code;
                        let bgClass = 'bg-amber-50 border-amber-600 text-amber-900';
                        if (isSelected) bgClass = 'bg-blue-100 border-brand-blue text-blue-900';
                        else if (isHighlighted) bgClass = 'bg-green-100 border-green-600 text-green-900';
                        else if (isOut) bgClass = 'bg-red-100 border-red-500 text-red-900';
                        return (
                          <button key={box.id}
                            onClick={() => { setSelectedBox(isSelected ? null : box.code); setHighlightedBox(null); }}
                            className={`flex-1 border rounded cursor-pointer transition flex flex-col items-center justify-center gap-0.5 ${bgClass}`}>
                            <span className="text-[10px] font-bold leading-none">{box.code}</span>
                            <span className="text-[8px] opacity-75 leading-none">{items.length} أصناف</span>
                          </button>
                        );
                      })}
                      {Array.from({ length: emptySlots }).map((_, i) => {
                        const slotCode = `${zone.letter}-${shelf.shelf_index}-${shelfBoxes.length + i + 1}`;
                        return (
                          <button key={i} onClick={() => can('add') && setAddBoxSlot({ slotCode, shelfId: shelf.id })}
                            className="flex-1 border border-dashed border-stone-300 rounded text-[9px] text-stone-400 hover:bg-stone-100 cursor-pointer">
                            + {slotCode}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
            <div className="text-center text-[10px] text-stone-400 mt-2">العرض: {zone.width_cm} سم</div>
          </div>
        </div>

        {/* Selected box contents */}
        {selectedBox && (
          <div className="bg-white border border-stone-200 rounded-lg p-4 animate-fade-in">
            <h3 className="text-sm font-medium mb-2">محتويات الصندوق {selectedBox}</h3>
            <table className="w-full text-xs">
              <thead className="bg-stone-50">
                <tr>
                  <th className="text-center p-2 font-medium text-stone-600">م</th>
                  <th className="text-center p-2 font-medium text-stone-600">الأداة</th>
                  <th className="text-center p-2 font-medium text-stone-600">الكمية</th>
                  <th className="text-center p-2 font-medium text-stone-600">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const box = zoneBoxes.find(b => b.code === selectedBox);
                  const items = box ? getBoxItems(box.id) : [];
                  if (items.length === 0) return (
                    <tr><td colSpan={4} className="text-center p-4 text-stone-400">الصندوق فارغ</td></tr>
                  );
                  return items.map((it, i) => (
                    <tr key={it.id} className="border-t border-stone-100">
                      <td className="p-2 text-center">{i + 1}</td>
                      <td className="p-2 text-center">{it.name}</td>
                      <td className="p-2 text-center">{it.quantity}</td>
                      <td className="p-2 text-center">
                        {can('checkout') && (
                          <button onClick={() => setCheckoutItem({ ...it, boxCode: selectedBox, boxId: box.id })}
                            className="text-[10px] bg-brand-blue text-white px-2 py-1 rounded hover:bg-blue-800">
                            إخراج
                          </button>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} onSaved={onRefresh} />}
      {addBoxSlot && <AddBoxModal slotCode={addBoxSlot.slotCode} shelfId={addBoxSlot.shelfId} onClose={() => setAddBoxSlot(null)} onSaved={onRefresh} />}
    </>
  );
}
