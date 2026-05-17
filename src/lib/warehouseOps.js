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
    const { error: photoErr } = await supabase
      .from('boxes').update({ photo_url: values.photo_url }).eq('id', result.data);
    if (photoErr) {
      // الصندوق أُنشئ بنجاح لكن تعذّر حفظ الصورة — لا نُفشل العمليّة،
      // بل نُبلّغ المُستدعي ليُظهر تنبيهاً ناعماً بدل ابتلاع الخطأ صامتاً
      console.error('تعذّر حفظ صورة الصندوق:', photoErr);
      result.photoError = photoErr;
    }
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

// حذف ناعم لصندوق — يدعم خيارين:
//   keepItems = false (افتراضي): يُحذَف الصندوق وكل أصنافه ناعمياً (cascading)
//   keepItems = true: تبقى الأصناف داخل المساحة كـ"غير محدّدة" (box_id = null, zone_id = المساحة الأصليّة)
export async function deleteBox(box_id, options = {}) {
  const { keepItems = false } = options;
  if (keepItems) {
    // RPC تُعالج النقل والحذف ذرّياً
    const result = await supabase.rpc('delete_box_keep_items', { p_box_id: box_id });
    if (!result.error) await resetShelfMaxBoxesIfEmptyByBoxId(box_id);
    return result;
  }
  const now = new Date().toISOString();
  await supabase.from('items').update({ deleted_at: now }).eq('box_id', box_id).is('deleted_at', null);
  const result = await supabase.from('boxes').update({ deleted_at: now }).eq('id', box_id);
  if (!result.error) await resetShelfMaxBoxesIfEmptyByBoxId(box_id);
  return result;
}

// حذف عدّة صناديق دفعة واحدة (يدعم نفس الخيارات)
async function _bulkDeleteBoxesInternal(box_ids, options = {}) {
  if (!box_ids || box_ids.length === 0) return { data: null, error: null };
  const { keepItems = false } = options;

  // اجمع shelf_ids قبل الحذف لإعادة ضبط max_boxes لاحقاً
  const { data: srcBoxes } = await supabase.from('boxes').select('id, shelf_id').in('id', box_ids);
  const shelfIds = [...new Set((srcBoxes || []).map(b => b.shelf_id).filter(Boolean))];

  if (keepItems) {
    // نفّذ RPC لكلّ صندوق (لأنّ الدالّة تُعالج صندوقاً واحداً)
    for (const id of box_ids) {
      const { error } = await supabase.rpc('delete_box_keep_items', { p_box_id: id });
      if (error) return { error };
    }
  } else {
    const now = new Date().toISOString();
    await supabase.from('items').update({ deleted_at: now }).in('box_id', box_ids).is('deleted_at', null);
    const { error } = await supabase.from('boxes').update({ deleted_at: now }).in('id', box_ids);
    if (error) return { error };
  }

  // إعادة ضبط max_boxes للأرفف التي صارت فارغة
  for (const sid of shelfIds) await resetShelfMaxBoxesIfEmpty(sid);
  return { data: { deleted: box_ids.length }, error: null };
}

// لو الرف صار فارغاً بعد الحذف، أعِد max_boxes إلى الافتراضي (4) لتجنّب شقوق مزدحمة
async function resetShelfMaxBoxesIfEmpty(shelf_id) {
  if (!shelf_id) return;
  const { count } = await supabase.from('boxes').select('id', { count: 'exact', head: true })
    .eq('shelf_id', shelf_id).is('deleted_at', null);
  if ((count || 0) === 0) {
    await supabase.rpc('update_shelf', {
      s_id: shelf_id, s_height_cm: null, s_max_boxes: 4, s_label: null
    });
  }
}

async function resetShelfMaxBoxesIfEmptyByBoxId(box_id) {
  const { data } = await supabase.from('boxes').select('shelf_id').eq('id', box_id).maybeSingle();
  if (data?.shelf_id) await resetShelfMaxBoxesIfEmpty(data.shelf_id);
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
  return bulkMoveBoxes([box_id], target_shelf_id);
}

