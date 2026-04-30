export default function DonatedTab({ data }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h2 className="text-sm font-display font-bold mb-1">سجل الدعم</h2>
      <p className="text-xs text-stone-500 mb-4">الأدوات المُسلَّمة كدعم لجهات أو مبادرات</p>

      {data.donated.length === 0 ? (
        <div className="text-center py-12 text-stone-400 text-sm">لا توجد عمليات دعم مسجّلة</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-50">
              <tr>
                <th className="p-2 text-center font-medium text-stone-600">الأداة</th>
                <th className="p-2 text-center font-medium text-stone-600">الكمية</th>
                <th className="p-2 text-center font-medium text-stone-600">الجهة المستفيدة</th>
                <th className="p-2 text-center font-medium text-stone-600">المبادرة</th>
                <th className="p-2 text-center font-medium text-stone-600">التاريخ</th>
                <th className="p-2 text-center font-medium text-stone-600">المسؤول</th>
              </tr>
            </thead>
            <tbody>
              {data.donated.map(d => (
                <tr key={d.id} className="border-t border-stone-100">
                  <td className="p-2 text-center">{d.item_name}</td>
                  <td className="p-2 text-center">{d.quantity}</td>
                  <td className="p-2 text-center font-medium">{d.recipient}</td>
                  <td className="p-2 text-center text-stone-600">{d.initiative}</td>
                  <td className="p-2 text-center">{d.donated_at}</td>
                  <td className="p-2 text-center">{d.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
