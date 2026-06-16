import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import CheckoutModal from './CheckoutModal';
import PhotoUploader from './PhotoUploader';
import LocationPicker from './LocationPicker';
import CopyCodeButton from './CopyCodeButton';
import { printBoxLabel } from './PrintBoxLabel';
import TagInput, { TagChips } from './TagInput';
import ImageLightbox from './ImageLightbox';
import { shelfDisplayName } from '../lib/helpers';
import { EditBoxForm, ConfirmDelete, StatusToast, FormModal, useFlash } from './BuilderForms';
import { updateBox, deleteBox, softDeleteItem, moveItemToBox } from '../lib/warehouseOps';

export default function BoxView({ zone, shelf, box, data, onBackToMap, onBackToZone, onBackToShelf, onRefresh }) {
  const { isFounder, can, activeWarehouse } = useAuth();
  const [items, setItems] = useState([]);
  const [movingItem, setMovingItem] = useState(null);  // الغرض الذي نختار له صندوقاً جديداً
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();
  // رابط الصورة المعروضة مكبّرة (نافذة التكبير) — null = مغلقة
  const [zoomUrl, setZoomUrl] = useState(null);

  // الصندوق الحديث (يُحدَّث محليّاً بعد التعديل)
  const [currentBox, setCurrentBox] = useState(box);
  // سجلّ حركة الصندوق + أغراضه
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setCurrentBox(box);
    loadItems();
  }, [box.id]);

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase.from('items').select('*').eq('box_id', box.id).is('deleted_at', null).order('name');
    setItems(data || []);
    setLoading(false);
  }

  async function refreshBox() {
    const { data } = await supabase.from('boxes').select('*').eq('id', box.id).single();
    if (data) setCurrentBox(data);
  }

  async function handleUpdate(patch) {
    setBusy(true);
    const { error } = await updateBox(box.id, patch);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditing(false);
    await refreshBox();
    await onRefresh();
  }

  async function handleDeleteBox() {
    setBusy(true);
    const { error } = await deleteBox(box.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم حذف الصندوق');
    await onRefresh();
    onBackToZone();
  }

  async function handleUpdateItem(item, patch) {
    setBusy(true);
    // patch قد يحوي tags كمصفوفة — Supabase يقبلها مباشرة
    const update = { ...patch };
    if (update.tags === undefined) delete update.tags;
    const { error } = await supabase.from('items').update(update).eq('id', item.id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    setEditingItemId(null);
    await loadItems();
    await onRefresh();
  }

  // اقتراحات الوسوم: كل الوسوم الموجودة حالياً في المستودع (فريدة)
  const tagSuggestions = useMemo(() => {
    const all = new Set();
    (data?.items || []).forEach(it => (it.tags || []).forEach(t => all.add(t)));
    return Array.from(all).sort();
  }, [data?.items]);

  // ====== سحب الأصناف (نقل لصندوق آخر) — مبدئيّاً يعمل عبر النقر للاختيار ======
  // عند اختيار صنف ثم النقر على صندوق آخر في صفحة أخرى، يحتاج state مشترك. للآن نُطلق إشارة عبر window.
  const [selectedItemForMove, setSelectedItemForMove] = useState(null);

  function handleItemClickHandle(item, e) {
    e?.stopPropagation();
    if (selectedItemForMove?.id === item.id) {
      setSelectedItemForMove(null);
    } else {
      setSelectedItemForMove(item);
    }
  }

  async function handleAddItem(values) {
    if (!values.name?.trim()) return flash('اسم الصنف مطلوب', 'error');
    setBusy(true);
    const { data: newItem, error } = await supabase.from('items').insert({
      box_id: box.id,
      name: values.name.trim(),
      quantity: Number(values.quantity) || 1,
      status: 'ok',
      photo_url: values.photo_url || null,
      tags: values.tags || []
    }).select().single();
    if (!error && newItem) {
      // تسجيل في سجلّ النشاط (للسجلّ المُنظَّم)
      await import('../lib/supabase').then(m => m.logActivity(
        'إضافة',
        `${values.name.trim()} × ${values.quantity}`,
        currentBox.code,
        'item',
        newItem.id
      ));
    }
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ تمت إضافة "${values.name}"`);
    setShowAddItem(false);
    await loadItems();
    await onRefresh();
  }

  async function handleDeleteItem(item) {
    setBusy(true);
    const { error } = await softDeleteItem(item.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم النقل لسلّة المحذوفات');
    await loadItems();
    await onRefresh();
  }

  // تحميل سجلّ هذا الصندوق وأغراضه
  async function loadHistory() {
    setHistoryLoading(true);
    setShowHistory(true);
    const itemIds = items.map(i => i.id);
    const targetIds = [box.id, ...itemIds];
    // أوّلاً: نحاول البحث بـtarget_id (إن وُجد بعد الترقية 11)
    const { data: byId } = await supabase.from('activity_log')
      .select('*').in('target_id', targetIds).order('created_at', { ascending: false }).limit(100);
    // ثانياً: نضيف بحثاً نصياً قديماً عن رمز الصندوق (للسجلّات قبل الترقية)
    const { data: byText } = await supabase.from('activity_log')
      .select('*').or(`target.ilike.%${box.code}%,location.ilike.%${box.code}%`)
      .order('created_at', { ascending: false }).limit(100);
    const all = [...(byId || []), ...(byText || [])];
    // إزالة التكرار بالـid
    const seen = new Set();
    const unique = all.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
    unique.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setHistoryEntries(unique);
    setHistoryLoading(false);
  }

  async function handleMoveItem(targetBoxId) {
    if (!movingItem || !targetBoxId || targetBoxId === box.id) return;
    setBusy(true);
    const { error } = await moveItemToBox(movingItem.id, targetBoxId);
    setBusy(false);
    setMovingItem(null);
    if (error) return flash('فشل النقل: ' + error.message, 'error');
    flash(`✅ نُقل "${movingItem.name}"`);
    await loadItems();
    await onRefresh();
  }

  return (
    <>
      <StatusToast msg={msg} />
      <ImageLightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />

      {/* شريط التنقّل — الرجوع مباشرةً للمساحة (لا تمرّ بشاشة الرفّ) */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-xs">
        <button onClick={onBackToZone} className="px-3 py-1.5 border border-stone-300 dark:border-stone-700 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">→ الرجوع للمساحة</button>
        <div className="text-stone-500 dark:text-stone-400 flex items-center gap-1">
          <button onClick={onBackToMap} className="hover:underline">المستودع</button>
          <span className="text-stone-300 dark:text-stone-600">‹</span>
          <button onClick={onBackToZone} className="hover:underline" style={{ color: zone.color }}>مساحة {zone.letter}</button>
          <span className="text-stone-300 dark:text-stone-600">‹</span>
          <span className="font-medium text-amber-700">صندوق {currentBox.code}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-3">
            {currentBox.photo_url ? (
              <img src={currentBox.photo_url} alt={currentBox.code}
                className="w-20 h-20 object-cover rounded-lg border border-amber-200 dark:border-amber-800 cursor-zoom-in"
                title="اضغط لتكبير الصورة"
                onClick={() => setZoomUrl(currentBox.photo_url)} />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-3xl">📦</div>
            )}
            <div>
              <h2 className="text-sm font-display font-bold flex items-center gap-1.5">
                صندوق {currentBox.code}
                <CopyCodeButton code={currentBox.code} />
              </h2>
              {currentBox.description && <p className="text-xs text-stone-500 dark:text-stone-400">{currentBox.description}</p>}
              <p className="text-[10px] text-stone-400 mt-0.5">
                {currentBox.width_cm}×{currentBox.height_cm}سم · في {shelfDisplayName(shelf, zone?.shelves || [])} من مساحة {zone.letter}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={loadHistory}
              className="text-[11px] bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-700"
              title="سجلّ حركة هذا الصندوق وأغراضه">
              📜 السجلّ
            </button>
            <button
              onClick={() => printBoxLabel(currentBox, activeWarehouse?.id, activeWarehouse?.name, zone?.name)}
              className="text-[11px] bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 px-2.5 py-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
              title="اطبع ملصق هذا الصندوق فقط (QR + رمز + اسم المساحة)">
              🖨 طباعة الملصق
            </button>
            {isFounder && (
              <>
                <button onClick={() => setEditing(e => !e)} disabled={busy}
                  className="text-[11px] border border-stone-300 dark:border-stone-700 dark:text-stone-300 px-2.5 py-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800">
                  ✏️ تعديل
                </button>
                <button onClick={() => setConfirming({ type: 'box' })} disabled={busy}
                  className="text-[11px] bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50">
                  🗑 حذف
                </button>
              </>
            )}
          </div>
        </div>

        {isFounder && editing && (
          <FormModal
            title={`✏️ تعديل الصندوق ${currentBox.code}`}
            onClose={() => setEditing(false)}
            maxWidth="max-w-md"
          >
            <EditBoxForm
              box={currentBox}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={handleUpdate}
            />
          </FormModal>
        )}

        {/* المنظور العلوي للصندوق المفتوح + الأصناف داخله */}
        <div className="border-t border-stone-200 dark:border-stone-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-display font-bold text-stone-700 dark:text-stone-300">📦 منظور علوي للصندوق ({items.length} صنف)</h3>
            {(isFounder || can('add')) && (
              <button onClick={() => setShowAddItem(s => !s)} disabled={busy}
                className="text-xs bg-gradient-to-l from-brand-navy to-brand-purple text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 font-bold shadow-sm">
                + إضافة صنف
              </button>
            )}
          </div>

          {showAddItem && (
            <FormModal
              title="+ صنف جديد داخل هذا الصندوق"
              subtitle={`الصندوق: ${currentBox.code}`}
              onClose={() => setShowAddItem(false)}
              maxWidth="max-w-md"
            >
              <AddItemInBoxForm
                busy={busy}
                onCancel={() => setShowAddItem(false)}
                onSave={handleAddItem}
                tagSuggestions={tagSuggestions}
              />
            </FormModal>
          )}
          {loading ? (
            <p className="text-center text-sm text-stone-400 py-8">جاري التحميل...</p>
          ) : (
            <div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-4">
              {/* إطار الصندوق المفتوح من فوق */}
              <div className="relative rounded-md mx-auto overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, #d4a574 0%, #c19661 8%, #f5e6d0 12%, #faf0dc 50%, #f5e6d0 88%, #b08754 92%, #a07a4a 100%)',
                  border: '4px solid #8b6f3f',
                  boxShadow: 'inset 0 0 30px rgba(120, 80, 40, 0.25), 0 4px 8px rgba(0,0,0,0.15)',
                  maxWidth: '600px',
                  minHeight: items.length === 0 ? '200px' : 'auto',
                  padding: '20px'
                }}>
                {/* أطراف الصندوق المفتوح (طيّات الكرتون) */}
                <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-amber-700/50 to-transparent pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-amber-700/50 to-transparent pointer-events-none"></div>
                <div className="absolute top-0 bottom-0 left-0 w-2 bg-gradient-to-r from-amber-700/40 to-transparent pointer-events-none"></div>
                <div className="absolute top-0 bottom-0 right-0 w-2 bg-gradient-to-l from-amber-700/40 to-transparent pointer-events-none"></div>

                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-stone-500 italic py-8">
                    <div className="text-4xl mb-2 opacity-40">📭</div>
                    <p className="text-xs">الصندوق فارغ</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 relative z-10">
                    {items.map(it => (
                      <ItemFromAbove key={it.id} item={it}
                        canCheckout={can('checkout')}
                        canEdit={isFounder || can('edit')}
                        canDelete={isFounder || can('delete')}
                        canMove={isFounder || can('edit')}
                        busy={busy}
                        isSelected={selectedItemForMove?.id === it.id}
                        onCheckout={() => setCheckoutItem({ ...it, boxCode: currentBox.code, boxId: currentBox.id })}
                        onToggleEdit={() => setEditingItemId(it.id)}
                        onDelete={() => setConfirming({ type: 'item', item: it })}
                        onClickHandle={(e) => handleItemClickHandle(it, e)}
                        onMove={() => setMovingItem(it)}
                        onZoom={(url) => setZoomUrl(url)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-center text-[10px] text-stone-500 dark:text-stone-400 mt-3 italic">
                {currentBox.width_cm} × {currentBox.height_cm} سم · {items.length} صنف
              </p>
            </div>
          )}
        </div>

      </div>

      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} onSaved={() => { loadItems(); onRefresh(); }} />}
      {confirming?.type === 'box' && (
        <ConfirmDelete
          message={items.length > 0
            ? `⚠️ يحتوي هذا الصندوق على ${items.length} ${items.length === 1 ? 'صنف' : 'أصناف'}. سيُحذف الصندوق وكل الأصناف بداخله (يمكن استرجاعها من سلّة المحذوفات لاحقاً).`
            : `سيُحذف الصندوق ${currentBox.code}. هل أنت متأكّد؟`
          }
          busy={busy}
          onConfirm={handleDeleteBox}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming?.type === 'item' && (
        <ConfirmDelete
          message={`سيُحذف الصنف "${confirming.item.name}". هل أنت متأكّد؟`}
          busy={busy}
          onConfirm={() => handleDeleteItem(confirming.item)}
          onCancel={() => setConfirming(null)}
        />
      )}

      {/* مودال تعديل غرض */}
      {editingItemId && (() => {
        const it = items.find(x => x.id === editingItemId);
        if (!it) return null;
        return (
          <FormModal
            title={`✏️ تعديل "${it.name}"`}
            subtitle={`في صندوق ${currentBox.code}`}
            onClose={() => setEditingItemId(null)}
            maxWidth="max-w-md"
          >
            <EditItemInline
              item={it}
              busy={busy}
              onCancel={() => setEditingItemId(null)}
              onSave={(patch) => handleUpdateItem(it, patch)}
              tagSuggestions={tagSuggestions}
            />
          </FormModal>
        );
      })()}

      {/* مُنتقي بصريّ لنقل الغرض: خريطة المستودع → مساحة → صندوق */}
      {movingItem && (
        <LocationPicker
          mode="item"
          data={data || { boxes: [], zones: [], items: [] }}
          onCancel={() => setMovingItem(null)}
          onSelect={({ box }) => handleMoveItem(box.id)}
          title={`📍 نقل "${movingItem.name}"`}
          subtitle={`من ${currentBox.code} · اختر الوجهة من خريطة المستودع`}
        />
      )}

      {/* مودال سجلّ حركة الصندوق وأغراضه */}
      {showHistory && (
        <FormModal
          title={`📜 سجلّ حركة الصندوق ${currentBox.code}`}
          subtitle={`يشمل سجلّ الصندوق وكلّ أغراضه (${items.length} غرض)`}
          onClose={() => setShowHistory(false)}
          maxWidth="max-w-2xl"
        >
          {historyLoading ? (
            <p className="text-center text-sm text-stone-500 dark:text-stone-400 py-8">جاري التحميل...</p>
          ) : historyEntries.length === 0 ? (
            <div className="text-center py-8 text-stone-400">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">لا توجد حركات مُسجَّلة لهذا الصندوق بعد</p>
              <p className="text-[11px] mt-2">السجلّات الجديدة ستظهر هنا تلقائياً</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {historyEntries.map(e => (
                <div key={e.id} className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 text-xs">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-bold text-brand-navy dark:text-stone-200">{e.action}</span>
                    <span className="text-[10px] text-stone-500 dark:text-stone-400">
                      {new Date(e.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  {e.target && <div className="text-stone-700 dark:text-stone-300 mt-0.5">📌 {e.target}</div>}
                  {e.location && <div className="text-[10px] text-stone-500 dark:text-stone-400">📍 {e.location}</div>}
                  <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-1">بواسطة: <strong>{e.user_name}</strong></div>
                </div>
              ))}
            </div>
          )}
        </FormModal>
      )}
    </>
  );
}

// نموذج إضافة صنف داخل الصندوق
function AddItemInBoxForm({ busy, onCancel, onSave, tagSuggestions = [] }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [tags, setTags] = useState([]);
  const isValid = name.trim().length > 0;

  return (
    <div className="bg-white dark:bg-stone-900 border-2 border-blue-400 dark:border-blue-700 rounded-xl p-4 animate-fade-in">
      <h4 className="text-xs font-display font-bold text-blue-900 dark:text-blue-300 mb-3">+ صنف جديد داخل هذا الصندوق</h4>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 dark:text-stone-300 mb-1">اسم الصنف *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="مثال: حبال تجاذب"
            className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 dark:text-stone-300 mb-1">الكميّة</label>
          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 dark:text-stone-300 mb-1">🏷 وسوم (تصنيفات)</label>
          <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
        </div>
        <div className="col-span-2">
          <PhotoUploader
            value={photoUrl}
            onChange={setPhotoUrl}
            prefix="items"
            label="صورة الصنف (اختياريّة)"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ name, quantity, photo_url: photoUrl, tags })}
          disabled={busy || !isValid}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm">
          💾 حفظ
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
          إلغاء
        </button>
      </div>
    </div>
  );
}

// مكوّن صنف من فوق (يبدو كأنّك تنظر إلى داخل الصندوق)
function ItemFromAbove({ item, canCheckout, canEdit, canDelete, canMove, busy, isDragging, isSelected, onCheckout, onToggleEdit, onDelete, onDragStart, onDragEnd, onClickHandle, onMove, onZoom }) {
  return (
    <div title={item.name}
      className={`bg-white dark:bg-stone-900 rounded-md border-2 border-amber-700/40 shadow-md hover:shadow-lg hover:border-amber-700/60 transition relative overflow-hidden ${isDragging ? 'opacity-30 scale-95' : ''} ${isSelected ? 'ring-4 ring-blue-500 ring-offset-1' : ''}`}
      style={{ boxShadow: '0 2px 5px rgba(120,80,40,0.15), inset 0 1px 0 rgba(255,255,255,0.6)' }}>
      <>
          {/* صورة الصنف — أو الاسم نصّاً إن لم توجد صورة. الضغط على الصورة يكبّرها */}
          <div
            onClick={() => item.photo_url && onZoom?.(item.photo_url)}
            className={`aspect-square bg-stone-50 dark:bg-stone-800 relative overflow-hidden ${item.photo_url ? 'cursor-zoom-in' : ''}`}>
            {item.photo_url ? (
              <img src={item.photo_url} alt={item.name} draggable={false} className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-2 bg-gradient-to-br from-amber-50 to-stone-100 pointer-events-none">
                <span className="text-sm font-display font-bold text-stone-800 text-center break-words leading-tight">
                  {item.name}
                </span>
              </div>
            )}
            {/* شارة الكميّة */}
            <div className="absolute top-1 right-1 bg-brand-blue text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow pointer-events-none">
              ×{item.quantity}
            </div>
            {/* مقبض السحب — أيقونة نقاط الإمساك */}
            {canMove && (
              <div
                draggable={true}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onClick={onClickHandle}
                className={`absolute top-1 left-1 w-7 h-7 rounded-lg shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center z-10 transition ${
                  isSelected
                    ? 'bg-blue-600 border-2 border-blue-700 hover:bg-blue-700'
                    : 'bg-white/95 border-2 border-amber-700 hover:bg-amber-50'
                }`}
                title="اسحب أو اضغط لنقل الصنف"
              >
                <svg viewBox="0 0 24 24" className={`w-4 h-4 ${isSelected ? 'fill-white' : 'fill-amber-800'}`}>
                  <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/>
                </svg>
              </div>
            )}
            {isSelected && (
              <span className="absolute bottom-1 left-1 text-[9px] text-white bg-blue-600 px-1 py-0.5 rounded pointer-events-none z-10">
                مختار
              </span>
            )}
          </div>
          {/* اسم الصنف + الوسوم (يظهران تحت الصورة فقط — وإن لم توجد صورة فالاسم في الأعلى) */}
          <div className="p-2">
            {item.photo_url && (
              <h5 title={item.name} className="text-xs font-medium text-stone-900 dark:text-stone-200 text-center mb-1 break-words leading-tight">{item.name}</h5>
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="flex justify-center mb-1.5">
                <TagChips tags={item.tags} max={2} />
              </div>
            )}
            <div className="flex items-center justify-center gap-1 flex-wrap">
              {canCheckout && (
                <button onClick={onCheckout}
                  className="text-[9px] bg-gradient-to-l from-brand-navy to-brand-purple text-white px-2 py-0.5 rounded hover:opacity-90 font-bold shadow-sm">
                  إخراج
                </button>
              )}
              {canMove && onMove && (
                <button onClick={onMove} disabled={busy}
                  className="text-[9px] bg-purple-50 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300 px-1.5 py-0.5 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50"
                  title="نقل لصندوق آخر">
                  📍 نقل
                </button>
              )}
              {canEdit && (
                <button onClick={onToggleEdit} disabled={busy}
                  className="text-[9px] border border-stone-300 dark:border-stone-700 dark:text-stone-300 px-1.5 py-0.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800">
                  ✏️
                </button>
              )}
              {canDelete && (
                <button onClick={onDelete} disabled={busy}
                  className="text-[9px] bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50">
                  🗑
                </button>
              )}
            </div>
          </div>
        </>
    </div>
  );
}

// نموذج تعديل صنف داخل الصندوق (مع الوسوم)
function EditItemInline({ item, busy, onCancel, onSave, tagSuggestions = [] }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [photoUrl, setPhotoUrl] = useState(item.photo_url || null);
  const [tags, setTags] = useState(item.tags || []);
  const dirty =
    name !== item.name ||
    Number(quantity) !== Number(item.quantity) ||
    photoUrl !== (item.photo_url || null) ||
    JSON.stringify(tags) !== JSON.stringify(item.tags || []);

  return (
    <div className="text-xs">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 dark:text-stone-300 mb-1">الاسم</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-600 dark:text-stone-300 mb-1">الكميّة</label>
          <input type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-full px-2 py-1.5 border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 rounded" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-600 dark:text-stone-300 mb-1">🏷 وسوم</label>
          <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
        </div>
        <div className="col-span-2">
          <PhotoUploader value={photoUrl} onChange={setPhotoUrl} prefix="items" label="صورة الصنف" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ name: name.trim(), quantity: Number(quantity), photo_url: photoUrl, tags })}
          disabled={busy || !dirty || !name.trim()}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-1.5 rounded text-xs font-bold hover:opacity-90 disabled:opacity-30 shadow-sm">
          💾 حفظ
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 border border-stone-300 dark:border-stone-700 dark:text-stone-300 rounded text-xs hover:bg-stone-100 dark:hover:bg-stone-800">
          إلغاء
        </button>
      </div>
    </div>
  );
}
