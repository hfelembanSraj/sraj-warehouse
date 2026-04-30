import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';

export default function RequestsTab({ data, onRefresh }) {
  const { warehouseId } = useAuth();
  const [approvalModal, setApprovalModal] = useState(null);

  async function handleReject(req) {
    if (!confirm(`هل تريد رفض طلب ${req.full_name}؟`)) return;
    try {
      await supabase.from('join_requests').update({ status: 'rejected' }).eq('id', req.id);
      await logActivity('رفض طلب انضمام', req.full_name, '—');
      onRefresh();
    } catch (e) {
      alert('حدث خطأ: ' + e.message);
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h2 className="text-sm font-display font-bold mb-1">طلبات الانضمام</h2>
        <p className="text-xs text-stone-500 mb-4">طلبات جديدة بانتظار الموافقة</p>

        {data.requests.length === 0 ? (
          <div className="text-center py-12 text-stone-400 text-sm">لا توجد طلبات معلّقة</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50">
                <tr>
                  <th className="p-2 text-center font-medium text-stone-600">الاسم</th>
                  <th className="p-2 text-center font-medium text-stone-600">البريد</th>
                  <th className="p-2 text-center font-medium text-stone-600">تاريخ الطلب</th>
                  <th className="p-2 text-center font-medium text-stone-600">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map(r => (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="p-2 text-center">{r.full_name}</td>
                    <td className="p-2 text-center text-stone-600">{r.email}</td>
                    <td className="p-2 text-center">{new Date(r.created_at).toLocaleDateString('ar-SA')}</td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setApprovalModal(r)}
                          className="text-[10px] bg-green-100 text-green-800 border border-green-300 px-2 py-1 rounded hover:bg-green-200">
                          قبول وتحديد الصلاحيات
                        </button>
                        <button onClick={() => handleReject(r)}
                          className="text-[10px] bg-red-100 text-red-800 border border-red-300 px-2 py-1 rounded hover:bg-red-200">
                          رفض
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approvalModal && <ApprovalModal request={approvalModal} warehouseId={warehouseId}
        onClose={() => setApprovalModal(null)} onSaved={() => { setApprovalModal(null); onRefresh(); }} />}
    </>
  );
}

function ApprovalModal({ request, warehouseId, onClose, onSaved }) {
  const [perms, setPerms] = useState({ view: true, checkout: false, return: false, add: false, edit: false, delete: false });
  const [loading, setLoading] = useState(false);

  function toggle(key) { setPerms(p => ({ ...p, [key]: !p[key] })); }

  async function handleApprove() {
    setLoading(true);
    try {
      // أنشئ علاقة المستخدم بالمستودع
      await supabase.from('user_warehouses').insert({
        user_id: request.user_id,
        warehouse_id: warehouseId,
        role: 'user',
        permissions: perms,
        approved: true
      });
      // حدّث الطلب
      await supabase.from('join_requests').update({ status: 'approved' }).eq('id', request.id);
      await logActivity('قبول طلب انضمام', request.full_name, '—');
      onSaved();
    } catch (e) {
      alert('حدث خطأ: ' + e.message);
    }
    setLoading(false);
  }

  const items = [
    { key: 'view', label: 'عرض' },
    { key: 'checkout', label: 'إخراج' },
    { key: 'return', label: 'إرجاع' },
    { key: 'add', label: 'إضافة' },
    { key: 'edit', label: 'تعديل' },
    { key: 'delete', label: 'حذف' }
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 animate-fade-in">
        <h3 className="text-sm font-display font-bold mb-1">قبول طلب: {request.full_name}</h3>
        <p className="text-xs text-stone-500 mb-4">حدّد الصلاحيات الممنوحة لهذا المستخدم</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {items.map(i => (
            <label key={i.key} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition ${
              perms[i.key] ? 'bg-green-100 border border-green-300 text-green-900' : 'bg-stone-100 border border-stone-200'
            }`}>
              <input type="checkbox" checked={perms[i.key]} onChange={() => toggle(i.key)} />
              {i.label}
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={handleApprove} disabled={loading}
            className="flex-1 bg-green-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
            {loading ? 'جاري الحفظ...' : 'قبول وحفظ الصلاحيات'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
