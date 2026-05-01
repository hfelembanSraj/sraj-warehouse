import { supabase } from './supabase';

// عمليات المستودعات والمساحات والأرفف والصناديق — كلها للمؤسّس فقط (RLS-enforced)

export async function rpcCreateWarehouse(values) {
  return supabase.rpc('create_warehouse', {
    wh_name: values.name.trim(),
    wh_description: values.description?.trim() || '',
    wh_width_m: Number(values.width_m) || 4,
    wh_depth_m: Number(values.depth_m) || 4,
    wh_height_m: Number(values.height_m) || 2.3
  });
}

export async function rpcRenameWarehouse(wh_id, values) {
  return supabase.rpc('rename_warehouse', {
    wh_id,
    new_name: values.name.trim(),
    new_description: values.description?.trim() || null
  });
}

export async function rpcDeleteWarehouse(wh_id) {
  return supabase.rpc('delete_warehouse', { wh_id });
}

export async function rpcAddZone(wh_id, values) {
  return supabase.rpc('add_zone', {
    wh_id,
    zone_letter: values.letter.toUpperCase(),
    zone_name: values.name.trim(),
    zone_color: values.color,
    zone_width_cm: Number(values.width_cm) || 200,
    zone_height_cm: Number(values.height_cm) || 230,
    zone_depth_cm: Number(values.depth_cm) || 65,
    shelves_count: Number(values.shelves_count) || 3
  });
}

export async function rpcUpdateZone(z, patch) {
  return supabase.rpc('update_zone', {
    z_id: z.id,
    z_name: patch.name ?? null,
    z_color: patch.color ?? null,
    z_width_cm: patch.width_cm ?? null,
    z_height_cm: patch.height_cm ?? null,
    z_depth_cm: patch.depth_cm ?? null,
    z_pos_top: patch.pos_top ?? null,
    z_pos_left: 'pos_left' in patch ? patch.pos_left : z.pos_left,
    z_pos_right: 'pos_right' in patch ? patch.pos_right : z.pos_right,
    z_pos_width: patch.pos_width ?? null,
    z_pos_height: patch.pos_height ?? null
  });
}

export async function rpcDeleteZone(z_id) {
  // cascading soft-delete: المساحة → أرففها → صناديقها → أصنافها
  const now = new Date().toISOString();
  const { data: shelvesData } = await supabase.from('shelves').select('id').eq('zone_id', z_id);
  const shelfIds = (shelvesData || []).map(s => s.id);
  if (shelfIds.length > 0) {
    const { data: boxes } = await supabase.from('boxes').select('id').in('shelf_id', shelfIds).is('deleted_at', null);
    const boxIds = (boxes || []).map(b => b.id);
    if (boxIds.length > 0) {
      await supabase.from('items').update({ deleted_at: now }).in('box_id', boxIds).is('deleted_at', null);
      await supabase.from('boxes').update({ deleted_at: now }).in('id', boxIds);
    }
  }
  return supabase.rpc('delete_zone', { z_id });
}

export async function rpcAddShelf(z_id, values) {
  // الدالة الجديدة تدعم top/bottom + label
  return supabase.rpc('add_shelf_at', {
    z_id,
    s_position: values.position || 'bottom',
    s_height_cm: Number(values.height_cm) || 70,
    s_max_boxes: Number(values.max_boxes) || 4,
    s_label: values.label?.trim() || null
  });
}

export async function rpcUpdateShelf(s_id, patch) {
  return supabase.rpc('update_shelf', {
    s_id,
    s_height_cm: patch.height_cm ?? null,
    s_max_boxes: patch.max_boxes ?? null,
    s_label: patch.label ?? null
  });
}

export async function rpcDeleteShelf(s_id) {
  // أوّلاً: حذف ناعم لكل صناديق هذا الرف وأصنافها (cascading)
  const now = new Date().toISOString();
  const { data: boxes } = await supabase.from('boxes').select('id').eq('shelf_id', s_id).is('deleted_at', null);
  const boxIds = (boxes || []).map(b => b.id);
  if (boxIds.length > 0) {
    await supabase.from('items').update({ deleted_at: now }).in('box_id', boxIds).is('deleted_at', null);
    await supabase.from('boxes').update({ deleted_at: now }).in('id', boxIds);
  }
  // ثانياً: احذف الرف
  return supabase.rpc('delete_shelf', { s_id });
}

export async function rpcAddBox(s_id, values) {
  // إذا حُدّد موقع، استخدم RPC الإدراج بالموقع
  let result;
  if (values.position && Number(values.position) > 0) {
    result = await supabase.rpc('add_box_at_position', {
      s_id,
      p_position: Number(values.position),
      b_description: values.description?.trim() || '',
      b_width_cm: Number(values.width_cm) || 50,
      b_height_cm: Number(values.height_cm) || 65
    });
  } else {
    result = await supabase.rpc('add_box_to_shelf', {
      s_id,
      b_description: values.description?.trim() || '',
      b_width_cm: Number(values.width_cm) || 50,
      b_height_cm: Number(values.height_cm) || 65
    });
  }
  if (!result.error && result.data && values.photo_url) {
    await supabase.from('boxes').update({ photo_url: values.photo_url }).eq('id', result.data);
  }
  return result;
}

