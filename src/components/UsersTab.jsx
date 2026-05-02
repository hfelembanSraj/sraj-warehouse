import { useState } from 'react';
import { supabase, logActivity } from '../lib/supabase';
import { USER_ROLES } from '../lib/constants';
import { useAuth } from '../context/AuthContext';

export default function UsersTab({ data, onRefresh }) {
  const { isFounder } = useAuth();
  const [editModal, setEditModal] = useState(null);

  function getPermSummary(perms) {
    if (!perms) return '—';
    const labels = { view:'عرض', checkout:'إخراج', return:'إرجاع', add:'إضافة', edit:'تعديل', delete:'حذف' };
    return Object.entries(perms).filter(([_, v]) => v).map(([k]) => labels[k]).join('، ') || 'لا صلاحيات';
  }

  // إخفاء المؤسّس عن غير المؤسّس
  const visibleUsers = data.users.filter(u => isFounder || !u.profiles?.is_founder);

  return (
    <>
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h2 className="text-sm font-display font-bold mb-1">إدارة المستخدمين</h2>
        <p className="text-xs text-stone-500 mb-4">المستخدمون المسجّلون وصلاحياتهم</p>

        {visibleUsers.length === 0 ? (
          <div className="text-center py-12 text-stone-400 text-sm">لا يوجد مستخدمون</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50">
                <tr>
                  <th className="p-2 text-center font-medium text-stone-600">الاسم</th>
                  <th className="p-2 text-center font-medium text-stone-600">البريد</th>
                  <th className="p-2 text-center font-medium text-stone-600">الدور</th>
                  <th className="p-2 text-center font-medium text-stone-600">الصلاحيات</th>
                  <th className="p-2 text-center font-medium text-stone-600">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map(u => {
                  const isFounderRow = !!u.profiles?.is_founder;
                  return (
                    <tr key={u.id} className={`border-t border-stone-100 ${isFounderRow ? 'bg-amber-50' : ''}`}>
                      <td className="p-2 text-center">
                        {u.profiles?.full_name || '—'}
                        {isFounderRow && <span className="mr-1" title="المؤسّس">👑</span>}
                      </td>
                      <td className="p-2 text-center text-stone-600">{u.profiles?.email || '—'}</td>
                      <td className="p-2 text-center">{isFounderRow ? 'المؤسّس' : (USER_ROLES[u.role] || u.role)}</td>
                      <td className="p-2 text-center text-stone-600 text-[10px]">
                        {isFounderRow ? 'كل الصلاحيات (محميّة)' : getPermSummary(u.permissions)}
                      </td>
                      <td className="p-2 text-center">
                        {isFounderRow ? (
                          <span className="text-[10px] text-amber-700 font-medium">🛡 محميّ</span>
                        ) : (
                          u.role === 'user' && (
                            <button onClick={() => setEditModal(u)}
                              className="text-[10px] bg-blue-100 text-blue-800 border border-blue-300 px-2 py-1 rounded hover:bg-blue-200">
                              تعديل الصلاحيات
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && <EditPermissionsModal user={editModal} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); onRefresh(); }} />}
    </>
  );
}

function EditPermissionsModal({ user, onClose, onSaved }) {
  const [perms, setPerms] = useState({ ...user.permissions });
  const [loading, setLoading] = useState(false);

  function toggle(key) { setPerms(p => ({ ...p, [key]: !p[key] })); }

  async function handleSave() {
    setLoading(true);
    try {
      await supabase.from('user_warehouses').update({ permissions: perms }).eq('id', user.id);
      await logActivity('تعديل صلاحيات', user.profiles?.full_name || 'مستخدم', '—');
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
        <h3 className="text-sm font-display font-bold mb-3">تعديل صلاحيات: {user.profiles?.full_name}</h3>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {items.map(i => (
            <label key={i.key} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition ${
              perms[i.key] ? 'bg-green-100 border border-green-300 text-green-900' : 'bg-stone-100 border border-stone-200'
            }`}>
              <input type="checkbox" checked={perms[i.key] || false} onChange={() => toggle(i.key)} />
              {i.label}
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={loading}
            className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm">
            {loading ? 'جاري الحفظ...' : 'حفظ'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
