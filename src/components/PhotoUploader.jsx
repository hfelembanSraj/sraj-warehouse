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

  // تدوير الصورة 90° (يُعيد رفعها مدوّرة فتبقى مدوّرة في كل مكان)
  async function handleRotate() {
    if (!value || uploading) return;
    setError(null);
    setUploading(true);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('load'));
        // كاسر تخزين مؤقّت لضمان طلب يحمل ترويسات CORS
        im.src = value + (value.includes('?') ? '&' : '?') + 'r=' + value.length;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
      if (!blob) throw new Error('blob');
      const file = new File([blob], 'rotated.jpg', { type: 'image/jpeg' });
      const result = await uploadPhoto(file, prefix);
      if (result.error) { setError(result.error); return; }
      // لا نحذف الصورة القديمة هنا — حتى لو أُلغي النموذج قبل الحفظ تبقى الصورة سليمة
      onChange(result.url);
    } catch (e) {
      setError('تعذّر تدوير الصورة — جرّب إعادة رفعها مدوّرة');
    } finally {
      setUploading(false);
    }
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
        <div className="inline-block">
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
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          <div className="flex gap-1.5 mt-1 w-24">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              className="flex-1 bg-white dark:bg-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-600 text-[9px] px-1 py-0.5 rounded shadow-sm hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50"
              title="استبدال الصورة"
            >📷 تغيير</button>
            <button
              onClick={handleRotate}
              disabled={disabled || uploading}
              className="flex-1 bg-white dark:bg-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-600 text-[9px] px-1 py-0.5 rounded shadow-sm hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50"
              title="تدوير الصورة 90°"
            >🔄 تدوير</button>
          </div>
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
