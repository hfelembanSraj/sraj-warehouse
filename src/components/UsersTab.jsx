import { useState, useEffect } from 'react';
import { supabase, logActivity } from '../lib/supabase';
import { USER_ROLES } from '../lib/constants';
import { useAuth } from '../context/AuthContext';
import { FormModal } from './BuilderForms';

export default function UsersTab({ data, onRefresh }) {
  const { isFounder } = useAuth();
  const [editModal, setEditModal] = useState(null);
  const [activityModal, setActivityModal] = useState(null);

  function getPermSummary(perms) {
    if (!perms) return '—';
    const labels = { view:'عرض', checkout:'إخراج', return:'إرجاع', add:'إضافة', edit:'تعديل', delete:'حذف' };
    return Object.entries(perms).filter(([_, v]) => v).map(([k]) => labels[k]).join('، ') || 'لا صلاحيات';
  }

  // إخفاء المؤسّس عن غير المؤسّس
  const visibleUsers = data.users.filter(u => isFounder || !u.profiles?.is_founder);

  return (
    <>
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">
        <h2 className="text-sm font-display font-bold mb-1 dark:text-stone-200">إدارة المستخدمين</h2>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">المستخدمون المسجّلون وصلاحياتهم</p>

        {visibleUsers.length === 0 ? (
          <div className="text-center py-12 text-stone-400 dark:text-stone-400 text-sm">لا يوجد مستخدمون</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50 dark:bg-stone-800">
                <tr>
                  <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">الاسم</th>
                  <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">البريد</th>
                  <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">الدور</th>
                  <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">الصلاحيات</th>
                  <th className="p-2 text-center font-medium text-stone-600 dark:text-stone-300">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map(u => {
                  const isFounderRow = !!u.profiles?.is_founder;
                  return (
                    <tr key={u.id} className={`border-t border-stone-100 dark:border-stone-800 dark:text-stone-200 ${isFounderRow ? 'bg-amber-50 dark:bg-amber-900/30' : ''}`}>
                      <td className="p-2 text-center">
                        {u.profiles?.full_name || '—'}
                        {isFounderRow && <span className="mr-1" title="المؤسّس">👑</span>}
                      </td>
                      <td className="p-2 text-center text-stone-600 dark:text-stone-300">{u.profiles?.email || '—'}</td>
                      <td className="p-2 text-center">{isFounderRow ? 'المؤسّس' : (USER_ROLES[u.role] || u.role)}</td>
                      <td className="p-2 text-center text-stone-600 dark:text-stone-300 text-[10px]">
                        {isFounderRow ? 'كل الصلاحيات (محميّة)' : getPermSummary(u.permissions)}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex gap-1 justify-center flex-wrap">
                          <button onClick={() => setActivityModal(u)}
                            className="text-[10px] bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-700 px-2 py-1 rounded hover:bg-stone-200 dark:hover:bg-stone-700"
                            title="عرض ما قام به هذا المستخدم">
                            📜 النشاط
                          </button>
                          {isFounderRow ? (
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium px-2 py-1">🛡 محميّ</span>
                          ) : (
                            u.role === 'user' && (
                              <button onClick={() => setEditModal(u)}
                                className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 px-2 py-1 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50">
                                تعديل الصلاحيات
                              </button>
                            )
                          )}
                        </div>
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
      {activityModal && <UserActivityModal user={activityModal} onClose={() => setActivityModal(null)} />}
    </>
  );
}

// ===== سجلّ نشاط المستخدم =====
function UserActivityModal({ user, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');   // all | إخراج | إرجاع | إضافة | حذف ...

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from('activity_log')
        .select('*')
        .eq('user_id', user.user_id)
        .order('created_at', { ascending: false })
        .limit(200);
      setEntries(data || []);
      setLoading(false);
    }
    if (user?.user_id) load();
  }, [user?.user_id]);

  // الإحصائيّات بحسب نوع العمليّة
  const counts = entries.reduce((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1;
    return acc;
  }, {});

  const filtered = filter === 'all' ? entries : entries.filter(e => e.action === filter);

  const actionColors = {
    'إخراج':   { bg: 'bg-orange-50 dark:bg-orange-900/30',  border: 'border-orange-200 dark:border-orange-800',  text: 'text-orange-800 dark:text-orange-300',  icon: '↑' },
    'إرجاع':   { bg: 'bg-green-50 dark:bg-green-900/30',   border: 'border-green-200 dark:border-green-800',   text: 'text-green-800 dark:text-green-300',   icon: '↓' },
    'إضافة':   { bg: 'bg-blue-50 dark:bg-blue-900/30',    border: 'border-blue-200 dark:border-blue-800',    text: 'text-blue-800 dark:text-blue-300',    icon: '+' },
    'حذف':     { bg: 'bg-red-50 dark:bg-red-900/30',     border: 'border-red-200 dark:border-red-800',     text: 'text-red-800 dark:text-red-300',     icon: '🗑' },
    'إتلاف':   { bg: 'bg-rose-50 dark:bg-rose-900/30',    border: 'border-rose-200 dark:border-rose-800',    text: 'text-rose-800 dark:text-rose-300',    icon: '⚠' },
    'دعم':     { bg: 'bg-amber-50 dark:bg-amber-900/30',   border: 'border-amber-200 dark:border-amber-800',   text: 'text-amber-800 dark:text-amber-300',   icon: '💝' }
  };
  function colorFor(action) {
    return actionColors[action] || { bg: 'bg-stone-50 dark:bg-stone-800', border: 'border-stone-200 dark:border-stone-700', text: 'text-stone-700 dark:text-stone-300', icon: '•' };
  }

  return (
    <FormModal
      title={`📜 نشاط: ${user.profiles?.full_name || 'مستخدم'}`}
      subtitle={`${entries.length} عمليّة مُسجَّلة · آخر 200 حركة`}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {loading ? (
        <p className="text-center text-sm text-stone-500 dark:text-stone-400 py-12">جاري التحميل...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-stone-400 dark:text-stone-400">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">لا توجد عمليّات مُسجَّلة لهذا المستخدم</p>
        </div>
      ) : (
        <>
          {/* فلاتر سريعة بحسب نوع العمليّة */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button onClick={() => setFilter('all')}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                filter === 'all' ? 'bg-brand-navy text-white border-brand-navy font-bold' : 'bg-white dark:bg-stone-800 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
              }`}>
              الكلّ ({entries.length})
            </button>
            {Object.entries(counts).map(([action, count]) => {
              const c = colorFor(action);
              return (
                <button key={action} onClick={() => setFilter(action)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                    filter === action
                      ? `${c.bg} ${c.border} ${c.text} font-bold ring-1 ring-offset-1 ring-stone-400 dark:ring-offset-stone-900`
                      : 'bg-white dark:bg-stone-800 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                  }`}>
                  {c.icon} {action} ({count})
                </button>
              );
            })}
          </div>

          {/* قائمة العمليّات */}
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {filtered.map(e => {
              const c = colorFor(e.action);
              return (
                <div key={e.id} className={`${c.bg} ${c.border} border rounded-lg p-2.5 flex items-start gap-2.5`}>
                  <span className={`${c.text} text-base font-bold flex-shrink-0 mt-0.5`}>{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`${c.text} text-xs font-bold`}>{e.action}</span>
                      <span className="text-[10px] text-stone-500 dark:text-stone-400 whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    {e.target && <div className="text-xs text-stone-700 dark:text-stone-300 mt-0.5">📌 {e.target}</div>}
                    {e.location && <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">📍 {e.location}</div>}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-stone-400 dark:text-stone-400 text-sm py-4">لا نتائج للفلتر المختار</p>
            )}
          </div>
        </>
      )}
    </FormModal>
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
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl max-w-md w-full p-5 animate-fade-in">
        <h3 className="text-sm font-display font-bold mb-3 dark:text-stone-200">تعديل صلاحيات: {user.profiles?.full_name}</h3>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {items.map(i => (
            <label key={i.key} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition ${
              perms[i.key] ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 text-green-900 dark:text-green-300' : 'bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 dark:text-stone-300'
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
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
