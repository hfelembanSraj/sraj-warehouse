import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ يجب تعيين VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper: تسجيل حركة في السجل
export async function logActivity(action, target, location) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  await supabase.from('activity_log').insert({
    user_id: user.id,
    user_name: profile?.full_name || 'مستخدم',
    action,
    target,
    location
  });
}

// Helper: جلب صلاحيات المستخدم في مستودع محدد
export async function getUserPermissions(userId, warehouseId) {
  const { data } = await supabase
    .from('user_warehouses')
    .select('permissions, role')
    .eq('user_id', userId)
    .eq('warehouse_id', warehouseId)
    .single();
  return data;
}
