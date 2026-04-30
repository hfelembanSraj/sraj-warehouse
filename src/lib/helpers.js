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

export function formatArabicDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}
