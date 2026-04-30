import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

const BUCKET = 'sraj-photos';
const MAX_SIZE_MB = 0.5;       // ~500KB بعد الضغط
const MAX_DIMENSION = 1280;     // أقصى أبعاد بعد الضغط

// ضغط ورفع صورة، إرجاع publicUrl + path
export async function uploadPhoto(file, prefix = 'misc') {
  if (!file) return { error: 'لا يوجد ملف' };
  if (!file.type.startsWith('image/')) return { error: 'يجب أن يكون الملف صورة' };

  let compressed;
  try {
    compressed = await imageCompression(file, {
      maxSizeMB: MAX_SIZE_MB,
      maxWidthOrHeight: MAX_DIMENSION,
      useWebWorker: true,
      fileType: 'image/webp'
    });
  } catch (e) {
    // إن فشل الضغط، استخدم الأصلي إذا كان أصغر من 5MB
    if (file.size <= 5 * 1024 * 1024) compressed = file;
    else return { error: 'فشل ضغط الصورة' };
  }

  // اسم فريد
  const ext = compressed.type.split('/')[1] || 'webp';
  const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(filename, compressed, {
    cacheControl: '3600',
    upsert: false,
    contentType: compressed.type
  });
  if (upErr) return { error: 'فشل الرفع: ' + upErr.message };

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return { url: publicUrl, path: filename };
}

// حذف صورة من Storage
export async function deletePhoto(photoUrl) {
  if (!photoUrl) return;
  // استخراج المسار من الـ URL: .../sraj-photos/<path>
  const match = photoUrl.match(/\/sraj-photos\/(.+?)(\?|$)/);
  if (!match) return;
  await supabase.storage.from(BUCKET).remove([match[1]]);
}
