import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { todayStr, daysSince, isOverdue } from '../lib/helpers';
import { DEFAULT_RETURN_DAYS, DAMAGE_REASONS } from '../lib/constants';

export default function CheckoutsTab({ data, onRefresh }) {
  const { user, profile, can, warehouseId } = useAuth();
  const [actionModal, setActionModal] = useState(null); // { type, checkout }

  return (
    <>
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <h2 className="text-sm font-display font-bold mb-1">العُدّة المُخرَجة حالياً</h2>
        <p className="text-xs text-stone-500 mb-4">المهلة الافتراضية {DEFAULT_RETURN_DAYS} أيام للإرجاع</p>

        {data.checkouts.length === 0 ? (
          <div className="text-center py-12 text-stone-400 text-sm">لا توجد عُدّة مُخرَجة حالياً</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50">
                <tr>
                  <th className="p-2 text-center font-medium text-stone-600">الأداة</th>
                  <th className="p-2 text-center font-medium text-stone-600">الكمية</th>
                  <th className="p-2 text-center font-medium text-stone-600">المسؤول</th>
                  <th className="p-2 text-center font-medium text-stone-600">الغرض/المبادرة</th>
                  <th className="p-2 text-center font-medium text-stone-600">تاريخ الإخراج</th>
                  <th className="p-2 text-center font-medium text-stone-600">الحالة</th>
                  <th className="p-2 text-center font-medium text-stone-600">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {data.checkouts.map(c => {
                  const days = daysSince(c.date_out);
                  const overdue = isOverdue(c);
                  return (
                    <tr key={c.id} className="border-t border-stone-100">
                      <td className="p-2 text-center">{c.item_name}</td>
                      <td className="p-2 text-center">{c.quantity}</td>
                      <td className="p-2 text-center">{c.user_name}</td>
                      <td className="p-2 text-center">{c.purpose === 'personal' ? 'استخدام شخصي' : c.initiative}</td>
                      <td className="p-2 text-center">{c.date_out}</td>
                      <td className="p-2 text-center">
                        {c.purpose === 'personal' ? (
                          <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">غرض شخصي</span>
                        ) : overdue ? (
                          <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-medium">متأخّر {days - DEFAULT_RETURN_DAYS} أيام</span>
                        ) : (
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">{DEFAULT_RETURN_DAYS - days} أيام متبقّية</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex gap-1 justify-center flex-wrap">
                          {c.purpose !== 'personal' && can('return') && (
                            <button onClick={() => setActionModal({ type: 'return', checkout: c })}
                              className="text-[10px] bg-green-100 text-green-800 border border-green-300 px-2 py-1 rounded hover:bg-green-200">
                              إرجاع
                            </button>
                          )}
                          <button onClick={() => setActionModal({ type: 'damage', checkout: c })}
                            className="text-[10px] bg-red-100 text-red-800 border border-red-300 px-2 py-1 rounded hover:bg-red-200">
                            إتلاف
                          </button>
                          <button onClick={() => setActionModal({ type: 'donate', checkout: c })}
                            className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded hover:bg-amber-200">
                            دعم
                          </button>
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

      {actionModal && (
        <ActionModal
          type={actionModal.type}
          checkout={actionModal.checkout}
          warehouseId={warehouseId}
          userId={user.id}
          userName={profile?.full_name}
          onClose={() => setActionModal(null)}
          onSaved={() => { setActionModal(null); onRefresh(); }}
        />
      )}
    </>
  );
}

function ActionModal({ type, checkout, warehouseId, userId, userName, onClose, onSaved }) {
  const [reason, setReason] = useState(DAMAGE_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [recipient, setRecipient] = useState('');
  const [initiative, setInitiative] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const now = new Date().toISOString();

      if (type === 'return') {
        // إرجاع: حدّث الـ checkout ثم أعد القطع للصندوق
        await supabase.from('checkouts').update({ returned_at: now, returned_qty: checkout.quantity }).eq('id', checkout.id);
        // أضف أو حدّث القطعة في الصندوق
        const { data: existing } = await supabase.from('items').select('*').eq('box_id', checkout.box_id).eq('name', checkout.item_name).maybeSingle();
        if (existing) {
          await supabase.from('items').update({ quantity: existing.quantity + checkout.quantity }).eq('id', existing.id);
        } else {
          await supabase.from('items').insert({ box_id: checkout.box_id, name: checkout.item_name, quantity: checkout.quantity, status: 'ok' });
        }
        await logActivity('إرجاع', `${checkout.item_name} × ${checkout.quantity}`, checkout.box_code);

      } else if (type === 'damage') {
        // إتلاف: أنشئ سجل في damaged_items وحدّث الـ checkout
        await supabase.from('damaged_items').insert({
          warehouse_id: warehouseId,
          box_id: checkout.box_id,
          box_code: checkout.box_code,
          item_name: checkout.item_name,
          quantity: checkout.quantity,
          reason: reason + (notes ? ` — ${notes}` : ''),
          damaged_at: todayStr(),
          user_id: userId,
          user_name: userName
        });
        await supabase.from('checkouts').update({ damaged_at: now }).eq('id', checkout.id);
        await logActivity('إتلاف', `${checkout.item_name} × ${checkout.quantity} — ${reason}`, checkout.box_code);

      } else if (type === 'donate') {
        if (!recipient.trim()) {
          alert('الرجاء إدخال اسم الجهة المستفيدة');
          setLoading(false);
          return;
        }
        await supabase.from('donated_items').insert({
          warehouse_id: warehouseId,
          box_code: checkout.box_code,
          item_name: checkout.item_name,
          quantity: checkout.quantity,
          recipient: recipient.trim(),
          initiative: initiative.trim() || '—',
          donated_at: todayStr(),
          user_id: userId,
          user_name: userName
        });
        await supabase.from('checkouts').update({ donated_at: now }).eq('id', checkout.id);
        await logActivity('دعم', `${checkout.item_name} × ${checkout.quantity} → ${recipient}`, checkout.box_code);
      }

      onSaved();
    } catch (e) {
      console.error(e);
      alert('حدث خطأ: ' + e.message);
    }
    setLoading(false);
  }

  const titles = { return: 'إرجاع: ', damage: 'تسجيل إتلاف: ', donate: 'تسجيل دعم: ' };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 animate-fade-in">
        <h3 className="text-sm font-display font-bold mb-3">{titles[type]}{checkout.item_name}</h3>

        {type === 'return' && (
          <p className="text-xs text-stone-600 mb-4">سيتم إرجاع {checkout.quantity} قطعة إلى الموقع {checkout.box_code}</p>
        )}

        {type === 'damage' && (
          <>
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-2.5 rounded-lg mb-3">
              ⚠ ستُحذف الأداة من المستودع وتُنقَل لخانة المتلفات. يمكن استرجاعها لاحقاً.
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-stone-600 mb-1">سبب الإتلاف</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs">
                  {DAMAGE_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">تفاصيل إضافية (اختياري)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
              </div>
            </div>
          </>
        )}

        {type === 'donate' && (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2.5 rounded-lg mb-3">
              ⚠ ستُحذف الأداة من المستودع وتُسجَّل في سجل الدعم.
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-stone-600 mb-1">اسم الجهة المستفيدة *</label>
                <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
                  placeholder="مثال: جمعية إبصار الخيرية"
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">المبادرة / السياق</label>
                <input type="text" value={initiative} onChange={(e) => setInitiative(e.target.value)}
                  placeholder="مثال: دعم فعالية اليوم العالمي للتطوّع"
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button onClick={handleConfirm} disabled={loading}
            className={`flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50 ${
              type === 'return' ? 'bg-green-600 hover:bg-green-700' :
              type === 'damage' ? 'bg-red-600 hover:bg-red-700' :
              'bg-amber-600 hover:bg-amber-700'
            }`}>
            {loading ? 'جاري الحفظ...' : 'تأكيد'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
