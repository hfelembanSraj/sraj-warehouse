// إعادة هيكلة "مستودع المدرّج":
//   - الدرج السفلي: 3 مساحات بدون أرفف (مفتوحة)
//   - الدرج العلوي: 2 مساحة بـ2 رفّ في كلٍّ منهما
//   - كلّ المساحات بلون خشبي بنّي
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const WOOD_BROWN = '#8B6F3F';   // لون الخشب الأساسي (يطابق إطار الكرتون الموجود)
const WOOD_BROWN_DARK = '#6B5631';

async function main() {
  console.log('🔍 البحث عن مستودع المدرّج...');
  const { data: wh, error: whErr } = await supa
    .from('warehouses')
    .select('id, name')
    .eq('name', 'مستودع المدرّج')
    .single();
  if (whErr || !wh) throw new Error('لم يُعثر على المستودع: ' + (whErr?.message || 'غير موجود'));
  console.log(`✓ المستودع: ${wh.id}`);

  // مسح أيّ صناديق قد تكون موجودة قبل الحذف الناعم
  console.log('🧹 تنظيف الصناديق القديمة...');
  await supa.from('boxes').delete().eq('warehouse_id', wh.id);

  // مسح المساحات (يحذف الأرفف بالـcascade)
  console.log('🧹 تنظيف المساحات والأرفف القديمة...');
  const { error: dzErr } = await supa.from('zones').delete().eq('warehouse_id', wh.id);
  if (dzErr) throw new Error('فشل حذف المساحات: ' + dzErr.message);

  // الهيكل الجديد:
  //   3 مساحات في الدرج السفلي (مفتوحة، رف واحد لاستيعاب الصناديق)
  //   2 مساحة في الدرج العلوي (رفّان لكلّ منهما)
  //   كلّها بلون خشبي بنّي
  const zones = [
    // الدرج السفلي (3 مساحات في صفّ، بدون أرفف بصرياً)
    { letter: 'A', name: 'سفلي · يمين',  shelves: 1, max_per_shelf: 4,
      pos_top: 55, pos_left: 30, pos_width: 14, pos_height: 38, display_order: 1 },
    { letter: 'B', name: 'سفلي · وسط',   shelves: 1, max_per_shelf: 4,
      pos_top: 55, pos_left: 16, pos_width: 14, pos_height: 38, display_order: 2 },
    { letter: 'C', name: 'سفلي · يسار',  shelves: 1, max_per_shelf: 4,
      pos_top: 55, pos_left: 2,  pos_width: 14, pos_height: 38, display_order: 3 },
    // الدرج العلوي (مساحتان، رفّان لكلّ مساحة)
    { letter: 'D', name: 'علوي · يمين',  shelves: 2, max_per_shelf: 4,
      pos_top: 5,  pos_left: 23, pos_width: 21, pos_height: 42, display_order: 4 },
    { letter: 'E', name: 'علوي · يسار',  shelves: 2, max_per_shelf: 4,
      pos_top: 5,  pos_left: 2,  pos_width: 21, pos_height: 42, display_order: 5 }
  ];

  for (const z of zones) {
    console.log(`📦 ${z.letter} — ${z.name}...`);
    const { data: zone, error: zErr } = await supa.from('zones').insert({
      warehouse_id: wh.id,
      letter: z.letter, name: z.name, color: WOOD_BROWN,
      width_cm: 100, height_cm: 230, depth_cm: 65,
      pos_top: z.pos_top, pos_left: z.pos_left, pos_right: null,
      pos_width: z.pos_width, pos_height: z.pos_height,
      display_order: z.display_order
    }).select().single();
    if (zErr) throw new Error(`فشل ${z.letter}: ${zErr.message}`);

    const shelfRows = Array.from({ length: z.shelves }, (_, i) => ({
      zone_id: zone.id,
      shelf_index: i + 1,
      height_cm: 70,
      max_boxes: z.max_per_shelf
    }));
    await supa.from('shelves').insert(shelfRows);
    console.log(`  ✓ ${z.shelves} رفّ، ${z.max_per_shelf} صناديق/رفّ`);
  }

  console.log('\n✅ تمّت إعادة الهيكلة: 5 مساحات (3 سفلي + 2 علوي)، كلّها خشبيّة بنّيّة');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
