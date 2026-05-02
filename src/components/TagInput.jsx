// مُدخِل وسوم: المستخدم يكتب وسماً ويضغط Enter/فاصلة → يُضاف
// يدعم اقتراحات من قائمة الوسوم المستخدَمة سابقاً
import { useState, useRef } from 'react';

export default function TagInput({ value = [], onChange, suggestions = [], placeholder = 'اكتب وسماً واضغط Enter...' }) {
  const [input, setInput] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const ref = useRef(null);

  const tags = value || [];

  function addTag(t) {
    const trimmed = t.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput('');
    setShowSuggest(false);
  }
  function removeTag(t) {
    onChange(tags.filter(x => x !== t));
  }
  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  // اقتراحات: غير مُستخدَمة بالفعل + تحوي ما كتب المستخدم
  const filteredSuggestions = suggestions
    .filter(s => !tags.includes(s))
    .filter(s => !input || s.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-1 px-2 py-1.5 border border-stone-300 rounded-lg bg-white min-h-[36px] focus-within:border-brand-navy focus-within:ring-2 focus-within:ring-brand-navy/20 transition">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 bg-brand-navy/10 text-brand-navy text-[11px] font-medium px-2 py-0.5 rounded-full">
            {t}
            <button type="button" onClick={() => removeTag(t)}
              className="text-brand-navy/60 hover:text-brand-navy" aria-label="إزالة">
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggest(true); }}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none text-xs bg-transparent"
        />
      </div>
      {showSuggest && filteredSuggestions.length > 0 && (
        <div className="absolute top-full mt-1 right-0 left-0 bg-white border border-stone-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {filteredSuggestions.map(s => (
            <button type="button" key={s} onClick={() => addTag(s)}
              className="w-full text-right px-3 py-2 text-xs hover:bg-stone-50 border-b border-stone-100 last:border-b-0">
              <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full text-[11px] font-medium">{s}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-stone-500 mt-1">اضغط Enter أو فاصلة لإضافة وسم. مفيد للتصنيف (مثل: رياضي، إلكتروني، هام...).</p>
    </div>
  );
}

// عرض الوسوم كشارات صغيرة (للقوائم)
export function TagChips({ tags = [], max = 3, className = '' }) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const more = tags.length - max;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {shown.map(t => (
        <span key={t} className="bg-stone-100 text-stone-700 text-[9px] font-medium px-1.5 py-0.5 rounded-full">
          {t}
        </span>
      ))}
      {more > 0 && (
        <span className="bg-stone-100 text-stone-500 text-[9px] px-1.5 py-0.5 rounded-full">+{more}</span>
      )}
    </div>
  );
}
