import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { todayStr, daysSince, isOverdue } from '../lib/helpers';
import { DEFAULT_RETURN_DAYS, DAMAGE_REASONS } from '../lib/constants';

export default function CheckoutsTab({ data, onRefresh }) {
  const { user, profile, can, warehouseId } = useAuth();
  const [actionModal, setActionModal] = useState(null);
  // وضع العرض: list = جدول، calendar = تقويم
  const [viewMode, setViewMode] = useState('list');

  return (
    <>
      <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div>
            <h2 className="text-sm font-display font-bold">العُدّة المُخرَجة حالياً</h2>
            <p className="text-xs text-stone-500">المهلة الافتراضية {DEFAULT_RETURN_DAYS} أيام للإرجاع</p>
          </div>
          <div className="bg-stone-100 rounded-lg p-0.5 inline-flex">
            <button onClick={() => setViewMode('list')}
              className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'list' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
              📋 قائمة
            </button>
            <button onClick={() => setViewMode('calendar')}
              className={`text-[11px] px-3 py-1.5 rounded transition ${viewMode === 'calendar' ? 'bg-white shadow-sm font-medium' : 'text-stone-600 hover:text-stone-900'}`}>
              📅 تقويم
            </button>
          </div>
        </div>

        {viewMode === 'calendar' && (
          <CheckoutsCalendar checkouts={data.checkouts} />
        )}

        {viewMode === 'list' && (
        <>


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
        </>
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

// ============ تقويم الإخراجات ============
function CheckoutsCalendar({ checkouts }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const weekDays = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startWeekDay = first.getDay();
    const cells = [];
    for (let i = 0; i < startWeekDay; i++) cells.push(null);
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
    return cells;
  }, [year, month]);

  function eventsOnDate(date) {
    if (!date) return { out: [], dueReturn: [] };
    const dateStr = date.toISOString().slice(0, 10);
    const out = checkouts.filter(c => c.date_out === dateStr);
    // الإرجاع المتوقّع = date_out + DEFAULT_RETURN_DAYS
    const dueReturn = checkouts.filter(c => {
      if (c.purpose === 'personal') return false;
      const due = new Date(c.date_out);
      due.setDate(due.getDate() + DEFAULT_RETURN_DAYS);
      return due.toISOString().slice(0, 10) === dateStr;
    });
    return { out, dueReturn };
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
    setSelectedDay(null);
  }
  function goToday() {
    setMonth(today.getMonth());
    setYear(today.getFullYear());
    setSelectedDay(today.toISOString().slice(0, 10));
  }

  const isToday = (d) => d && d.toDateString() === today.toDateString();
  const selectedEvents = selectedDay
    ? eventsOnDate(new Date(selectedDay))
    : null;

  return (
    <div>
      {/* رأس التقويم */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100 text-xs">→ السابق</button>
          <button onClick={goToday} className="px-3 py-1.5 bg-brand-navy text-white rounded-lg hover:opacity-90 text-xs font-bold">اليوم</button>
          <button onClick={nextMonth} className="px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100 text-xs">التالي ←</button>
        </div>
        <h3 className="text-base font-display font-bold text-brand-navy">{monthNames[month]} {year}</h3>
      </div>

      {/* وسيلة الإيضاح */}
      <div className="flex items-center gap-3 text-[10px] text-stone-600 mb-2 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200"></span>إخراج</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200"></span>إرجاع متوقّع</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200"></span>متأخّر</span>
      </div>

      {/* شبكة الأيّام */}
      <div className="border border-stone-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-stone-100 text-[10px] font-bold text-stone-700">
          {weekDays.map(d => <div key={d} className="p-2 text-center border-l border-stone-200 last:border-l-0">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const events = eventsOnDate(d);
            const totalEvents = events.out.length + events.dueReturn.length;
            const isSelected = d && selectedDay === d.toISOString().slice(0, 10);
            const overdue = events.dueReturn.some(c => {
              const due = new Date(c.date_out);
              due.setDate(due.getDate() + DEFAULT_RETURN_DAYS);
              return due < today;
            });
            return (
              <button
                key={i}
                onClick={() => d && setSelectedDay(d.toISOString().slice(0, 10))}
                disabled={!d}
                className={`min-h-[64px] p-1 border border-stone-100 text-right transition ${
                  !d ? 'bg-stone-50/50' :
                  isSelected ? 'bg-brand-navy/10 ring-2 ring-brand-navy ring-inset' :
                  isToday(d) ? 'bg-amber-50 hover:bg-amber-100' :
                  totalEvents > 0 ? 'bg-white hover:bg-stone-50' : 'bg-white hover:bg-stone-50'
                }`}>
                {d && (
                  <>
                    <div className={`text-[11px] font-bold ${isToday(d) ? 'text-amber-700' : 'text-stone-700'}`}>
                      {d.getDate()}
                    </div>
                    {totalEvents > 0 && (
                      <div className="space-y-0.5 mt-1">
                        {events.out.length > 0 && (
                          <div className="text-[9px] bg-orange-100 text-orange-800 rounded px-1 truncate">
                            ↑ {events.out.length} إخراج
                          </div>
                        )}
                        {events.dueReturn.length > 0 && (
                          <div className={`text-[9px] rounded px-1 truncate ${overdue ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                            ↓ {events.dueReturn.length} {overdue ? 'متأخّر' : 'إرجاع'}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* تفاصيل اليوم المختار */}
      {selectedDay && selectedEvents && (
        <div className="mt-3 bg-stone-50 border border-stone-200 rounded-lg p-3">
          <h4 className="text-xs font-bold mb-2">📅 {new Date(selectedDay).toLocaleDateString('ar-SA', { dateStyle: 'full' })}</h4>
          {selectedEvents.out.length === 0 && selectedEvents.dueReturn.length === 0 ? (
            <p className="text-xs text-stone-400">لا أحداث في هذا اليوم</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.out.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-orange-700 mb-1">↑ إخراج ({selectedEvents.out.length})</p>
                  {selectedEvents.out.map(c => (
                    <div key={c.id} className="text-[11px] bg-white border border-orange-200 rounded p-2 mb-1">
                      <strong>{c.item_name}</strong> ×{c.quantity} · لـ {c.user_name} · من {c.box_code}
                      {c.purpose === 'initiative' && c.initiative && <div className="text-[10px] text-blue-700 mt-0.5">مبادرة: {c.initiative}</div>}
                    </div>
                  ))}
                </div>
              )}
              {selectedEvents.dueReturn.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-blue-700 mb-1">↓ إرجاع متوقّع ({selectedEvents.dueReturn.length})</p>
                  {selectedEvents.dueReturn.map(c => (
                    <div key={c.id} className="text-[11px] bg-white border border-blue-200 rounded p-2 mb-1">
                      <strong>{c.item_name}</strong> ×{c.quantity} · من {c.user_name} · أُخرِج في {c.date_out}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