// نقل عدّة صناديق دفعة واحدة إلى رفّ واحد
// يفترض أنّ الصناديق قد تكون من رفوف مختلفة، ويُولّد رموزاً جديدة متسلسلة في الرف الهدف
export async function bulkMoveBoxes(box_ids, target_shelf_id) {
  if (!box_ids || box_ids.length === 0) return { data: null, error: null };

  const { data: shelf } = await supabase.from('shelves')
    .select('shelf_index, zone_id, max_boxes, zones(letter)')
    .eq('id', target_shelf_id).maybeSingle();
  if (!shelf) return { error: { message: 'الرف الهدف غير موجود' } };

  const zoneLetter = shelf.zones?.letter;
  const shelfIndex = shelf.shelf_index;

  // الصناديق الموجودة حالياً في الرف الهدف، باستثناء الصناديق التي ستنتقل (إن كانت أصلاً منه)
  const { data: existing } = await supabase.from('boxes')
    .select('id, box_index')
    .eq('shelf_id', target_shelf_id).is('deleted_at', null);

  const existingNotMoving = (existing || []).filter(b => !box_ids.includes(b.id));
  let nextBoxNum = (existingNotMoving.length > 0
    ? Math.max(...existingNotMoving.map(b => b.box_index || 0))
    : 0) + 1;

  // اجلب الصناديق المصدر للتأكّد من شيلف_id الحالي (لاستبعاد no-op)
  const { data: srcBoxes } = await supabase.from('boxes')
    .select('id, shelf_id')
    .in('id', box_ids);
  const toMoveIds = (srcBoxes || []).filter(b => b.shelf_id !== target_shelf_id).map(b => b.id);

  if (toMoveIds.length === 0) return { data: null, error: null };

  // وسّع الرف الهدف إن لزم
  const newTotal = existingNotMoving.length + toMoveIds.length;
  if (newTotal > shelf.max_boxes) {
    await supabase.rpc('update_shelf', {
      s_id: target_shelf_id,
      s_max_boxes: newTotal,
      s_height_cm: null,
      s_label: null
    });
  }

  // اجلب warehouse_id للمستودع الهدف (للنقل عبر المستودعات)
  const { data: targetZone } = await supabase.from('zones')
    .select('warehouse_id').eq('id', shelf.zone_id).maybeSingle();
  const targetWhId = targetZone?.warehouse_id;

  // انقل صندوقاً صندوقاً (مع رمز جديد متسلسل + تحديث warehouse_id إن لزم)
  for (const box_id of toMoveIds) {
    const newCode = `${zoneLetter}-${shelfIndex}-${nextBoxNum}`;
    const updates = {
      shelf_id: target_shelf_id,
      code: newCode,
      box_index: nextBoxNum
    };
    if (targetWhId) updates.warehouse_id = targetWhId;
    const { error } = await supabase.from('boxes').update(updates).eq('id', box_id);
    if (error) return { error };
    nextBoxNum++;
  }

  return { data: { moved: toMoveIds.length }, error: null };
}

// واجهة عامّة للحذف الجماعي — تدعم نفس خيارات deleteBox
export async function bulkDeleteBoxes(box_ids, options = {}) {
  return _bulkDeleteBoxesInternal(box_ids, options);
}

// نقل عدّة صناديق إلى أوّل رفّ في مساحة (تُستخدم من الخريطة المصغّرة)
export async function bulkMoveBoxesToZone(box_ids, target_zone_id) {
  const { data: zoneShelves } = await supabase.from('shelves')
    .select('id, shelf_index')
    .eq('zone_id', target_zone_id)
    .order('shelf_index');
  if (!zoneShelves || zoneShelves.length === 0) {
    return { error: { message: 'هذه المساحة لا تحوي أيّ رفّ' } };
  }
  return bulkMoveBoxes(box_ids, zoneShelves[0].id);
}

// تخصيص غرض غير محدّد إلى صندوق
export async function assignItemToBox(item_id, target_box_id) {
  return supabase.from('items').update({
    box_id: target_box_id,
    zone_id: null
  }).eq('id', item_id);
}

// نقل صندوق إلى موقع محدّد (داخل نفس الرف أو إلى رفّ آخر)
// يُعالج الإزاحة والضغط ذرّياً عبر RPC
export async function moveBoxToPosition(box_id, target_shelf_id, target_position) {
  return supabase.rpc('move_box_to_position', {
    p_box_id: box_id,
    p_target_shelf_id: target_shelf_id,
    p_target_position: target_position
  });
}

