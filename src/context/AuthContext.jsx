import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const ALL_PERMISSIONS = { view: true, checkout: true, return: true, add: true, edit: true, delete: true };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [warehouseId, setWarehouseId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // جلب الجلسة الحالية عند التحميل
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserData(session.user);
      } else {
        setLoading(false);
      }
    });

    // الاستماع لتغيّرات المصادقة
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserData(session.user);
      } else {
        setUser(null);
        setProfile(null);
        setPermissions(null);
        setWarehouseId(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserData(authUser) {
    setUser(authUser);

    // جلب الملف الشخصي (يشمل is_founder و stealth_mode)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();
    setProfile(profileData);

    // المؤسّس له كل الصلاحيات تلقائياً، حتى لو لم يكن مرتبطاً بمستودع بعد
    if (profileData?.is_founder) {
      // محاولة جلب أي مستودع مرتبط، وإلا نأخذ المستودع الرئيسي مباشرةً
      const { data: uw } = await supabase
        .from('user_warehouses')
        .select('warehouse_id')
        .eq('user_id', authUser.id)
        .limit(1)
        .maybeSingle();

      if (uw?.warehouse_id) {
        setWarehouseId(uw.warehouse_id);
      } else {
        const { data: anyWh } = await supabase
          .from('warehouses')
          .select('id')
          .limit(1)
          .maybeSingle();
        if (anyWh?.id) setWarehouseId(anyWh.id);
      }
      setPermissions(ALL_PERMISSIONS);
      setLoading(false);
      return;
    }

    // جلب صلاحيات المستخدم في المستودع
    const { data: uw } = await supabase
      .from('user_warehouses')
      .select('warehouse_id, permissions, role')
      .eq('user_id', authUser.id)
      .eq('approved', true)
      .limit(1)
      .maybeSingle();

    if (uw) {
      setWarehouseId(uw.warehouse_id);
      setPermissions(uw.permissions);
      // إذا كان المستخدم مدير نظام أو مدير مستودع، أعطه كل الصلاحيات
      if (profileData?.role === 'sysadmin' || uw.role === 'whmanager') {
        setPermissions(ALL_PERMISSIONS);
      }
    }

    setLoading(false);
  }

  async function refreshProfile() {
    if (!user) return;
    await loadUserData(user);
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signUp(email, password, fullName, warehouseId) {
    // إنشاء الحساب
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) return { error };

    // إنشاء طلب انضمام للمستودع
    if (data.user) {
      await supabase.from('join_requests').insert({
        user_id: data.user.id,
        warehouse_id: warehouseId,
        full_name: fullName,
        email
      });
    }
    return { data };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // التحقّق من الصلاحية — المؤسّس يتجاوز كل القيود
  function can(permission) {
    if (profile?.is_founder) return true;
    if (profile?.role === 'sysadmin') return true;
    if (!permissions) return false;
    return permissions[permission] === true;
  }

  const isFounder = profile?.is_founder === true;
  const isSysadmin = profile?.role === 'sysadmin' || isFounder;

  return (
    <AuthContext.Provider value={{
      user, profile, permissions, warehouseId, loading,
      isFounder, isSysadmin,
      signIn, signUp, signOut, can, refreshProfile
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
