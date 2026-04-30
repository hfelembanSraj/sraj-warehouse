import { isOverdue } from '../lib/helpers';

export default function ReportsTab({ data }) {
  const totalBoxes = data.boxes.length;
  const totalQty = data.items.reduce((s, it) => s + (it.quantity || 0), 0);
  const overdue = data.checkouts.filter(c => isOverdue(c)).length;
  const active = data.checkouts.length - overdue;

  // الأدوات الأكثر إخراجاً (من السجل)
  const itemUsage = {};
  data.log.filter(l => l.action === 'إخراج').forEach(l => {
    const name = l.target.split('×')[0].trim();
    itemUsage[name] = (itemUsage[name] || 0) + 1;
  });
  const topUsed = Object.entries(itemUsage).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
          <div className="text-2xl font-display font-bold">{totalBoxes}</div>
          <div className="text-[11px] text-stone-500">صناديق</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
          <div className="text-2xl font-display font-bold">{data.checkouts.length}</div>
          <div className="text-[11px] text-stone-500">مُخرَج</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
          <div className="text-2xl font-display font-bold text-red-600">{data.damaged.length}</div>
          <div className="text-[11px] text-stone-500">متلفات</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
          <div className="text-2xl font-display font-bold text-amber-600">{data.donated.length}</div>
          <div className="text-[11px] text-stone-500">دعم</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <h3 className="text-sm font-display font-bold mb-3">ملخّص النشاط</h3>
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-b border-stone-100"><td className="p-2">إجمالي القطع في المستودع</td><td className="p-2 text-left font-medium">{totalQty}</td></tr>
            <tr className="border-b border-stone-100"><td className="p-2">إجمالي العمليات المسجّلة</td><td className="p-2 text-left font-medium">{data.log.length}</td></tr>
            <tr className="border-b border-stone-100"><td className="p-2">عمليات الإخراج النشطة</td><td className="p-2 text-left font-medium">{active}</td></tr>
            <tr className="border-b border-stone-100"><td className="p-2">عمليات متأخّرة</td><td className="p-2 text-left font-medium text-red-600">{overdue}</td></tr>
          </tbody>
        </table>
      </div>

      {topUsed.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="text-sm font-display font-bold mb-3">الأدوات الأكثر إخراجاً</h3>
          <table className="w-full text-xs">
            <thead className="bg-stone-50">
              <tr>
                <th className="p-2 text-center font-medium text-stone-600">م</th>
                <th className="p-2 text-center font-medium text-stone-600">الأداة</th>
                <th className="p-2 text-center font-medium text-stone-600">عدد مرات الإخراج</th>
              </tr>
            </thead>
            <tbody>
              {topUsed.map((u, i) => (
                <tr key={u[0]} className="border-t border-stone-100">
                  <td className="p-2 text-center">{i + 1}</td>
                  <td className="p-2 text-center">{u[0]}</td>
                  <td className="p-2 text-center font-medium">{u[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
