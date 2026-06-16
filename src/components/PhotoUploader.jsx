import { useState, useRef } from 'react';
import { uploadPhoto, deletePhoto } from '../lib/photoUpload';

export default function PhotoUploader({ value, onChange, prefix = 'item', disabled = false, label = 'صورة' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const result = await uploadPhoto(file, prefix);
    setUploading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    // احذف الصورة القديمة إن وُجدت
    if (value) deletePhoto(value);
    onChange(result.url);
  }

  function handleRemove() {
    if (value) deletePhoto(value);
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div>
      <label className="block text-[10px] text-stone-600 dark:text-stone-300 mb-1">{label}</label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        disabled={disabled || uploading}
        className="hidden"
      />

      {value ? (
        <div className="relative inline-block">
          <img src={value} alt="معاينة"
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 object-cover rounded-lg border border-stone-300 dark:border-stone-600 cursor-pointer"
            title="اضغط لاستبدال الصورة" />
          <button
            onClick={handleRemove}
            disabled={disabled || uploading}
            className="absolute -top-1 -left-1 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] hover:bg-red-700 leading-none flex items-center justify-center"
            title="حذف الصورة"
          >×</button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="absolute -bottom-1 -left-1 bg-white dark:bg-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-600 text-[9px] px-1.5 py-0.5 rounded shadow-sm hover:bg-stone-50 dark:hover:bg-stone-700"
            title="استبدال"
          >📷 تغيير</button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="w-24 h-24 border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-lg flex flex-col items-center justify-center gap-1 hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition disabled:opacity-50"
        >
          {uploading ? (
            <>
              <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[9px] text-stone-500 dark:text-stone-400">جاري الرفع...</span>
            </>
          ) : (
            <>
              <span className="text-2xl">📷</span>
              <span className="text-[9px] text-stone-500 dark:text-stone-400">إضافة صورة</span>
            </>
          )}
        </button>
      )}

      {error && <p className="text-[10px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// عرض صورة بصيغة مصغّرة (thumbnail) — للأماكن التي لا نحتاج فيها رفعاً
export function PhotoThumb({ url, size = 'md', alt = '' }) {
  const sizes = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };
  if (!url) return null;
  return (
    <img src={url} alt={alt}
      className={`${sizes[size] || sizes.md} object-cover rounded border border-stone-200`} />
  );
}