// تعديل الوصف لعدّة صناديق دفعة واحدة
export async function bulkUpdateBoxes(box_ids, patch) {
  if (!box_ids || box_ids.length === 0) return { data: null, error: null };
  const update = {};
  if ('description' in patch) update.description = patch.description;
  if ('width_cm' in patch) update.width_cm = patch.width_cm;
  if ('height_cm' in patch) update.height_cm = patch.height_cm;
  return supabase.from('boxes').update(update).in('id', box_ids);
}

// استرجاع من السلّة
export async function restoreBox(box_id) {
  return supabase.from('boxes').update({ deleted_at: null }).eq('id', box_id);
}

export async function restoreItem(item_id) {
  return supabase.from('items').update({ deleted_at: null }).eq('id', item_id);
}

// استرجاع جماعي
export async function bulkRestoreBoxes(box_ids) {
  if (!box_ids || box_ids.length === 0) return { error: null };
  return supabase.from('boxes').update({ deleted_at: null }).in('id', box_ids);
}
export async function bulkRestoreItems(item_ids) {
  if (!item_ids || item_ids.length === 0) return { error: null };
  return supabase.from('items').update({ deleted_at: null }).in('id', item_ids);
}

// حذف نهائي — لا رجعة
export async function permanentDeleteBox(box_id) {
  return supabase.from('boxes').delete().eq('id', box_id);
}

export async function permanentDeleteItem(item_id) {
  return supabase.from('items').delete().eq('id', item_id);
}

// حذف نهائي جماعي
export async function bulkPermanentDeleteBoxes(box_ids) {
  if (!box_ids || box_ids.length === 0) return { error: null };
  return supabase.from('boxes').delete().in('id', box_ids);
}
export async function bulkPermanentDeleteItems(item_ids) {
  if (!item_ids || item_ids.length === 0) return { error: null };
  return supabase.from('items').delete().in('id', item_ids);
}

// نقل صندوق إلى مستودع آخر بالكامل (يحتاج رفّاً هدفاً في المستودع الآخر)
// يُستخدم ل-cross-warehouse moves: ينقل الصندوق + يحدّث warehouse_id
export async function moveBoxToWarehouse(box_id, target_shelf_id) {
  // اجلب بيانات الرفّ الهدف للحصول على warehouse_id الصحيح
  const { data: shelf } = await supabase.from('shelves')
    .select('shelf_index, zones(letter, warehouse_id)')
    .eq('id', target_shelf_id).maybeSingle();
  if (!shelf) return { error: { message: 'الرفّ الهدف غير موجود' } };

  const targetWhId = shelf.zones?.warehouse_id;
  const zoneLetter = shelf.zones?.letter;
  const shelfIndex = shelf.shelf_index;

  const { data: existing } = await supabase.from('boxes')
    .select('box_index')
    .eq('shelf_id', target_shelf_id).is('deleted_at', null);
  const nextBoxNum = (existing && existing.length > 0
    ? Math.max(...existing.map(b => b.box_index || 0))
    : 0) + 1;
  const newCode = `${zoneLetter}-${shelfIndex}-${nextBoxNum}`;

  return supabase.from('boxes').update({
    shelf_id: target_shelf_id,
    warehouse_id: targetWhId,
    code: newCode,
    box_index: nextBoxNum
  }).eq('id', box_id);
}

export async function fetchWarehouseLayout(wh_id) {
  return supabase.rpc('get_warehouse_layout', { wh_id });
}

// إضافة صندوق مُكدَّس فوق صندوق موجود (في نفس موقع الرف)
export async function addStackedBox(below_box_id, values = {}) {
  return supabase.rpc('add_stacked_box', {
    p_below_box_id: below_box_id,
    b_description: values.description?.trim() || '',
    b_width_cm: Number(values.width_cm) || 50,
    b_height_cm: Number(values.height_cm) || 30
  });
}

// تحديث موقع غرض خارج المساحات على خريطة المستودع (نسبة 0-100)
export async function updateOutsideItemPosition(item_id, { pos_top, pos_left, width_pct, height_pct }) {
  const update = {};
  if (pos_top !== undefined)    update.pos_top    = pos_top;
  if (pos_left !== undefined)   update.pos_left   = pos_left;
  if (width_pct !== undefined)  update.width_pct  = width_pct;
  if (height_pct !== undefined) update.height_pct = height_pct;
  return supabase.from('items').update(update).eq('id', item_id);
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
