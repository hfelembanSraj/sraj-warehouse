import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { ZONE_CATEGORIES, USER_ROLES, DEFAULT_RETURN_DAYS } from '../lib/constants';
import { todayStr, daysSince, isOverdue, getInitials, suggestLocation } from '../lib/helpers';

import WarehouseMap from '../components/WarehouseMap';
import ZoneView from '../components/ZoneView';
import CheckoutsTab from '../components/CheckoutsTab';
import DamagedTab from '../components/DamagedTab';
import DonatedTab from '../components/DonatedTab';
import LogTab from '../components/LogTab';
import ReportsTab from '../components/ReportsTab';
import QrTab from '../components/QrTab';
import UsersTab from '../components/UsersTab';
import RequestsTab from '../components/RequestsTab';
import FounderTab from '../components/FounderTab';

export default function Dashboard() {
  const { user, profile, signOut, can, warehouseId, isFounder, isSysadmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('map');
  const [currentZone, setCurrentZone] = useState(null);
  const [data, setData] = useState({ boxes: [], items: [], checkouts: [], damaged: [], donated: [], log: [], requests: [], users: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (warehouseId) loadAllData();
  }, [warehouseId]);

  async function loadAllData() {
    setLoading(true);
    try {
      const [boxesR, itemsR, checkoutsR, damagedR, donatedR, logR, requestsR, usersR] = await Promise.all([
        supabase.from('boxes').select('*').eq('warehouse_id', warehouseId).order('code'),
        supabase.from('items').select('*, boxes!inner(warehouse_id)').eq('boxes.warehouse_id', warehouseId),
        supabase.from('checkouts').select('*').eq('warehouse_id', warehouseId).is('returned_at', null).is('damaged_at', null).is('donated_at', null).order('date_out', { ascending: false }),
        supabase.from('damaged_items').select('*').eq('warehouse_id', warehouseId).order('damaged_at', { ascending: false }),
        supabase.from('donated_items').select('*').eq('warehouse_id', warehouseId).order('donated_at', { ascending: false }),
        supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('join_requests').select('*').eq('warehouse_id', warehouseId).eq('status', 'pending'),
        supabase.from('user_warehouses').select('*, profiles!inner(*)').eq('warehouse_id', warehouseId)
      ]);
      setData({
        boxes: boxesR.data || [],
        items: itemsR.data || [],
        checkouts: checkoutsR.data || [],
        damaged: damagedR.data || [],
        donated: donatedR.data || [],
        log: logR.data || [],
        requests: requestsR.data || [],
        users: usersR.data || []
      });
    } catch (e) {
      console.error('خطأ في تحميل البيانات:', e);
    }
    setLoading(false);
  }

  const overdueCount = data.checkouts.filter(c => isOverdue(c)).length;
  const role = profile?.role || 'user';
  const isManager = isFounder || isSysadmin || data.users.find(u => u.user_id === user?.id)?.role === 'whmanager';

  const tabs = [
    { key: 'map', label: 'المستودع' },
    { key: 'checkouts', label: 'الإخراج/الإرجاع', badge: overdueCount },
    { key: 'damaged', label: 'المتلفات' },
    { key: 'donated', label: 'الدعم' },
    { key: 'log', label: 'السجل' },
    { key: 'reports', label: 'التقارير' },
    { key: 'qr', label: 'رموز QR' }
  ];
  if (isManager) {
    tabs.push({ key: 'requests', label: 'طلبات الانضمام', badge: data.requests.length });
    tabs.push({ key: 'users', label: 'المستخدمون' });
  }
  if (isFounder) {
    tabs.push({ key: 'founder', label: '👑 إعدادات المؤسّس' });
  }

  async function handleLogout() {
    await logActivity('خروج', 'تسجيل خروج', '—');
    await signOut();
    navigate('/login');
  }

  function handleTabChange(t) {
    setActiveTab(t);
    setCurrentZone(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-stone-600">جاري تحميل بيانات المستودع...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Top Bar */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20 no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-blue text-white flex items-center justify-center font-display font-bold">س</div>
            <div>
              <h1 className="text-sm font-display font-bold">جمعية المسؤولية الاجتماعية</h1>
              <p className="text-xs text-stone-500">المستودع الرئيسي</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isFounder && profile?.stealth_mode && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium bg-stone-900 text-white px-2 py-1 rounded-full" title="وضع التخفّي مفعّل — أعمالك لا تُسجَّل">
                👻 تخفّي
              </span>
            )}
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium flex items-center gap-1 justify-end">
                {profile?.full_name || 'مستخدم'}
                {isFounder && <span title="المؤسّس">👑</span>}
              </div>
              <div className="text-[10px] text-stone-500">{isFounder ? 'المؤسّس' : USER_ROLES[role]}</div>
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isFounder ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400' : 'bg-blue-100 text-brand-blue'}`}>
              {getInitials(profile?.full_name)}
            </div>
            <button onClick={handleLogout} className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100">
              خروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {/* Overdue Alert */}
        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-3 animate-pulse-alert">
            <div className="text-2xl">⚠</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">تنبيه شديد: رجّع الأغراض!</p>
              <p className="text-xs text-red-700">يوجد {overdueCount} عُدّة تجاوزت {DEFAULT_RETURN_DAYS} أيام دون إرجاع</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-stone-200 p-1 mb-4 overflow-x-auto no-print">
          <div className="flex gap-1 min-w-max">
            {tabs.map(t => (
              <button key={t.key} onClick={() => handleTabChange(t.key)}
                className={`px-3 py-2 rounded-lg text-xs whitespace-nowrap transition flex items-center gap-1.5 ${
                  activeTab === t.key ? 'bg-brand-blue text-white font-medium' : 'text-stone-600 hover:bg-stone-100'
                }`}>
                {t.label}
                {t.badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === t.key ? 'bg-white text-brand-blue' : 'bg-red-500 text-white'}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {activeTab === 'map' && !currentZone && <WarehouseMap data={data} onZoneClick={setCurrentZone} onRefresh={loadAllData} />}
          {activeTab === 'map' && currentZone && <ZoneView zone={currentZone} data={data} onBack={() => setCurrentZone(null)} onRefresh={loadAllData} />}
          {activeTab === 'checkouts' && <CheckoutsTab data={data} onRefresh={loadAllData} />}
          {activeTab === 'damaged' && <DamagedTab data={data} onRefresh={loadAllData} />}
          {activeTab === 'donated' && <DonatedTab data={data} />}
          {activeTab === 'log' && <LogTab data={data} />}
          {activeTab === 'reports' && <ReportsTab data={data} />}
          {activeTab === 'qr' && <QrTab warehouseId={warehouseId} />}
          {activeTab === 'requests' && isManager && <RequestsTab data={data} onRefresh={loadAllData} />}
          {activeTab === 'users' && isManager && <UsersTab data={data} onRefresh={loadAllData} />}
          {activeTab === 'founder' && isFounder && <FounderTab onRefresh={loadAllData} />}
        </div>
      </main>
    </div>
  );
}
