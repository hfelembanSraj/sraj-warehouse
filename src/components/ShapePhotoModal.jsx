// ============================================================
// ShapePhotoModal — رفع/تغيير/إزالة صورة شكل (مساحة أو قسم) بحفظ صريح.
// الصورة تظهر خلفيةً للشكل مقصوصةً بحدوده على الخريطة وداخل المساحات.
// ============================================================
import { useState } from 'react';
import { FormModal } from './BuilderForms';
import PhotoUploader from './PhotoUploader';

export default function ShapePhotoModal({ title, value, busy, onSave, onClose }) {
  const [url, setUrl] = useState(value || null);
  const dirty = (url || null) !== (value || null);
  return (
    <FormModal title={title} subtitle="تظهر الصورة خلفيةً للشكل — أزلها لإخفائها" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-3">
        <PhotoUploader value={url} onChange={setUrl} prefix="zones" label="صورة الشكل" />
        <div className="flex gap-2 pt-2">
          <button onClick={() => dirty && onSave(url)} disabled={busy || !dirty}
            className="flex-1 bg-brand-blue text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-800 disabled:opacity-50">
            {busy ? '...' : '💾 حفظ'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
            إلغاء
          </button>
        </div>
      </div>
    </FormModal>
  );
}
