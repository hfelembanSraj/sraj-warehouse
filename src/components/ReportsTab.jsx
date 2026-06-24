import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { isOverdue, resolveItemLocation } from '../lib/helpers';
import { FormModal } from './BuilderForms';

// مكتبة xlsx ثقيلة (~440 ك.ب) — تُحمَّل عند أوّل تصدير/استيراد فقط، لا مع التبويب
let _xlsxPromise;
function loadXLSX() {
  if (!_xlsxPromise) _xlsxPromise = import('xlsx').then(m => m.default ?? m);
  return _xlsxPromise;
}

export default function ReportsTab({ data }) {
  const { activeWarehouse } = useAuth();
  const [filterText, setFilterText] = useState('');
  const [filterZone, setFilterZone] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  // الجرد المقارن: المستخدم يُدخِل العدد الفعلي → يُحسَب الفرق مع النظام
  const [showAudit, setShowAudit] = useState(false);
  const [auditCounts, setAuditCounts] = useState({});  // {itemKey: actualCount}

  // ====== الإحصائيّات الكليّة ======
  const stats = useMemo(() => {
    const totalQty = data.items.reduce((s, it) => s + (it.quantity || 0), 0);
    const checkedOutQty = data.checkouts.reduce((s, c) => s + (c.quantity || 0), 0);
    const damagedQty = data.damaged.reduce((s, d) => s + (d.quantity || 0), 0);
    const donatedQty = data.donated.reduce((s, d) => s + (d.quantity || 0), 0);
    const overdueCount = data.checkouts.filter(c => isOverdue(c)).length;
    return {
      totalItems: data.items.length,
      totalQty,
      availableQty: totalQty,
      checkedOutQty,
      damagedQty,
      donatedQty,
      overdueCount,
      boxesCount: data.boxes.length,
      zonesCount: (data.zones || []).length
    };
  }, [data]);

  // ====== جدول الأصناف المُجمَّع ======
  // يشمل كل الأغراض: داخل صندوق + غرض كبير على رفّ + غير محدّد + خارج المساحات
  const aggregatedItems = useMemo(() => {
    // خرائط تجميع تُبنى مرّة واحدة — تتفادى الفلترة المتكرّرة لكل صنف (O(n×m) → O(n+m))
    const boxById = new Map((data.boxes || []).map(b => [b.id, b]));
    const coByBox = new Map();      // مفتاح: box_id::item_name → كميّة مُخرَجة
    const coByItemId = new Map();   // مفتاح: item_id → كميّة مُخرَجة
    for (const c of data.checkouts || []) {
      if (c.box_id) coByBox.set(`${c.box_id}::${c.item_name}`, (coByBox.get(`${c.box_id}::${c.item_name}`) || 0) + (c.quantity || 0));
      if (c.item_id) coByItemId.set(c.item_id, (coByItemId.get(c.item_id) || 0) + (c.quantity || 0));
    }
    const dmgByCode = new Map(), dmgByName = new Map();
    for (const d of data.damaged || []) {
      if (d.box_code) dmgByCode.set(`${d.box_code}::${d.item_name}`, (dmgByCode.get(`${d.box_code}::${d.item_name}`) || 0) + (d.quantity || 0));
      else dmgByName.set(d.item_name, (dmgByName.get(d.item_name) || 0) + (d.quantity || 0));
    }
    const donByCode = new Map(), donByName = new Map();
    for (const d of data.donated || []) {
      if (d.box_code) donByCode.set(`${d.box_code}::${d.item_name}`, (donByCode.get(`${d.box_code}::${d.item_name}`) || 0) + (d.quantity || 0));
      else donByName.set(d.item_name, (donByName.get(d.item_name) || 0) + (d.quantity || 0));
    }

    const byLoc = {};
    for (const it of data.items) {
      const loc = resolveItemLocation(it, { boxes: data.boxes, zones: data.zones || [] });
      if (!loc) continue; // مرتبط بصندوق محذوف — يُتجاهَل
      let checkedOutQty, damagedQty, donatedQty;
      if (loc.kind === 'box') {
        const box = boxById.get(it.box_id);
        checkedOutQty = coByBox.get(`${box.id}::${it.name}`) || 0;
        damagedQty = dmgByCode.get(`${box.code}::${it.name}`) || 0;
        donatedQty = donByCode.get(`${box.code}::${it.name}`) || 0;
      } else {
        checkedOutQty = coByItemId.get(it.id) || 0;
        damagedQty = dmgByName.get(it.name) || 0;
        donatedQty = donByName.get(it.name) || 0;
      }
      byLoc[`${loc.boxCode}::${it.name}`] = {
        id: it.id,
        name: it.name,
        boxCode: loc.boxCode,
        zoneLetter: loc.zoneLetter,
        zoneName: loc.zoneName,
        zoneColor: loc.zoneColor,
        photo: it.photo_url,
        quantity: it.quantity || 0,
        available: Math.max(0, (it.quantity || 0) - checkedOutQty),
        checkedOut: checkedOutQty,
        damaged: damagedQty,
        donated: donatedQty,
        status: it.status || 'ok'
      };
    }
    return Object.values(byLoc);
  }, [data]);

  // ====== الفرز/الفلترة ======
  const filteredItems = useMemo(() => {
    return aggregatedItems.filter(it => {
      if (filterText && !`${it.name} ${it.boxCode}`.toLowerCase().includes(filterText.toLowerCase())) return false;
      if (filterZone !== 'all' && it.zoneLetter !== filterZone) return false;
      if (filterStatus === 'available' && it.available <= 0) return false;
      if (filterStatus === 'out' && it.checkedOut <= 0) return false;
      if (filterStatus === 'damaged' && it.damaged <= 0) return false;
      if (filterStatus === 'donated' && it.donated <= 0) return false;
      return true;
    });
  }, [aggregatedItems, filterText, filterZone, filterStatus]);

  // ====== تصدير Excel ======
  async function exportToExcel() {
    const XLSX = await loadXLSX();
    const rows = filteredItems.map(it => ({
      'الأداة': it.name,
      'المساحة': it.zoneLetter,
      'فئة المساحة': it.zoneName,
      'رمز الصندوق': it.boxCode,
      'الكميّة الإجماليّة': it.quantity,
      'المتوفّر': it.available,
      'المُخرَج': it.checkedOut,
      'التالف': it.damaged,
      'المدعوم': it.donated
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // اتجاه RTL
    if (!ws['!cols']) ws['!cols'] = [];
    ws['!props'] = { rtl: true };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
    const filename = `Sraj-Report-${activeWarehouse?.name || 'warehouse'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  // ====== طباعة تقرير PDF ======
  // تفتح نافذة منبثقة بنسخة طباعيّة من التقرير. المتصفّح يدعم "حفظ كـ PDF" تلقائياً.
  function printReportPDF() {
    const today = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    const whName = activeWarehouse?.name || 'المستودع';
    const rowsHtml = filteredItems.map(it => `
      <tr>
        <td>${escapeHtml(it.name)}</td>
        <td style="color:${it.zoneColor};font-weight:bold;text-align:center">${escapeHtml(it.zoneLetter)}</td>
        <td>${escapeHtml(it.boxCode)}</td>
        <td style="text-align:center">${it.quantity}</td>
        <td style="text-align:center;color:#15803d;font-weight:bold">${it.available}</td>
        <td style="text-align:center;color:#ea580c">${it.checkedOut}</td>
        <td style="text-align:center;color:#dc2626">${it.damaged}</td>
        <td style="text-align:center;color:#a16207">${it.donated}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير ${whName}</title>
<style>
  @page { size: A4; margin: 1.5cm; }
  body { font-family: 'Tajawal', Arial, sans-serif; direction: rtl; color: #1A1A1A; margin: 0; }
  .stripe { height: 6px; background: linear-gradient(90deg, #E91E8B, #7B2D8E, #2196F3, #00A8B5, #6CB33E, #FFCC00, #F58220); margin-bottom: 1cm; }
  h1 { color: #1A2B5F; font-size: 20pt; margin: 0 0 4pt 0; }
  .sub { color: #6B7280; font-size: 10pt; margin-bottom: 1cm; }
  .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8pt; margin-bottom: 0.8cm; }
  .stat { border: 1px solid #E5E7EB; border-radius: 6pt; padding: 8pt; text-align: center; }
  .stat .num { font-size: 18pt; font-weight: bold; color: #1A2B5F; }
  .stat .lbl { font-size: 9pt; color: #6B7280; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #1A2B5F; color: white; padding: 8pt 6pt; text-align: right; }
  td { padding: 6pt; border-bottom: 1px solid #E5E7EB; text-align: right; }
  tr:nth-child(even) { background: #F9FAFB; }
  .footer { margin-top: 0.8cm; font-size: 9pt; color: #6B7280; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 6pt; }
</style></head>
<body>
  <div class="stripe"></div>
  <h1>📊 تقرير المخزون — ${escapeHtml(whName)}</h1>
  <div class="sub">${today} · ${filteredItems.length} صنف · بواسطة جمعيّة المسؤوليّة الاجتماعيّة بمحافظة جدّة</div>

  <div class="stats">
    <div class="stat"><div class="num">${stats.totalQty}</div><div class="lbl">إجمالي القطع</div></div>
    <div class="stat"><div class="num" style="color:#15803d">${stats.totalQty - stats.checkedOutQty}</div><div class="lbl">المتوفّر</div></div>
    <div class="stat"><div class="num" style="color:#ea580c">${stats.checkedOutQty}</div><div class="lbl">المُخرَج</div></div>
    <div class="stat"><div class="num" style="color:#dc2626">${stats.damagedQty}</div><div class="lbl">التالف</div></div>
    <div class="stat"><div class="num" style="color:#a16207">${stats.donatedQty}</div><div class="lbl">المدعوم</div></div>
    <div class="stat"><div class="num" style="color:#dc2626">${stats.overdueCount}</div><div class="lbl">متأخّر</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>الأداة</th><th>المساحة</th><th>الصندوق</th>
        <th>الإجمالي</th><th>المتوفّر</th><th>المُخرَج</th><th>التالف</th><th>المدعوم</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="footer">
    تمّ توليد التقرير من نظام إدارة المستودعات · ${new Date().toLocaleString('ar-SA')}
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return alert('السماح بالنوافذ المنبثقة مطلوب للطباعة');
    win.document.write(html);
    win.document.close();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ====== الجرد المقارن ======
  function getAuditKey(it) { return `${it.boxCode}::${it.name}`; }

  function startAudit() {
    // تهيئة العدّ الفعلي بالكميّة المتاحة (المتوفّر = الإجمالي - المُخرَج)
    const initial = {};
    aggregatedItems.forEach(it => { initial[getAuditKey(it)] = ''; });
    setAuditCounts(initial);
    setShowAudit(true);
  }

  const auditDifferences = useMemo(() => {
    return aggregatedItems.map(it => {
      const key = getAuditKey(it);
      const actual = auditCounts[key];
      const expected = it.available;  // المتوفّر فعلياً (بدون المُخرَج)
      const diff = (actual === '' || actual == null) ? null : Number(actual) - expected;
      return { ...it, expected, actual, diff };
    });
  }, [aggregatedItems, auditCounts]);

  const auditSummary = useMemo(() => {
    const counted = auditDifferences.filter(d => d.actual !== '' && d.actual != null);
    const matching = counted.filter(d => d.diff === 0).length;
    const missing = counted.filter(d => d.diff < 0).length;
    const extra = counted.filter(d => d.diff > 0).length;
    return { total: aggregatedItems.length, counted: counted.length, matching, missing, extra };
  }, [auditDifferences]);

  return (
    <>
      {/* البار العلوي بالإحصائيّات الكليّة */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <StatBig num={stats.totalQty} label="إجمالي القطع" color="text-stone-900" />
        <StatBig num={stats.availableQty - stats.checkedOutQty} label="المتوفّر" color="text-green-700" />
        <StatBig num={stats.checkedOutQty} label="المُخرَج" color="text-orange-600" />
        <StatBig num={stats.damagedQty} label="التالف" color="text-red-600" />
        <StatBig num={stats.donatedQty} label="المدعوم" color="text-amber-700" />
        <StatBig num={stats.overdueCount} label="متأخّر" color="text-red-700" highlight={stats.overdueCount > 0} />
      </div>

      {/* الفرز والاستيراد/التصدير */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-display font-bold">📊 تقرير المخزون التفصيلي</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={printReportPDF}
              className="text-[11px] bg-gradient-to-l from-brand-navy to-brand-purple text-white px-3 py-1.5 rounded-lg hover:opacity-90 font-bold shadow-sm">
              🖨 طباعة PDF
            </button>
            <button onClick={startAudit}
              className="text-[11px] bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-200 font-medium">
              🔍 جرد مقارن
            </button>
            <button onClick={exportToExcel}
              className="text-[11px] bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-medium">
              📥 Excel
            </button>
          </div>
        </div>

        {/* فلاتر */}
        <div className="grid sm:grid-cols-3 gap-2 mb-3 text-xs">
          <input
            type="search"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="🔍 بحث في الأسماء/الرموز..."
            className="px-3 py-1.5 border border-stone-300 rounded-lg"
          />
          <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
            className="px-3 py-1.5 border border-stone-300 rounded-lg bg-white">
            <option value="all">كل المساحات</option>
            {(data.zones || []).map(z => (
              <option key={z.id} value={z.letter}>{z.letter} — {z.name}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-stone-300 rounded-lg bg-white">
            <option value="all">كل الحالات</option>
            <option value="available">المتوفّر فقط</option>
            <option value="out">المُخرَج فقط</option>
            <option value="damaged">التالف فقط</option>
            <option value="donated">المدعوم فقط</option>
          </select>
        </div>

        <div className="text-[11px] text-stone-500 mb-2">
          عرض {filteredItems.length} من {aggregatedItems.length} صنف
        </div>

        {/* الجدول */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-50">
              <tr>
                <th className="p-2 text-center font-medium text-stone-600"></th>
                <th className="p-2 text-center font-medium text-stone-600">الأداة</th>
                <th className="p-2 text-center font-medium text-stone-600">المساحة</th>
                <th className="p-2 text-center font-medium text-stone-600">الصندوق</th>
                <th className="p-2 text-center font-medium text-stone-600">الكليّ</th>
                <th className="p-2 text-center font-medium text-green-700">المتوفّر</th>
                <th className="p-2 text-center font-medium text-orange-600">المُخرَج</th>
                <th className="p-2 text-center font-medium text-red-600">التالف</th>
                <th className="p-2 text-center font-medium text-amber-700">المدعوم</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr><td colSpan={9} className="text-center p-8 text-stone-400">لا توجد نتائج</td></tr>
              ) : (
                filteredItems.map((it) => (
                  <tr key={it.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="p-2 text-center">
                      {it.photo ? <img src={it.photo} alt="" className="w-8 h-8 object-cover rounded inline-block" /> : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="p-2 text-center font-medium">{it.name}</td>
                    <td className="p-2 text-center">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ color: it.zoneColor, backgroundColor: it.zoneColor + '15' }}>
                        {it.zoneLetter}
                      </span>
                    </td>
                    <td className="p-2 text-center font-mono text-[10px]">{it.boxCode}</td>
                    <td className="p-2 text-center font-medium">{it.quantity}</td>
                    <td className="p-2 text-center text-green-700 font-medium">{Math.max(0, it.quantity - it.checkedOut)}</td>
                    <td className="p-2 text-center text-orange-600">{it.checkedOut}</td>
                    <td className="p-2 text-center text-red-600">{it.damaged}</td>
                    <td className="p-2 text-center text-amber-700">{it.donated}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* مودال الجرد المقارن */}
      {showAudit && (
        <FormModal
          title="🔍 الجرد المقارن"
          subtitle="أدخل العدد الفعلي لكلّ صنف بعد العدّ، وسيُحسَب الفرق مع النظام تلقائياً"
          onClose={() => setShowAudit(false)}
          maxWidth="max-w-4xl"
        >
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-2 text-center">
              <div className="text-base font-bold">{auditSummary.total}</div>
              <div className="text-[10px] text-stone-500">إجمالي الأصناف</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-blue-700">{auditSummary.counted}</div>
              <div className="text-[10px] text-stone-500">مُعَدّ</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-green-700">{auditSummary.matching}</div>
              <div className="text-[10px] text-stone-500">مطابق</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-red-700">{auditSummary.missing}</div>
              <div className="text-[10px] text-stone-500">ناقص</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-amber-700">{auditSummary.extra}</div>
              <div className="text-[10px] text-stone-500">زائد</div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-stone-100">
                <tr>
                  <th className="text-right p-2">الأداة</th>
                  <th className="text-center p-2">الصندوق</th>
                  <th className="text-center p-2">المتوفّر (نظام)</th>
                  <th className="text-center p-2">العدد الفعلي</th>
                  <th className="text-center p-2">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {auditDifferences.map(it => {
                  const key = getAuditKey(it);
                  const rowColor =
                    it.diff === null ? '' :
                    it.diff === 0 ? 'bg-green-50' :
                    it.diff < 0 ? 'bg-red-50' : 'bg-amber-50';
                  return (
                    <tr key={key} className={`border-b border-stone-100 ${rowColor}`}>
                      <td className="p-2">{it.name}</td>
                      <td className="p-2 text-center font-mono text-[10px]" style={{ color: it.zoneColor }}>{it.boxCode}</td>
                      <td className="p-2 text-center font-bold">{it.expected}</td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min="0"
                          value={auditCounts[key] ?? ''}
                          onChange={e => setAuditCounts({ ...auditCounts, [key]: e.target.value })}
                          className="w-16 px-2 py-1 border border-stone-300 rounded text-center"
                          placeholder="-"
                        />
                      </td>
                      <td className="p-2 text-center font-bold">
                        {it.diff === null ? <span className="text-stone-300">—</span> :
                         it.diff === 0 ? <span className="text-green-700">✓</span> :
                         it.diff < 0 ? <span className="text-red-700">{it.diff}</span> :
                         <span className="text-amber-700">+{it.diff}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-stone-200 mt-3">
            <button onClick={() => setAuditCounts({})}
              className="text-[11px] border border-stone-300 px-3 py-1.5 rounded hover:bg-stone-100">
              🔄 مسح الإدخالات
            </button>
            <button onClick={() => setShowAudit(false)}
              className="text-[11px] bg-gradient-to-l from-brand-navy to-brand-purple text-white px-4 py-2 rounded-lg hover:opacity-90 font-bold">
              ✓ تمّ
            </button>
          </div>
        </FormModal>
      )}
    </>
  );
}

function StatBig({ num, label, color = 'text-stone-900', highlight = false }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${highlight ? 'bg-red-50 border-red-200 animate-pulse' : 'bg-white border-stone-200'}`}>
      <div className={`text-2xl font-display font-bold ${color}`}>{num}</div>
      <div className="text-[10px] text-stone-500 mt-0.5">{label}</div>
    </div>
  );
}
