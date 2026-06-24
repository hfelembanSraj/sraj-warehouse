// سجلّ حركات المخزون فقط — الإدخالات والإخراجات.
// أحداث الحساب (قبول/رفض انضمام، تعديل صلاحيات) والدخول/الخروج لا تظهر هنا؛
// الدخول/الخروج يظهران في نشاط المستخدم داخل تبويب «المستخدمون» (📜 النشاط).
const INVENTORY_ACTIONS = [
  // إدخالات
  'إضافة', 'إضافة صندوق', 'إرجاع', 'استرجاع متلف', 'استيراد جماعي',
  // إخراجات
  'إخراج', 'إتلاف', 'دعم'
];

export default function LogTab({ data }) {
  const rows = (data.log || []).filter(l => INVENTORY_ACTIONS.includes(l.action));

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
      <h2 className="text-sm font-display font-bold mb-1 dark:text-stone-200">سجلّ حركات المخزون</h2>
      <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">الإدخالات والإخراجات فقط (آخر 100 حركة) · الدخول/الخروج في تبويب المستخدمين</p>

      {rows.length === 0 ? (
        <div className="text-center py-12 text-stone-400 dark:text-stone-400 text-sm">لا توجد حركات مخزون مسجّلة</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-50 dark:bg-stone-800">
              <tr>
                <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">التاريخ والوقت</th>
                <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">المستخدم</th>
                <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">العملية</th>
                <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">التفاصيل</th>
                <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">الموقع</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id} className="border-t border-stone-100 dark:border-stone-800 dark:text-stone-200">
                  <td className="p-2 text-center text-stone-600 dark:text-stone-400 whitespace-nowrap">{new Date(l.created_at).toLocaleString('ar-SA')}</td>
                  <td className="p-2 text-center">{l.user_name}</td>
                  <td className="p-2 text-center font-medium">{l.action}</td>
                  <td className="p-2 text-center text-stone-600 dark:text-stone-300">{l.target}</td>
                  <td className="p-2 text-center text-stone-500 dark:text-stone-400">{l.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
