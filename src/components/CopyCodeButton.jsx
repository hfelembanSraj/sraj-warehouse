// زرّ صغير لنسخ رمز الصندوق إلى الحافظة
import { useState } from 'react';

export default function CopyCodeButton({ code, className = '' }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e) {
    e?.stopPropagation();
    e?.preventDefault();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('فشل النسخ:', err);
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'نُسخ ✓' : `نسخ "${code}"`}
      className={`inline-flex items-center justify-center text-[10px] w-5 h-5 rounded transition ${
        copied
          ? 'bg-green-100 text-green-700'
          : 'bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-800'
      } ${className}`}
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}
