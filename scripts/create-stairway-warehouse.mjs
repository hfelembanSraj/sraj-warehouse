// سكربت لإنشاء "مستودع المدرّج" مع كامل المساحات والأرفف
// يُشغَّل من GitHub Actions بمفتاح service_role لتجاوز قيود RLS
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  console.log('🔍 البحث عن المؤسّس...');
  const { data: founder, error: fErr } = await supa
    .from('profiles')
    .select('id, email, full_name')
    .eq('is_founder', true)
    .single();
  if (fErr || !founder) {
    throw new Error('لم يُعثر على المؤسّس: ' + (fErr?.message || 'غير موجود'));
  }
  console.log(`✓ المؤسّس: ${founder.full_name || founder.email}`);

  // التحقّق من عدم وجود مستودع بنفس الاسم
  const { data: existing } = await supa
    .from('warehouses')
    .select('id, name')
    .eq('name', 'مستودع المدرّج');
  if (existing && existing.length > 0) {
    console.log('⚠️  يوجد بالفعل مستودع باسم "مستودع المدرّج" — سيُستخدم نفسه');
    return;
  }

  console.log('🏗  إنشاء المستودع...');
  const { data: wh, error: whErr } = await supa.from('warehouses').insert({
    name: 'مستودع المدرّج',
    description: 'مستودع بمدرج تخزين على الجدار الأيسر — درجان × مساحتان = 4 مساحات',
    width_m: 4, depth_m: 4, height_m: 2.3
  }).select().single();
  if (whErr) throw new Error('فشل إنشاء المستودع: ' + whErr.message);
  console.log(`✓ المستودع: ${wh.id}`);

  console.log('🔗 ربط المؤسّس بالمستودع...');
  const { error: uwErr } = await supa.from('user_warehouses').insert({
    user_id: founder.id,
    warehouse_id: wh.id,
    role: 'whmanager',
    approved: true,
    permissions: { view: true, checkout: true, return: true, add: true, edit: true, delete: true }
  });
  if (uwErr) throw new Error('فشل الربط: ' + uwErr.message);

  // المساحات الأربع للمدرّج
  // - الدرج السفلي (A, B): مساحة عاديّة بـ2 رفّ — تخزين أصغر
  // - الدرج العلوي (C, D): مساحة مضاعفة بـ4 أرفف — تخزينه يمتدّ للأرض
  const zones = [
    { letter: 'A', name: 'درج سفلي · يمين', color: '#F58220', shelves_count: 2,
      pos_top: 52, pos_left: 22, pos_right: null, pos_width: 18, pos_height: 42, display_order: 1 },
    { letter: 'B', name: 'درج سفلي · يسار', color: '#FFCC00', shelves_count: 2,
      pos_top: 52, pos_left: 4,  pos_right: null, pos_width: 18, pos_height: 42, display_order: 2 },
    { letter: 'C', name: 'درج علوي · يمين', color: '#7B2D8E', shelves_count: 4,
      pos_top: 6,  pos_left: 22, pos_right: null, pos_width: 18, pos_height: 42, display_order: 3 },
    { letter: 'D', name: 'درج علوي · يسار', color: '#E91E8B', shelves_count: 4,
      pos_top: 6,  pos_left: 4,  pos_right: null, pos_width: 18, pos_height: 42, display_order: 4 }
  ];

  for (const z of zones) {
    console.log(`📦 إنشاء مساحة ${z.letter} — ${z.name}...`);
    const { data: zone, error: zErr } = await supa.from('zones').insert({
      warehouse_id: wh.id,
      letter: z.letter, name: z.name, color: z.color,
      width_cm: 100, height_cm: 230, depth_cm: 65,
      pos_top: z.pos_top, pos_left: z.pos_left, pos_right: z.pos_right,
      pos_width: z.pos_width, pos_height: z.pos_height,
      display_order: z.display_order
    }).select().single();
    if (zErr) throw new Error(`فشل إنشاء مساحة ${z.letter}: ${zErr.message}`);

    const shelfRows = Array.from({ length: z.shelves_count }, (_, i) => ({
      zone_id: zone.id,
      shelf_index: i + 1,
      height_cm: 70,
      max_boxes: 4
    }));
    const { error: sErr } = await supa.from('shelves').insert(shelfRows);
    if (sErr) throw new Error(`فشل إنشاء أرفف ${z.letter}: ${sErr.message}`);
    console.log(`  ✓ ${z.shelves_count} أرفف`);
  }

  console.log('\n✅ نجاح! تمّ إنشاء "مستودع المدرّج" مع 4 مساحات و12 رفّاً.');
  console.log(`   المعرّف: ${wh.id}`);
}

main().catch(err => {
  console.error('❌ خطأ:', err.message);
  process.exit(1);
});
