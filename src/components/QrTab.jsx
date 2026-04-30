import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function QrTab({ warehouseId }) {
  const [qrCodes, setQrCodes] = useState({});
  const baseUrl = window.location.origin;

  const stickers = [
    { id: 'main', label: 'مدخل المستودع', sub: 'الواجهة الرئيسية', path: '/' },
    { id: 'A', label: 'مساحة A', sub: 'عُدّة الفعاليات', path: '/zone/A' },
    { id: 'B', label: 'مساحة B', sub: 'العُدّة التقنية', path: '/zone/B' },
    { id: 'C', label: 'مساحة C', sub: 'تجهيزات ميدانية', path: '/zone/C' },
    { id: 'D', label: 'مساحة D', sub: 'مواد مساندة', path: '/zone/D' }
  ];

  useEffect(() => {
    async function generateAll() {
      const codes = {};
      for (const s of stickers) {
        const url = `${baseUrl}${s.path}`;
        codes[s.id] = await QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: '#185FA5', light: '#FFFFFF' } });
      }
      setQrCodes(codes);
    }
    generateAll();
  }, [baseUrl]);

  function handlePrint() {
    window.print();
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4 no-print">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-display font-bold">رموز QR للستيكرات</h2>
            <p className="text-xs text-stone-500">5 ستيكرات جاهزة للطباعة واللصق على المستودع والأرفف</p>
          </div>
          <button onClick={handlePrint} className="bg-brand-blue text-white text-xs px-3 py-2 rounded-lg hover:bg-blue-800">
            🖨️ طباعة الستيكرات
          </button>
        </div>
      </div>

      <div className="print-area grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {stickers.map(s => (
          <div key={s.id} className="bg-white border-2 border-stone-300 rounded-xl p-5 text-center">
            <div className="mb-2 text-xs text-stone-500">جمعية المسؤولية الاجتماعية</div>
            {qrCodes[s.id] ? (
              <img src={qrCodes[s.id]} alt={`QR ${s.label}`} className="w-40 h-40 mx-auto mb-3" />
            ) : (
              <div className="w-40 h-40 mx-auto mb-3 bg-stone-100 animate-pulse rounded"></div>
            )}
            <div className="text-base font-display font-bold">{s.label}</div>
            <div className="text-xs text-stone-500 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
