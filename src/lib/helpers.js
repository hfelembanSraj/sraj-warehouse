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

export function suggestLocation(category, existingBoxes) {
  const zoneMap = { events: 'A', tech: 'B', field: 'C', support: 'D' };
  const zone = zoneMap[category] || 'A';
  for (let s = 1; s <= 3; s++) {
    const onShelf = existingBoxes.filter(b => b.code.startsWith(`${zone}-${s}-`)).length;
    if (onShelf < 4) return `${zone}-${s}-${onShelf + 1}`;
  }
  return `${zone}-1-1`;
}

export function formatArabicDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}
