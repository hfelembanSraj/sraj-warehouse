import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';

export default function QrTab({ warehouseId, data }) {
  const { activeWarehouse } = useAuth();
  const [qrCodes, setQrCodes] = useState({});
  const [activeView, setActiveView] = useState('zones'); // zones | boxes
  const baseUrl = window.location.origin;

  // إنتاج الستيكرات بناءً على البيانات الفعليّة المُمرَّرة من Dashboard
  const zones = data?.zones || [];
  const allBoxes = data?.boxes || [];

  const stickers = activeView === 'zones'
    ? [
        { id: 'main', label: 'مدخل المستودع', sub: activeWarehouse?.name || 'المستودع الرئيسي', url: `${baseUrl}/?wh=${warehouseId}`, color: '#185FA5' },
        ...zones.map(z => ({
          id: `zone-${z.letter}`,
          label: `مساحة ${z.letter}`,
          sub: z.name,
          url: `${baseUrl}/?wh=${warehouseId}&zone=${z.letter}`,
          color: z.color
        }))
      ]
    : allBoxes.map(b => ({
        id: `box-${b.code}`,
        label: b.code,
        sub: b.description || 'صندوق',
        url: `${baseUrl}/?wh=${warehouseId}&box=${b.code}`,
        color: '#D85A30'
      }));

  useEffect(() => {
    async function generateAll() {
      const codes = {};
      for (const s of stickers) {
        codes[s.id] = await QRCode.toDataURL(s.url, {
          width: 240,
          margin: 2,
          color: { dark: s.color, light: '#FFFFFF' }
        });
      }
      setQrCodes(codes);
    }
    if (stickers.length > 0) generateAll();
  }, [activeView, warehouseId, zones.length, allBoxes.length]);

  function handlePrint() {
    window.print();
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4 no-print">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-bold">رموز QR للستيكرات</h2>
            <p className="text-xs text-stone-500">جاهزة للطباعة واللصق على المستودع والمساحات والصناديق</p>
          </div>
          <button onClick={handlePrint} className="bg-brand-blue text-white text-xs px-3 py-2 rounded-lg hover:bg-blue-800">
            🖨️ طباعة
          </button>
        </div>

        <div className="bg-stone-100 rounded-lg p-0.5 inline-flex">
          <button onClick={() => setActiveView('zones')}
            className={`text-xs px-3 py-1.5 rounded transition ${activeView === 'zones' ? 'bg-white shadow-sm font-medium' : 'text-stone-600'}`}>
            🏢 المستودع + المساحات ({zones.length + 1})
          </button>
          <button onClick={() => setActiveView('boxes')}
            className={`text-xs px-3 py-1.5 rounded transition ${activeView === 'boxes' ? 'bg-white shadow-sm font-medium' : 'text-stone-600'}`}>
            📦 الصناديق ({allBoxes.length})
          </button>
        </div>
      </div>

      {stickers.length === 0 ? (
        <div className="text-center py-12 text-stone-400 text-sm">
          {activeView === 'zones' ? 'لا توجد مساحات تخزين' : 'لا توجد صناديق'}
        </div>
      ) : (
        <div className="print-area grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {stickers.map(s => (
            <div key={s.id} className="bg-white border-2 rounded-xl p-4 text-center" style={{ borderColor: s.color + '60' }}>
              <div className="mb-1 text-[10px] text-stone-500">جمعية المسؤولية الاجتماعية</div>
              {qrCodes[s.id] ? (
                <img src={qrCodes[s.id]} alt={`QR ${s.label}`} className="w-32 h-32 mx-auto mb-2" />
              ) : (
                <div className="w-32 h-32 mx-auto mb-2 bg-stone-100 animate-pulse rounded"></div>
              )}
              <div className="text-sm font-display font-bold" style={{ color: s.color }}>{s.label}</div>
              <div className="text-[10px] text-stone-500 mt-0.5 truncate">{s.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
