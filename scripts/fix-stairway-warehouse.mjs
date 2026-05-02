// إعادة هيكلة "مستودع المدرّج":
//   مدرّجان متلاصقان، كلّ مدرّج فيه:
//     - علوي على اليسار (مرتفع، رفّان)
//     - سفلي على اليمين (منخفض، 3 مساحات داخلية بفواصل عرضية)
//   = 4 مساحات إجماليّة (2 علوي + 2 سفلي)
//   كلّها بلون خشبي بنّي موحّد
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const WOOD = '#8B6F3F';

async function main() {
  console.log('🔍 البحث عن مستودع المدرّج...');
  const { data: wh, error: whErr } = await supa
    .from('warehouses').select('id').eq('name', 'مستودع المدرّج').single();
  if (whErr || !wh) throw new Error('لم يُعثر على المستودع');
  console.log(`✓ ${wh.id}`);

  console.log('🧹 مسح الصناديق والمساحات القديمة...');
  await supa.from('boxes').delete().eq('warehouse_id', wh.id);
  await supa.from('zones').delete().eq('warehouse_id', wh.id);

  // الهيكل الصحيح:
  // المدرّج الأول (اليسار في الواجهة): علوي بشمال، سفلي بيمينه
  // المدرّج الثاني (بجانبه): علوي بشمال، سفلي بيمينه — نفس الشيء
  //
  // في الخارطة الأفقيّة (rtl، نظر من فوق) لمستودع 4×4:
  //   المدرّجان يحتلّان الجدار الأيسر كاملاً
  //   كل مدرّج بعرض ~40% من المستودع، ارتفاع ~43%
  //   داخل كل مدرّج: علوي على اليسار (pos_left=2)، سفلي على يمينه (pos_left=22)
  const zones = [
    // المدرّج الأول (في المقدمة، قرب المدخل)
    { letter: 'A', name: 'علوي · أمامي', shelves: 2, max_per_shelf: 4,
      pos_top: 52, pos_left: 2,  pos_width: 18, pos_height: 43, display_order: 1 },
    { letter: 'B', name: 'سفلي · أمامي', shelves: 1, max_per_shelf: 3,  // 3 مساحات داخلية
      pos_top: 52, pos_left: 22, pos_width: 18, pos_height: 43, display_order: 2 },
    // المدرّج الثاني (في الخلف، بجانب الأول)
    { letter: 'C', name: 'علوي · خلفي', shelves: 2, max_per_shelf: 4,
      pos_top: 5,  pos_left: 2,  pos_width: 18, pos_height: 43, display_order: 3 },
    { letter: 'D', name: 'سفلي · خلفي', shelves: 1, max_per_shelf: 3,  // 3 مساحات داخلية
      pos_top: 5,  pos_left: 22, pos_width: 18, pos_height: 43, display_order: 4 }
  ];

  for (const z of zones) {
    console.log(`📦 ${z.letter} — ${z.name}...`);
    const { data: zone, error: zErr } = await supa.from('zones').insert({
      warehouse_id: wh.id,
      letter: z.letter, name: z.name, color: WOOD,
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
    const desc = z.shelves === 1
      ? `1 رفّ مفتوح بـ${z.max_per_shelf} مساحات داخليّة`
      : `${z.shelves} رفّ × ${z.max_per_shelf} صناديق`;
    console.log(`  ✓ ${desc}`);
  }

  console.log('\n✅ تمّت الهيكلة: مدرّجان × (علوي يسار + سفلي يمين) = 4 مساحات');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
