import { DEFAULT_RETURN_DAYS } from './constants';

export function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function nowStr() {
  const n = new Date();
  return `${todayStr()} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

export function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
}

export function isOverdue(checkout) {
  if (!checkout || checkout.purpose === 'personal') return false;
  return daysSince(checkout.date_out) > DEFAULT_RETURN_DAYS;
}

export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('');
}

// يقترح موقع تخزين بناءً على المساحة المختارة وأرففها
// zones: قائمة المساحات الديناميكيّة (مع shelves لكل مساحة)
export function suggestLocation(zoneLetter, existingBoxes, zones = []) {
  const zone = zones.find(z => z.letter === zoneLetter);
  if (!zone) {
    // احتياط: استخدم الترتيب القديم إذا لم تتوفّر بيانات مساحات
    for (let s = 1; s <= 3; s++) {
      const onShelf = existingBoxes.filter(b => b.code.startsWith(`${zoneLetter}-${s}-`)).length;
      if (onShelf < 4) return `${zoneLetter}-${s}-${onShelf + 1}`;
    }
    return `${zoneLetter}-1-1`;
  }
  for (const sh of zone.shelves) {
    const onShelf = existingBoxes.filter(b => b.code.startsWith(`${zoneLetter}-${sh.shelf_index}-`)).length;
    if (onShelf < (sh.max_boxes || 4)) {
      return { code: `${zoneLetter}-${sh.shelf_index}-${onShelf + 1}`, shelfId: sh.id };
    }
  }
  // كل الأرفف ممتلئة — ارجع آخر رف
  const lastShelf = zone.shelves[zone.shelves.length - 1];
  if (lastShelf) {
    const onShelf = existingBoxes.filter(b => b.code.startsWith(`${zoneLetter}-${lastShelf.shelf_index}-`)).length;
    return { code: `${zoneLetter}-${lastShelf.shelf_index}-${onShelf + 1}`, shelfId: lastShelf.id };
  }
  return { code: `${zoneLetter}-1-1`, shelfId: null };
}

// يستنتج موقع الغرض عبر الحالات الأربع لنموذج البيانات:
//   box_id        → داخل صندوق (رمز الصندوق، قابل للملاحة)
//   shelf_id      → غرض كبير يشغل موقع صندوق على رفّ (رمز محسوب)
//   zone_id       → غير محدّد المكان داخل مساحة
//   warehouse_id  → خارج كل المساحات
// يرجع { boxCode, navCode, zoneLetter, zoneName, zoneColor, kind, sortKey }
//   navCode = الرمز القابل للنقر/الملاحة (للصناديق فقط، غير ذلك null)
// يرجع null إذا كان الغرض مرتبطاً بصندوق محذوف/مفقود (يُتجاهَل كما كان سابقاً)
export function resolveItemLocation(item, { boxes = [], zones = [] } = {}) {
  if (item.box_id) {
    const box = boxes.find(b => b.id === item.box_id);
    if (!box) return null;
    const zoneLetter = (box.code || '').split('-')[0];
    const zone = zones.find(z => z.letter === zoneLetter);
    return {
      boxCode: box.code,
      navCode: box.code,
      zoneLetter,
      zoneName: zone?.name || '—',
      zoneColor: zone?.color || '#888',
      kind: 'box',
      sortKey: [zoneLetter || 'ZZZ', parseInt((box.code || '').split('-')[1] || '0', 10), box.box_index ?? 0]
    };
  }
  if (item.shelf_id) {
    for (const z of zones) {
      const sh = (z.shelves || []).find(s => s.id === item.shelf_id);
      if (sh) {
        const code = `${z.letter}-${sh.shelf_index}-${item.box_index ?? '?'}`;
        return {
          boxCode: `${code} · غرض كبير`,
          navCode: null,
          zoneLetter: z.letter,
          zoneName: z.name || '—',
          zoneColor: z.color || '#888',
          kind: 'shelf',
          sortKey: [z.letter || 'ZZZ', sh.shelf_index ?? 0, item.box_index ?? 0]
        };
      }
    }
  }
  if (item.zone_id) {
    const z = zones.find(zz => zz.id === item.zone_id);
    if (z) {
      return {
        boxCode: `${z.letter} · غير محدّد`,
        navCode: null,
        zoneLetter: z.letter,
        zoneName: z.name || '—',
        zoneColor: z.color || '#888',
        kind: 'zone',
        sortKey: [z.letter || 'ZZZ', 998, 0]
      };
    }
  }
  if (item.warehouse_id) {
    return {
      boxCode: 'خارج المساحات',
      navCode: null,
      zoneLetter: '—',
      zoneName: 'خارج المساحات',
      zoneColor: '#9CA3AF',
      kind: 'outside',
      sortKey: ['ZZZ', 999, 0]
    };
  }
  return null;
}

export function formatArabicDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

// الترتيب العربي (الأوّل، الثاني، الثالث...) — يأخذ الموقع 1-indexed
export function arabicOrdinal(position) {
  const ordinals = [
    '', 'الأوّل', 'الثاني', 'الثالث', 'الرابع', 'الخامس',
    'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
    'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر'
  ];
  return ordinals[position] || `${position}`;
}

// تسمية الرف الافتراضيّة بناءً على ترتيبه (الموقع) في المساحة
// shelves: قائمة كل أرفف المساحة مرتّبة بـ shelf_index
// shelf: الرفّ المُراد تسميته
export function shelfDisplayName(shelf, shelves) {
  if (shelf?.label && shelf.label.trim()) return shelf.label.trim();
  if (!shelves || shelves.length === 0) return 'رف';
  // الموقع في الترتيب
  const sorted = [...shelves].sort((a, b) => a.shelf_index - b.shelf_index);
  const position = sorted.findIndex(s => s.id === shelf.id) + 1;
  if (position === 0) return `رف`;
  return `الرف ${arabicOrdinal(position)}`;
}