export async function updateBox(box_id, patch) {
  const update = {};
  if ('description' in patch) update.description = patch.description;
  if ('width_cm' in patch) update.width_cm = patch.width_cm;
  if ('height_cm' in patch) update.height_cm = patch.height_cm;
  if ('photo_url' in patch) update.photo_url = patch.photo_url;
  return supabase.from('boxes').update(update).eq('id', box_id);
}

// حذف ناعم — يُمكن استرجاعه من سلّة المحذوفات
// مع cascading للأصناف داخل الصندوق
export async function deleteBox(box_id) {
  const now = new Date().toISOString();
  // أولاً: حذف ناعم لكل الأصناف داخل الصندوق
  await supabase.from('items').update({ deleted_at: now }).eq('box_id', box_id).is('deleted_at', null);
  // ثانياً: حذف الصندوق
  return supabase.from('boxes').update({ deleted_at: now }).eq('id', box_id);
}

export async function softDeleteItem(item_id) {
  return supabase.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', item_id);
}

// عدد الأصناف داخل صندوق
export async function countItemsInBox(box_id) {
  const { count } = await supabase.from('items').select('id', { count: 'exact', head: true })
    .eq('box_id', box_id).is('deleted_at', null);
  return count || 0;
}

// نقل صنف من صندوق لآخر
export async function moveItemToBox(item_id, target_box_id) {
  return supabase.from('items').update({ box_id: target_box_id }).eq('id', item_id);
}

// نقل صندوق من رف لآخر (ضمن نفس المستودع)
// يولّد رمزاً جديداً تلقائياً بناءً على الرف الجديد
export async function moveBoxToShelf(box_id, target_shelf_id) {
  // اجلب بيانات الرف الهدف لنُولّد الرمز الصحيح
  const { data: shelf } = await supabase.from('shelves')
    .select('shelf_index, zone_id, zones(letter)')
    .eq('id', target_shelf_id).maybeSingle();
  if (!shelf) return { error: { message: 'الرف الهدف غير موجود' } };

  const zoneLetter = shelf.zones?.letter;
  const shelfIndex = shelf.shelf_index;

  // اجلب أعلى رقم box_index في الرف الهدف
  const { data: existing } = await supabase.from('boxes')
    .select('box_index, code')
    .eq('shelf_id', target_shelf_id).is('deleted_at', null);

  const nextBoxNum = (existing && existing.length > 0
    ? Math.max(...existing.map(b => b.box_index || 0))
    : 0) + 1;

  const newCode = `${zoneLetter}-${shelfIndex}-${nextBoxNum}`;

  return supabase.from('boxes').update({
    shelf_id: target_shelf_id,
    code: newCode,
    box_index: nextBoxNum
  }).eq('id', box_id);
}

// استرجاع من السلّة
export async function restoreBox(box_id) {
  return supabase.from('boxes').update({ deleted_at: null }).eq('id', box_id);
}

export async function restoreItem(item_id) {
  return supabase.from('items').update({ deleted_at: null }).eq('id', item_id);
}

// حذف نهائي — لا رجعة
export async function permanentDeleteBox(box_id) {
  return supabase.from('boxes').delete().eq('id', box_id);
}

export async function permanentDeleteItem(item_id) {
  return supabase.from('items').delete().eq('id', item_id);
}

export async function fetchWarehouseLayout(wh_id) {
  return supabase.rpc('get_warehouse_layout', { wh_id });
}

export async function fetchBoxesForShelf(shelf_id) {
  return supabase.from('boxes').select('*, items(*)').eq('shelf_id', shelf_id).is('deleted_at', null).order('box_index');
}

export const PRESET_COLORS = ['#D85A30', '#185FA5', '#27500A', '#633806', '#7C3AED', '#0891B2', '#BE185D', '#65A30D'];

export const PRESET_POSITIONS = [
  { label: 'يمين-علوي',  pos_top: 6,  pos_right: 4,    pos_left: null, pos_width: 18, pos_height: 42 },
  { label: 'يمين-سفلي',  pos_top: 52, pos_right: 4,    pos_left: null, pos_width: 18, pos_height: 42 },
  { label: 'يسار-علوي',  pos_top: 6,  pos_right: null, pos_left: 4,    pos_width: 18, pos_height: 42 },
  { label: 'يسار-سفلي',  pos_top: 52, pos_right: null, pos_left: 4,    pos_width: 18, pos_height: 42 },
  { label: 'وسط-علوي',   pos_top: 6,  pos_right: 41,   pos_left: null, pos_width: 18, pos_height: 30 },
  { label: 'وسط-سفلي',   pos_top: 64, pos_right: 41,   pos_left: null, pos_width: 18, pos_height: 30 }
];
