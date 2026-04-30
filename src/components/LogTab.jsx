export default function LogTab({ data }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h2 className="text-sm font-display font-bold mb-1">سجل الحركات الكامل</h2>
      <p className="text-xs text-stone-500 mb-4">جميع العمليات الموثّقة في النظام (آخر 100 حركة)</p>

      {data.log.length === 0 ? (
        <div className="text-center py-12 text-stone-400 text-sm">لا توجد حركات مسجّلة</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-50">
              <tr>
                <th className="p-2 text-center font-medium text-stone-600">التاريخ والوقت</th>
                <th className="p-2 text-center font-medium text-stone-600">المستخدم</th>
                <th className="p-2 text-center font-medium text-stone-600">العملية</th>
                <th className="p-2 text-center font-medium text-stone-600">التفاصيل</th>
                <th className="p-2 text-center font-medium text-stone-600">الموقع</th>
              </tr>
            </thead>
            <tbody>
              {data.log.map(l => (
                <tr key={l.id} className="border-t border-stone-100">
                  <td className="p-2 text-center text-stone-600 whitespace-nowrap">{new Date(l.created_at).toLocaleString('ar-SA')}</td>
                  <td className="p-2 text-center">{l.user_name}</td>
                  <td className="p-2 text-center font-medium">{l.action}</td>
                  <td className="p-2 text-center text-stone-600">{l.target}</td>
                  <td className="p-2 text-center text-stone-500">{l.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
