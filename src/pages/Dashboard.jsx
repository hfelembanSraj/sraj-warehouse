import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { USER_ROLES, DEFAULT_RETURN_DAYS } from '../lib/constants';
import { isOverdue, getInitials } from '../lib/helpers';

import WarehouseMap from '../components/WarehouseMap';
import ZoneView from '../components/ZoneView';
import ShelfView from '../components/ShelfView';
import BoxView from '../components/BoxView';
import CheckoutsTab from '../components/CheckoutsTab';
import DamagedTab from '../components/DamagedTab';
import DonatedTab from '../components/DonatedTab';
import LogTab from '../components/LogTab';
import ReportsTab from '../components/ReportsTab';
import QrTab from '../components/QrTab';
import UsersTab from '../components/UsersTab';
import RequestsTab from '../components/RequestsTab';
import FounderTab from '../components/FounderTab';
import WarehousesHome from '../components/WarehousesHome';
import WarehouseSwitcher from '../components/WarehouseSwitcher';
import WarehouseBuilder from '../components/WarehouseBuilder';
import QrScannerModal from '../components/QrScannerModal';
import GlobalSearch from '../components/GlobalSearch';

export default function Dashboard() {
  const { user, profile, signOut, can, warehouseId, activeWarehouse, isFounder, isSysadmin, refreshWarehouses, setWarehouseId } = useAuth();
  const navigate = useNavigate();
  const initialTab = isFounder ? 'home' : 'map';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [enteredWarehouse, setEnteredWarehouse] = useState(false);
  const [currentZone, setCurrentZone] = useState(null);
  const [currentShelf, setCurrentShelf] = useState(null);
  const [currentBox, setCurrentBox] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [data, setData] = useState({
    boxes: [], items: [], checkouts: [], damaged: [], donated: [],
    log: [], requests: [], users: [], zones: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (warehouseId) loadAllData();
  }, [warehouseId]);

  // معالجة روابط QR (?wh=&zone=&box=) عند التحميل أو بعد المسح
  function handleScannedUrl(rawUrl) {
    let urlStr = rawUrl;
    let params;
    try {
      const u = new URL(rawUrl);
      params = u.searchParams;
    } catch {
      // ربّما النص ليس URL — قد يكون رمز صندوق فقط
      const match = rawUrl.match(/^([A-Z])-(\d+)-(\d+)$/);
      if (match) params = new URLSearchParams({ box: rawUrl });
      else return;
    }

    const whId = params.get('wh');
    const zoneLetter = params.get('zone');
    const boxCode = params.get('box');

    if (whId && whId !== warehouseId) {
      setWarehouseId?.(whId);
    }
    if (boxCode) {
      const box = data.boxes.find(b => b.code === boxCode);
      if (box) {
        const zone = data.zones.find(z => boxCode.startsWith(z.letter + '-'));
        const shelfIndex = parseInt(boxCode.split('-')[1]);
        const shelf = zone?.shelves.find(s => s.shelf_index === shelfIndex);
        if (zone) setCurrentZone(zone);
        if (shelf) setCurrentShelf(shelf);
        setCurrentBox(box);
        if (isFounder) setEnteredWarehouse(true);
        setActiveTab(isFounder ? 'home' : 'map');
      }
    } else if (zoneLetter) {
      const zone = data.zones.find(z => z.letter === zoneLetter);
      if (zone) {
        setCurrentZone(zone);
        setCurrentShelf(null);
        setCurrentBox(null);
        if (isFounder) setEnteredWarehouse(true);
        setActiveTab(isFounder ? 'home' : 'map');
      }
    }
  }

  // قراءة URL params مرّة واحدة بعد تحميل البيانات
  useEffect(() => {
    if (data.zones.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('zone') || params.get('box')) {
      handleScannedUrl(window.location.href);
      // تنظيف الـ URL بعد الاستخدام
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [data.zones.length]);

  async function loadAllData() {
    if (!warehouseId) return;
    setLoading(true);
    try {
      const [boxesR, itemsR, checkoutsR, damagedR, donatedR, logR, requestsR, usersR, layoutR] = await Promise.all([
        supabase.from('boxes').select('*').eq('warehouse_id', warehouseId).order('code'),
        supabase.from('items').select('*, boxes!inner(warehouse_id)').eq('boxes.warehouse_id', warehouseId),
        supabase.from('checkouts').select('*').eq('warehouse_id', warehouseId).is('returned_at', null).is('damaged_at', null).is('donated_at', null).order('date_out', { ascending: false }),
        supabase.from('damaged_items').select('*').eq('warehouse_id', warehouseId).order('damaged_at', { ascending: false }),
        supabase.from('donated_items').select('*').eq('warehouse_id', warehouseId).order('donated_at', { ascending: false }),
        supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('join_requests').select('*').eq('warehouse_id', warehouseId).eq('status', 'pending'),
        supabase.from('user_warehouses').select('*, profiles!inner(*)').eq('warehouse_id', warehouseId),
        supabase.rpc('get_warehouse_layout', { wh_id: warehouseId })
      ]);
      setData({
        boxes: boxesR.data || [],
        items: itemsR.data || [],
        checkouts: checkoutsR.data || [],
        damaged: damagedR.data || [],
        donated: donatedR.data || [],
        log: logR.data || [],
        requests: requestsR.data || [],
        users: usersR.data || [],
        zones: layoutR.data?.zones || []
      });
    } catch (e) {
      console.error('خطأ في تحميل البيانات:', e);
    }
    setLoading(false);
  }

  const overdueCount = data.checkouts.filter(c => isOverdue(c)).length;
  const role = profile?.role || 'user';
  const isManager = isFounder || isSysadmin || data.users.find(u => u.user_id === user?.id)?.role === 'whmanager';

  // الترتيب: المستودعات (للمؤسّس) أو المستودع (لغير المؤسّس) ثم بقيّة التبويبات
  const tabs = [];
  if (isFounder) {
    tabs.push({ key: 'home', label: '🏢 المستودعات' });
  } else {
    tabs.push({ key: 'map', label: 'المستودع' });
  }
  tabs.push(
    { key: 'checkouts', label: 'الإخراج/الإرجاع', badge: overdueCount },
    { key: 'damaged', label: 'المتلفات' },
    { key: 'donated', label: 'الدعم' },
    { key: 'log', label: 'السجل' },
    { key: 'reports', label: 'التقارير' },
    { key: 'qr', label: 'رموز QR' }
  );
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
    setCurrentShelf(null);
    setCurrentBox(null);
    if (t === 'home') setEnteredWarehouse(false);
  }

  function backToMap()    { setCurrentZone(null); setCurrentShelf(null); setCurrentBox(null); }
  function backToZone()   { setCurrentShelf(null); setCurrentBox(null); }
  function backToShelf()  { setCurrentBox(null); }
  function openZone(zone)   { setCurrentZone(zone); setCurrentShelf(null); setCurrentBox(null); }
  function openShelf(shelf) { setCurrentShelf(shelf); setCurrentBox(null); }
  function openBox(box)     { setCurrentBox(box); }

  function handleEnterWarehouseFromHome(whId) {
    setWarehouseId?.(whId);
    setEnteredWarehouse(true);
    backToMap();
  }

  function handleExitWarehouse() {
    setEnteredWarehouse(false);
    backToMap();
  }

  function handleSearchJump(target) {
    if (target.type === 'warehouse') {
      if (target.id !== warehouseId) setWarehouseId?.(target.id);
      backToMap();
      if (isFounder) setEnteredWarehouse(true);
      setActiveTab(isFounder ? 'home' : 'map');
    } else if (target.type === 'zone') {
      if (target.warehouseId !== warehouseId) setWarehouseId?.(target.warehouseId);
      // الانتظار قليلاً لتحميل البيانات الجديدة (يتم بعد setWarehouseId)
      setTimeout(() => {
        const zone = data.zones.find(z => z.letter === target.letter);
        if (zone) setCurrentZone(zone);
      }, 100);
      setCurrentShelf(null);
      setCurrentBox(null);
      if (isFounder) setEnteredWarehouse(true);
      setActiveTab(isFounder ? 'home' : 'map');
    } else if (target.type === 'box' && target.boxCode) {
      if (target.warehouseId && target.warehouseId !== warehouseId) {
        setWarehouseId?.(target.warehouseId);
      }
      // الانتقال يحدث بعد تحديث البيانات
      setTimeout(() => {
        handleScannedUrl(`?wh=${target.warehouseId || warehouseId}&box=${target.boxCode}`);
      }, 100);
    }
  }

  async function handleBuilderRefresh() {
    await refreshWarehouses();
    await loadAllData();
  }

  // ====== رسم رحلة الخريطة (الرئيسية → مساحة → رف → صندوق) ======
  function renderMapDrillDown() {
    if (!currentZone) {
      return <WarehouseMap data={data} onZoneClick={openZone} onRefresh={loadAllData} />;
    }
    if (!currentShelf) {
      return <ZoneView zone={currentZone} data={data} onBack={backToMap} onShelfClick={openShelf} onRefresh={loadAllData} />;
    }
    if (!currentBox) {
      return <ShelfView zone={currentZone} shelf={currentShelf} data={data}
        onBackToMap={backToMap} onBackToZone={backToZone}
        onBoxClick={openBox} onRefresh={loadAllData} />;
    }
    return <BoxView zone={currentZone} shelf={currentShelf} box={currentBox} data={data}
      onBackToMap={backToMap} onBackToZone={backToZone} onBackToShelf={backToShelf}
      onRefresh={loadAllData} />;
  }

  if (loading && data.zones.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-stone-600">جاري تحميل بيانات المستودع...</p>
        </div>
      </div>
    );
  }

  // عند المؤسّس على تبويب المستودعات وقد دخل مستودعاً، نعرض الخريطة مع زر رجوع
  const showHomeContent = activeTab === 'home' && isFounder && !enteredWarehouse;
  const showMapContent  = (activeTab === 'home' && isFounder && enteredWarehouse) || (activeTab === 'map');

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Top Bar */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20 no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-blue text-white flex items-center justify-center font-display font-bold">س</div>
            <WarehouseSwitcher />
            <button
              onClick={() => setShowScanner(true)}
              className="inline-flex items-center gap-1 text-[11px] bg-brand-blue text-white hover:bg-blue-800 px-2.5 py-1.5 rounded-lg font-medium"
              title="مسح رمز QR"
            >
              📷 مسح
            </button>
          </div>
          <div className="hidden md:block flex-1 max-w-sm mx-4">
            <GlobalSearch onJump={handleSearchJump} />
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

        {/* عند الدخول لمستودع: شريط رجوع للمستودعات + اسم المستودع */}
        {activeTab === 'home' && isFounder && enteredWarehouse && (
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-2 mb-4 flex items-center justify-between gap-2">
            <button onClick={handleExitWarehouse}
              className="text-xs px-3 py-1.5 border border-stone-300 rounded-lg hover:bg-stone-100 flex items-center gap-1">
              ← الرجوع لقائمة المستودعات
            </button>
            <div className="text-xs text-stone-600 flex items-center gap-1">
              <span>📦</span>
              <span className="font-bold">{activeWarehouse?.name}</span>
            </div>
          </div>
        )}

        {/* محتوى التبويبات */}
        <div className="animate-fade-in">
          {showHomeContent && (
            <WarehousesHome
              onEnterWarehouse={handleEnterWarehouseFromHome}
              onRefresh={refreshWarehouses}
            />
          )}
          {showMapContent && renderMapDrillDown()}
          {activeTab === 'checkouts' && <CheckoutsTab data={data} onRefresh={loadAllData} />}
          {activeTab === 'damaged' && <DamagedTab data={data} onRefresh={loadAllData} />}
          {activeTab === 'donated' && <DonatedTab data={data} />}
          {activeTab === 'log' && <LogTab data={data} />}
          {activeTab === 'reports' && <ReportsTab data={data} />}
          {activeTab === 'qr' && <QrTab warehouseId={warehouseId} data={data} />}
          {activeTab === 'requests' && isManager && <RequestsTab data={data} onRefresh={loadAllData} />}
          {activeTab === 'users' && isManager && <UsersTab data={data} onRefresh={loadAllData} />}
          {activeTab === 'founder' && isFounder && <FounderTab onRefresh={loadAllData} onOpenBuilder={() => setShowBuilder(true)} />}
        </div>
      </main>

      {showBuilder && isFounder && (
        <WarehouseBuilder
          onClose={() => setShowBuilder(false)}
          onChanged={handleBuilderRefresh}
        />
      )}

      {showScanner && (
        <QrScannerModal
          onClose={() => setShowScanner(false)}
          onResult={(text) => {
            setShowScanner(false);
            handleScannedUrl(text);
          }}
        />
      )}
    </div>
  );
}
