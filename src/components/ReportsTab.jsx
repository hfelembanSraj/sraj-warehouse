import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { isOverdue } from '../lib/helpers';

export default function ReportsTab({ data, onRefresh }) {
  const { activeWarehouse, isFounder, can } = useAuth();
  const [filterText, setFilterText] = useState('');
  const [filterZone, setFilterZone] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // all | available | out | damaged | donated
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

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
  const aggregatedItems = useMemo(() => {
    const byBox = {};
    for (const it of data.items) {
      const box = data.boxes.find(b => b.id === it.box_id);
      if (!box) continue;
      const zoneLetter = box.code.split('-')[0];
      const zone = (data.zones || []).find(z => z.letter === zoneLetter);
      const checkedOutQty = data.checkouts
        .filter(c => c.box_id === box.id && c.item_name === it.name)
        .reduce((s, c) => s + (c.quantity || 0), 0);
      const damagedQty = data.damaged
        .filter(d => d.box_code === box.code && d.item_name === it.name)
        .reduce((s, d) => s + (d.quantity || 0), 0);
      const donatedQty = data.donated
        .filter(d => d.box_code === box.code && d.item_name === it.name)
        .reduce((s, d) => s + (d.quantity || 0), 0);
      byBox[`${box.code}::${it.name}`] = {
        id: it.id,
        name: it.name,
        boxCode: box.code,
        zoneLetter,
        zoneName: zone?.name || '—',
        zoneColor: zone?.color || '#888',
        photo: it.photo_url,
        quantity: it.quantity || 0,
        available: Math.max(0, (it.quantity || 0) - checkedOutQty),
        checkedOut: checkedOutQty,
        damaged: damagedQty,
        donated: donatedQty,
        status: it.status || 'ok'
      };
    }
    return Object.values(byBox);
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
  function exportToExcel() {
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

  // ====== تصدير CSV لـ Google Sheets ======
  function exportToCSV() {
    const rows = [
      ['الأداة', 'المساحة', 'فئة المساحة', 'رمز الصندوق', 'الكميّة الإجماليّة', 'المتوفّر', 'المُخرَج', 'التالف', 'المدعوم']
    ];
    filteredItems.forEach(it => {
      rows.push([it.name, it.zoneLetter, it.zoneName, it.boxCode, it.quantity, it.available, it.checkedOut, it.damaged, it.donated]);
    });
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sraj-Report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ====== تنزيل قالب استيراد ======
  function downloadTemplate() {
    const sample = [
      { 'اسم الأداة': 'حبال تجاذب', 'الكميّة': 4, 'المساحة': 'A', 'الوصف': 'حبال للفعاليات' },
      { 'اسم الأداة': 'كاميرا تصوير', 'الكميّة': 1, 'المساحة': 'B', 'الوصف': '' }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'أدوات');
    XLSX.writeFile(wb, 'Sraj-Import-Template.xlsx');
  }

  // ====== استيراد Excel/CSV ======
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      const successes = [];
      const errors = [];

      for (const [i, row] of rows.entries()) {
        const name = String(row['اسم الأداة'] || row['name'] || '').trim();
        const qty = parseInt(row['الكميّة'] || row['quantity'] || 1) || 1;
        const zoneLetter = String(row['المساحة'] || row['zone'] || '').trim().toUpperCase();
        const description = String(row['الوصف'] || row['description'] || '').trim();

        if (!name) {
          errors.push({ row: i + 2, reason: 'اسم الأداة فارغ' });
          continue;
        }

        const zone = (data.zones || []).find(z => z.letter === zoneLetter);
        if (!zone) {
          errors.push({ row: i + 2, reason: `المساحة "${zoneLetter}" غير موجودة (الأداة: ${name})` });
          continue;
        }

        // اقترح صندوقاً
        const existingInZone = data.boxes.filter(b => b.code.startsWith(zoneLetter + '-'));
        let targetBox = null;
        for (const sh of zone.shelves) {
          const onShelf = existingInZone.filter(b => b.code.startsWith(`${zoneLetter}-${sh.shelf_index}-`));
          if (onShelf.length < (sh.max_boxes || 4)) {
            const code = `${zoneLetter}-${sh.shelf_index}-${onShelf.length + 1}`;
            // ابحث أو أنشئ
            let { data: box } = await supabase.from('boxes').select('*').eq('warehouse_id', activeWarehouse.id).eq('code', code).is('deleted_at', null).maybeSingle();
            if (!box) {
              const { data: newBox } = await supabase.from('boxes')
                .insert({ warehouse_id: activeWarehouse.id, code, shelf_id: sh.id, description: description || null })
                .select().single();
              box = newBox;
            }
            targetBox = box;
            break;
          }
        }
        if (!targetBox) {
          errors.push({ row: i + 2, reason: `لا يوجد رف فارغ في مساحة ${zoneLetter} (الأداة: ${name})` });
          continue;
        }

        const { error: insErr } = await supabase.from('items').insert({
          box_id: targetBox.id, name, quantity: qty, status: 'ok'
        });
        if (insErr) {
          errors.push({ row: i + 2, reason: insErr.message });
          continue;
        }

        successes.push({ name, code: targetBox.code });
      }

      if (successes.length > 0) {
        await logActivity('استيراد جماعي', `${successes.length} أداة`, `Excel · ${file.name}`);
      }

      setImportResult({ successes, errors });
      await onRefresh?.();
    } catch (err) {
      setImportResult({ successes: [], errors: [{ row: '?', reason: 'فشل قراءة الملف: ' + err.message }] });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

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
            <button onClick={exportToExcel}
              className="text-[11px] bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-medium">
              📥 تصدير Excel
            </button>
            <button onClick={exportToCSV}
              className="text-[11px] bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
              📊 تصدير CSV (Google Sheets)
            </button>
            {(isFounder || can('add')) && (
              <>
                <button onClick={downloadTemplate}
                  className="text-[11px] border border-stone-300 px-3 py-1.5 rounded-lg hover:bg-stone-100">
                  📄 تنزيل قالب
                </button>
                <label className="text-[11px] bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-200 cursor-pointer font-medium">
                  📤 استيراد Excel
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} disabled={importing} className="hidden" />
                </label>
              </>
            )}
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

        {/* نتائج الاستيراد */}
        {importResult && (
          <div className={`mb-3 p-3 rounded-lg text-xs ${importResult.errors.length === 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            <p className="font-bold mb-1">
              {importResult.successes.length > 0 && `✅ تمّ استيراد ${importResult.successes.length} أداة. `}
              {importResult.errors.length > 0 && `⚠️ ${importResult.errors.length} خطأ.`}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="text-[10px] list-disc pr-4 max-h-32 overflow-y-auto">
                {importResult.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>صف {e.row}: {e.reason}</li>
                ))}
                {importResult.errors.length > 20 && <li>... و {importResult.errors.length - 20} خطأ آخر</li>}
              </ul>
            )}
            <button onClick={() => setImportResult(null)}
              className="text-[10px] underline mt-1">إغلاق</button>
          </div>
        )}

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
