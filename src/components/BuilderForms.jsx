import { useState, useEffect } from 'react';
import { PRESET_COLORS, PRESET_POSITIONS } from '../lib/warehouseOps';
import PhotoUploader from './PhotoUploader';

// نموذج إنشاء مستودع — يدعم قوالب جاهزة (قياسي / بمدرج تخزين)
export function CreateWarehouseForm({ busy, onCancel, onSave }) {
  const [template, setTemplate] = useState('standard');  // 'standard' | 'stairway'
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [width_m, setWidthM] = useState(4);
  const [depth_m, setDepthM] = useState(4);
  const [height_m, setHeightM] = useState(2.3);
  const isValid = name.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* اختيار القالب */}
      <div>
        <label className="block text-xs font-bold text-stone-700 mb-2">📐 قالب المستودع</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" onClick={() => setTemplate('standard')}
            className={`p-3 rounded-xl border-2 text-right transition ${
              template === 'standard'
                ? 'bg-blue-50 border-brand-navy ring-2 ring-brand-navy/20'
                : 'bg-white border-stone-200 hover:border-stone-400'
            }`}>
            <div className="flex items-start gap-2">
              <span className="text-2xl">🏢</span>
              <div className="flex-1">
                <div className="text-sm font-bold">قياسي</div>
                <div className="text-[10px] text-stone-500 mt-0.5">4 مساحات في الزوايا</div>
              </div>
              {template === 'standard' && <span className="text-brand-navy font-bold">✓</span>}
            </div>
          </button>
          <button type="button" onClick={() => setTemplate('stairway')}
            className={`p-3 rounded-xl border-2 text-right transition ${
              template === 'stairway'
                ? 'bg-amber-50 border-amber-700 ring-2 ring-amber-700/20'
                : 'bg-white border-stone-200 hover:border-stone-400'
            }`}>
            <div className="flex items-start gap-2">
              <span className="text-2xl">🪜</span>
              <div className="flex-1">
                <div className="text-sm font-bold">بمدرج خشبيّ</div>
                <div className="text-[10px] text-stone-500 mt-0.5">مدرّجان × (علوي + سفلي) = 4 مساحات</div>
              </div>
              {template === 'stairway' && <span className="text-amber-800 font-bold">✓</span>}
            </div>
          </button>
        </div>
        {template === 'stairway' && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
            🪜 سيُنشَأ المستودع مع <strong>مدرّجين متلاصقين</strong>. كلّ مدرّج فيه: درج علوي على اليسار (رفّان)، ودرج سفلي على يمينه (3 مساحات داخليّة). المجموع: <strong>4 مساحات تخزين</strong> بلون خشبيّ بنّي موحّد.
          </div>
        )}
      </div>

      {/* الحقول العامّة */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="col-span-2">
          <label className="block text-[11px] text-stone-700 font-medium mb-1">الاسم *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: مستودع المدينة"
            className="w-full px-2.5 py-2 border border-stone-300 rounded-lg" />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] text-stone-700 font-medium mb-1">الوصف (اختياري)</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full px-2.5 py-2 border border-stone-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-[11px] text-stone-700 font-medium mb-1">العرض (م)</label>
          <input type="number" step="0.1" value={width_m} onChange={e => setWidthM(e.target.value)}
            className="w-full px-2.5 py-2 border border-stone-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-[11px] text-stone-700 font-medium mb-1">العمق (م)</label>
          <input type="number" step="0.1" value={depth_m} onChange={e => setDepthM(e.target.value)}
            className="w-full px-2.5 py-2 border border-stone-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-[11px] text-stone-700 font-medium mb-1">الارتفاع (م)</label>
          <input type="number" step="0.1" value={height_m} onChange={e => setHeightM(e.target.value)}
            className="w-full px-2.5 py-2 border border-stone-300 rounded-lg" />
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-stone-200">
        <button onClick={() => onSave({ name, description, width_m, depth_m, height_m, template })}
          disabled={busy || !isValid}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-2.5 rounded-lg text-xs font-bold shadow hover:shadow-lg disabled:opacity-50 transition">
          💾 حفظ وإنشاء
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// نموذج تعديل بيانات المستودع
export function EditWarehouseForm({ initial, busy, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const dirty = name !== (initial?.name || '') || description !== (initial?.description || '');

  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الاسم</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الوصف</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ name, description })}
          disabled={busy || !dirty || !name.trim()}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-1.5 rounded text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm">
          💾 حفظ التعديلات
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// نموذج إضافة مساحة
export function AddZoneForm({ busy, existingLetters, onCancel, onSave }) {
  const nextLetter = (() => {
    const used = new Set(existingLetters);
    for (let i = 65; i <= 90; i++) {
      const c = String.fromCharCode(i);
      if (!used.has(c)) return c;
    }
    return '';
  })();

  const [letter, setLetter] = useState(nextLetter);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[existingLetters.length % PRESET_COLORS.length]);
  const [width_cm, setWidth] = useState(200);
  const [height_cm, setHeight] = useState(230);
  const [depth_cm, setDepth] = useState(65);
  const [shelves_count, setShelvesCount] = useState(3);
  const isValid = letter.trim().length === 1 && name.trim().length > 0;

  return (
    <div className="bg-white border-2 border-blue-400 rounded-xl p-4 animate-fade-in">
      <h4 className="text-xs font-display font-bold text-blue-900 mb-3">+ مساحة تخزين جديدة</h4>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الحرف *</label>
          <input value={letter} onChange={e => setLetter(e.target.value.slice(0, 1).toUpperCase())} maxLength={1}
            className="w-full px-2 py-1.5 border border-stone-300 rounded font-bold text-center" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الاسم *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: عُدّة الفعاليات"
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">اللون</label>
          <div className="flex gap-1 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded ${color === c ? 'ring-2 ring-offset-1 ring-stone-900' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العرض (سم)</label>
          <input type="number" value={width_cm} onChange={e => setWidth(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العمق (سم)</label>
          <input type="number" value={depth_cm} onChange={e => setDepth(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">عدد الأرفف</label>
          <input type="number" min="1" value={shelves_count} onChange={e => setShelvesCount(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ letter, name, color, width_cm, height_cm, depth_cm, shelves_count })}
          disabled={busy || !isValid}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
          💾 حفظ وإنشاء
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// نموذج تعديل مساحة
export function EditZoneForm({ zone, busy, onCancel, onSave }) {
  const [name, setName] = useState(zone.name);
  const [color, setColor] = useState(zone.color);
  const [width_cm, setWidth] = useState(zone.width_cm);
  const [height_cm, setHeight] = useState(zone.height_cm);
  const [depth_cm, setDepth] = useState(zone.depth_cm);
  const [position, setPosition] = useState(null);

  const dirty =
    name !== zone.name ||
    color !== zone.color ||
    Number(width_cm) !== Number(zone.width_cm) ||
    Number(height_cm) !== Number(zone.height_cm) ||
    Number(depth_cm) !== Number(zone.depth_cm) ||
    position !== null;

  function buildPatch() {
    const patch = {
      name, color,
      width_cm: Number(width_cm),
      height_cm: Number(height_cm),
      depth_cm: Number(depth_cm)
    };
    if (position) {
      patch.pos_top = position.pos_top;
      patch.pos_left = position.pos_left;
      patch.pos_right = position.pos_right;
      patch.pos_width = position.pos_width;
      patch.pos_height = position.pos_height;
    }
    return patch;
  }

  return (
    <div className="text-xs space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الاسم</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">اللون</label>
          <div className="flex gap-1 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded ${color === c ? 'ring-2 ring-offset-1 ring-stone-900' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العرض (سم)</label>
          <input type="number" value={width_cm} onChange={e => setWidth(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العمق (سم)</label>
          <input type="number" value={depth_cm} onChange={e => setDepth(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الموقع على خريطة المستودع</label>
          <div className="flex gap-1 flex-wrap">
            {PRESET_POSITIONS.map((p, i) => (
              <button key={i} onClick={() => setPosition(p)}
                className={`text-[10px] px-2 py-1 border rounded ${
                  position?.label === p.label
                    ? 'bg-blue-100 border-blue-400 text-blue-900'
                    : 'border-stone-300 hover:bg-white'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave(buildPatch())} disabled={busy || !dirty}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-1.5 rounded text-xs font-bold hover:opacity-90 disabled:opacity-30 shadow-sm">
          💾 حفظ التعديلات
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// نموذج إضافة رف
export function AddShelfForm({ busy, onCancel, onSave, hasExistingShelves = true }) {
  const [position, setPosition] = useState('bottom'); // top | bottom
  const [label, setLabel] = useState('');
  const [height_cm, setHeight] = useState(70);
  const [max_boxes, setMax] = useState(4);

  return (
    <div className="bg-white border-2 border-blue-400 rounded-xl p-4 animate-fade-in">
      <h4 className="text-xs font-display font-bold text-blue-900 mb-3">+ رف جديد</h4>

      {hasExistingShelves && (
        <div className="mb-3">
          <label className="block text-[10px] text-stone-600 mb-1">الموقع</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPosition('top')}
              className={`text-xs py-2 rounded-lg border-2 transition flex items-center justify-center gap-1 ${
                position === 'top'
                  ? 'bg-blue-100 border-blue-500 text-blue-900 font-bold'
                  : 'bg-white border-stone-300 text-stone-600 hover:border-stone-400'
              }`}>
              ⬆️ في الأعلى
            </button>
            <button onClick={() => setPosition('bottom')}
              className={`text-xs py-2 rounded-lg border-2 transition flex items-center justify-center gap-1 ${
                position === 'bottom'
                  ? 'bg-blue-100 border-blue-500 text-blue-900 font-bold'
                  : 'bg-white border-stone-300 text-stone-600 hover:border-stone-400'
              }`}>
              ⬇️ في الأسفل
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">اسم الرف (اختياريّ — سيُسمّى تلقائياً حسب موقعه)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="مثال: رف الأدوات الكبيرة"
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">أقصى عدد صناديق</label>
          <input type="number" min="1" value={max_boxes} onChange={e => setMax(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ position, height_cm, max_boxes, label })} disabled={busy}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
          💾 حفظ وإنشاء
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// نموذج تعديل رف
export function EditShelfForm({ shelf, busy, onCancel, onSave }) {
  const [height_cm, setHeight] = useState(shelf.height_cm);
  const [max_boxes, setMax] = useState(shelf.max_boxes);
  const [label, setLabel] = useState(shelf.label || '');
  const dirty =
    Number(height_cm) !== Number(shelf.height_cm) ||
    Number(max_boxes) !== Number(shelf.max_boxes) ||
    label !== (shelf.label || '');

  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">اسم الرف (اختياري)</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">أقصى صناديق</label>
          <input type="number" value={max_boxes} onChange={e => setMax(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ height_cm: Number(height_cm), max_boxes: Number(max_boxes), label })}
          disabled={busy || !dirty}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-1.5 rounded text-xs font-bold hover:opacity-90 disabled:opacity-30 shadow-sm">
          💾 حفظ التعديلات
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// نموذج إضافة صندوق
export function AddBoxForm({ busy, onCancel, onSave }) {
  const [description, setDescription] = useState('');
  const [width_cm, setWidth] = useState(50);
  const [height_cm, setHeight] = useState(65);
  const [photoUrl, setPhotoUrl] = useState(null);

  return (
    <div className="bg-white border-2 border-blue-400 rounded-xl p-4 animate-fade-in">
      <h4 className="text-xs font-display font-bold text-blue-900 mb-3">+ صندوق جديد</h4>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الوصف (اختياري)</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            placeholder="مثال: حبال وأدوات تحكيم"
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العرض (سم)</label>
          <input type="number" value={width_cm} onChange={e => setWidth(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <PhotoUploader
            value={photoUrl}
            onChange={setPhotoUrl}
            prefix="boxes"
            label="صورة الصندوق (اختياريّة)"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ description, width_cm, height_cm, photo_url: photoUrl })} disabled={busy}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
          💾 حفظ وإنشاء
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// نموذج تعديل صندوق
export function EditBoxForm({ box, busy, onCancel, onSave }) {
  const [description, setDescription] = useState(box.description || '');
  const [width_cm, setWidth] = useState(box.width_cm || 50);
  const [height_cm, setHeight] = useState(box.height_cm || 65);
  const [photoUrl, setPhotoUrl] = useState(box.photo_url || null);
  const dirty =
    description !== (box.description || '') ||
    Number(width_cm) !== Number(box.width_cm || 50) ||
    Number(height_cm) !== Number(box.height_cm || 65) ||
    photoUrl !== (box.photo_url || null);

  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 mb-1">الوصف</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">العرض (سم)</label>
          <input type="number" value={width_cm} onChange={e => setWidth(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 mb-1">الارتفاع (سم)</label>
          <input type="number" value={height_cm} onChange={e => setHeight(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded" />
        </div>
        <div className="col-span-2">
          <PhotoUploader
            value={photoUrl}
            onChange={setPhotoUrl}
            prefix="boxes"
            label="صورة الصندوق"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ description, width_cm: Number(width_cm), height_cm: Number(height_cm), photo_url: photoUrl })}
          disabled={busy || !dirty}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-1.5 rounded text-xs font-bold hover:opacity-90 disabled:opacity-30 shadow-sm">
          💾 حفظ التعديلات
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 rounded text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// مكوّن مودال للنماذج — يظهر عائماً مركزياً، يُغلَق بـEsc أيضاً
export function FormModal({ title, subtitle, children, onClose, maxWidth = 'max-w-md' }) {
  // Esc لإغلاق المودال
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}>
      <div
        className={`bg-white dark:bg-stone-900 rounded-2xl shadow-2xl ${maxWidth} w-full max-h-[90vh] overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-l from-blue-50 to-stone-50 dark:from-stone-800 dark:to-stone-900 border-b border-stone-200 dark:border-stone-700 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-display font-bold dark:text-stone-300">{title}</h3>
            {subtitle && <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} title="إغلاق (Esc)" className="text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200 text-2xl leading-none px-2">×</button>
        </div>
        <div className="p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

// مربّع تأكيد حذف
export function ConfirmDelete({ message, busy, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-stone-900 rounded-xl p-5 max-w-sm w-full">
        <h4 className="text-sm font-display font-bold mb-2 dark:text-stone-300">تأكيد الحذف</h4>
        <p className="text-xs text-stone-600 dark:text-stone-400 mb-4">{message}</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} disabled={busy}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50">
            نعم، احذف
          </button>
          <button onClick={onCancel}
            className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// شريط حالة (toast)
export function StatusToast({ msg }) {
  if (!msg) return null;
  return (
    <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg shadow-lg text-xs ${
      msg.kind === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
    } animate-fade-in`}>
      {msg.text}
    </div>
  );
}

export function useFlash() {
  const [msg, setMsg] = useState(null);
  function flash(text, kind = 'success') {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 3500);
  }
  return [msg, flash];
}
