import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const ALL_PERMISSIONS = { view: true, checkout: true, return: true, add: true, edit: true, delete: true };
const ACTIVE_WH_KEY = 'sraj.activeWarehouseId';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [warehouseId, setWarehouseIdState] = useState(null);
  const [warehouses, setWarehouses] = useState([]);  // كل المستودعات المتاحة للمستخدم
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserData(session.user);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserData(session.user);
      } else {
        setUser(null);
        setProfile(null);
        setPermissions(null);
        setWarehouseIdState(null);
        setWarehouses([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserData(authUser) {
    setUser(authUser);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();
    setProfile(profileData);

    let availableWarehouses = [];
    let perms = null;
    let activeWhId = null;

    if (profileData?.is_founder) {
      // المؤسّس يرى كل المستودعات
      const { data: allWh } = await supabase
        .from('warehouses')
        .select('*')
        .order('created_at');
      availableWarehouses = (allWh || []).map(w => ({
        ...w,
        role: 'founder',
        permissions: ALL_PERMISSIONS,
        approved: true
      }));
      perms = ALL_PERMISSIONS;
    } else {
      // غير المؤسّس: يرى فقط مستودعاته المعتمَدة
      const { data: memberships } = await supabase
        .from('user_warehouses')
        .select('warehouse_id, role, permissions, approved, warehouses(*)')
        .eq('user_id', authUser.id)
        .eq('approved', true);

      availableWarehouses = (memberships || []).map(m => ({
        ...m.warehouses,
        role: m.role,
        permissions: (m.role === 'whmanager' || profileData?.role === 'sysadmin') ? ALL_PERMISSIONS : m.permissions,
        approved: m.approved
      }));
    }

    // اختيار المستودع النشط: من localStorage أوّلاً، وإلا الأوّل
    const stored = localStorage.getItem(ACTIVE_WH_KEY);
    const storedExists = availableWarehouses.find(w => w.id === stored);
    if (storedExists) {
      activeWhId = stored;
      perms = storedExists.permissions;
    } else if (availableWarehouses.length > 0) {
      activeWhId = availableWarehouses[0].id;
      perms = availableWarehouses[0].permissions;
    }

    setWarehouses(availableWarehouses);
    setWarehouseIdState(activeWhId);
    setPermissions(perms);
    setLoading(false);
  }

  // تبديل المستودع النشط
  const setWarehouseId = useCallback((newId) => {
    const wh = warehouses.find(w => w.id === newId);
    if (!wh) return;
    localStorage.setItem(ACTIVE_WH_KEY, newId);
    setWarehouseIdState(newId);
    setPermissions(wh.permissions);
  }, [warehouses]);

  async function refreshProfile() {
    if (!user) return;
    await loadUserData(user);
  }

  async function refreshWarehouses() {
    if (!user) return;
    await loadUserData(user);
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  // warehouseIds: مصفوفة معرّفات المستودعات المطلوب الانضمام إليها
  // يُنشأ طلب انضمام مستقلّ لكلّ مستودع (يوافق عليه مدير كلّ مستودع)
  async function signUp(email, password, fullName, warehouseIds) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) return { error };

    if (data.user && warehouseIds?.length) {
      const rows = warehouseIds.map(wid => ({
        user_id: data.user.id,
        warehouse_id: wid,
        full_name: fullName,
        email
      }));
      const { error: jrErr } = await supabase.from('join_requests').insert(rows);
      if (jrErr) return { error: jrErr };
    }
    return { data };
  }

  async function signOut() {
    localStorage.removeItem(ACTIVE_WH_KEY);
    await supabase.auth.signOut();
  }

  // إرسال رابط استرجاع كلمة المرور إلى البريد المسجَّل
  async function resetPassword(email) {
    return supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`
    });
  }

  // تعيين كلمة مرور جديدة (بعد فتح رابط الاسترجاع)
  async function updatePassword(newPassword) {
    return supabase.auth.updateUser({ password: newPassword });
  }

  function can(permission) {
    if (profile?.is_founder) return true;
    if (profile?.role === 'sysadmin') return true;
    if (!permissions) return false;
    return permissions[permission] === true;
  }

  const isFounder = profile?.is_founder === true;
  const isSysadmin = profile?.role === 'sysadmin' || isFounder;
  const activeWarehouse = warehouses.find(w => w.id === warehouseId) || null;

  return (
    <AuthContext.Provider value={{
      user, profile, permissions, warehouseId, warehouses, activeWarehouse, loading,
      isFounder, isSysadmin,
      signIn, signUp, signOut, can, refreshProfile, refreshWarehouses, setWarehouseId,
      resetPassword, updatePassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth يجب استخدامه داخل AuthProvider');
  return ctx;
}
