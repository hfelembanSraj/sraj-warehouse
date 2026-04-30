import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';

export default function DamagedTab({ data, onRefresh }) {
  const { can } = useAuth();

  async function handleRestore(d) {
    if (!confirm(`هل تريد استرجاع ${d.item_name} (×${d.quantity}) من المتلفات للمستودع؟`)) return;
    try {
      // حذف من المتلفات
      await supabase.from('damaged_items').delete().eq('id', d.id);
      // إضافة للصندوق
      const { data: existing } = await supabase.from('items').select('*').eq('box_id', d.box_id).eq('name', d.item_name).maybeSingle();
      if (existing) {
        await supabase.from('items').update({ quantity: existing.quantity + d.quantity }).eq('id', existing.id);
      } else {
        await supabase.from('items').insert({ box_id: d.box_id, name: d.item_name, quantity: d.quantity, status: 'ok' });
      }
      await logActivity('استرجاع متلف', `${d.item_name} × ${d.quantity}`, d.box_code);
      onRefresh();
    } catch (e) {
      alert('حدث خطأ: ' + e.message);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h2 className="text-sm font-display font-bold mb-1">خانة المتلفات</h2>
      <p className="text-xs text-stone-500 mb-4">الأدوات التالفة — يمكن استرجاعها للمستودع عند الحاجة</p>

      {data.damaged.length === 0 ? (
        <div className="text-center py-12 text-stone-400 text-sm">لا توجد متلفات</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-50">
              <tr>
                <th className="p-2 text-center font-medium text-stone-600">الأداة</th>
                <th className="p-2 text-center font-medium text-stone-600">الكمية</th>
                <th className="p-2 text-center font-medium text-stone-600">سبب الإتلاف</th>
                <th className="p-2 text-center font-medium text-stone-600">تاريخ الإتلاف</th>
                <th className="p-2 text-center font-medium text-stone-600">المسؤول</th>
                <th className="p-2 text-center font-medium text-stone-600">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {data.damaged.map(d => (
                <tr key={d.id} className="border-t border-stone-100">
                  <td className="p-2 text-center">{d.item_name}</td>
                  <td className="p-2 text-center">{d.quantity}</td>
                  <td className="p-2 text-center text-stone-600">{d.reason}</td>
                  <td className="p-2 text-center">{d.damaged_at}</td>
                  <td className="p-2 text-center">{d.user_name}</td>
                  <td className="p-2 text-center">
                    {can('add') ? (
                      <button onClick={() => handleRestore(d)}
                        className="text-[10px] bg-green-100 text-green-800 border border-green-300 px-2 py-1 rounded hover:bg-green-200">
                        استرجاع
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
