// أيقونة جرس + قائمة منسدلة بآخر الأحداث في المستودع
// تعتمد على activity_log — المُستخدم يرى ما حدث منذ آخر فتح للقائمة
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const LAST_SEEN_KEY = 'sraj.notificationsLastSeen';

export default function NotificationsBell() {
  const { warehouseId } = useAuth();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeen, setLastSeen] = useState(() => {
    const stored = localStorage.getItem(LAST_SEEN_KEY);
    return stored ? new Date(stored) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  });
  const ref = useRef(null);

  // تحميل آخر السجلّ كلّ 30 ثانية
  useEffect(() => {
    let timer;
    async function load() {
      const { data } = await supabase.from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      setEntries(data || []);
      const unread = (data || []).filter(e => new Date(e.created_at) > lastSeen).length;
      setUnreadCount(unread);
    }
    load();
    timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [lastSeen, warehouseId]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function handleOpen() {
    setOpen(o => !o);
    if (!open) {
      // عند الفتح، حدِّث آخر مشاهدة
      const now = new Date();
      setLastSeen(now);
      localStorage.setItem(LAST_SEEN_KEY, now.toISOString());
      setUnreadCount(0);
    }
  }

  function timeAgo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'الآن';
    if (m < 60) return `قبل ${m} د`;
    const h = Math.floor(m / 60);
    if (h < 24) return `قبل ${h} س`;
    const d = Math.floor(h / 24);
    if (d < 7) return `قبل ${d} ي`;
    return new Date(iso).toLocaleDateString('ar-SA');
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={handleOpen}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-stone-100 transition"
        title="الإشعارات">
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-brand-pink text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 sm:left-auto sm:right-0 w-80 sm:w-96 max-h-[70vh] overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-2xl z-50 animate-fade-in">
          <div className="bg-gradient-to-l from-brand-navy to-brand-purple text-white px-4 py-2.5 flex items-center justify-between sticky top-0">
            <div>
              <div className="text-sm font-bold">🔔 الإشعارات</div>
              <div className="text-[10px] opacity-90">آخر 30 حدثاً في المستودع</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-lg leading-none">×</button>
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-sm">
              <div className="text-3xl mb-2">📭</div>
              لا توجد أحداث بعد
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {entries.map(e => {
                const isNew = new Date(e.created_at) > lastSeen;
                return (
                  <div key={e.id} className={`p-3 text-xs ${isNew ? 'bg-blue-50/50' : ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="font-bold text-brand-navy">{e.action}</span>
                      <span className="text-[10px] text-stone-500 whitespace-nowrap">{timeAgo(e.created_at)}</span>
                    </div>
                    {e.target && <div className="text-stone-700 text-[11px]">📌 {e.target}</div>}
                    {e.location && <div className="text-[10px] text-stone-500">📍 {e.location}</div>}
                    <div className="text-[10px] text-stone-500 mt-0.5">بواسطة <strong>{e.user_name}</strong></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
