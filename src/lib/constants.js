// تصنيفات المساحات الافتراضية
export const ZONE_CATEGORIES = {
  events: { letter: 'A', name: 'عُدّة الفعاليات', color: '#D85A30' },
  tech: { letter: 'B', name: 'العُدّة التقنية', color: '#185FA5' },
  field: { letter: 'C', name: 'تجهيزات ميدانية', color: '#27500A' },
  support: { letter: 'D', name: 'مواد مساندة', color: '#633806' }
};

// أدوار المستخدمين
export const USER_ROLES = {
  founder: 'المؤسّس',
  sysadmin: 'مدير النظام',
  whmanager: 'مدير المستودع',
  user: 'مستخدم'
};

// الصلاحيات
export const PERMISSIONS = {
  view: 'عرض المحتويات',
  checkout: 'إخراج عُدّة',
  return: 'إرجاع عُدّة',
  add: 'إضافة أدوات',
  edit: 'تعديل البيانات',
  delete: 'حذف الأدوات'
};

// المهلة الافتراضية للإرجاع (أيام)
export const DEFAULT_RETURN_DAYS = 10;

// حالات الأدوات
export const ITEM_STATUSES = {
  ok: { label: 'سليم', color: 'green' },
  out: { label: 'مُخرَج', color: 'red' },
  warn: { label: 'يحتاج صيانة', color: 'orange' },
  damaged: { label: 'تالف', color: 'red' }
};

// أسباب الإتلاف
export const DAMAGE_REASONS = [
  'استخدام طبيعي / تآكل',
  'كسر أثناء الاستخدام',
  'عطل تقني',
  'انتهاء الصلاحية',
  'فقدان',
  'أخرى'
];
