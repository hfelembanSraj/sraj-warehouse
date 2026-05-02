// إدارة حُزَم المبادرات: إنشاء حزم جاهزة من الأدوات لتسريع تجهيز الفعاليّات
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, logActivity } from '../lib/supabase';
import { ConfirmDelete, FormModal, StatusToast, useFlash } from './BuilderForms';
import { DEFAULT_RETURN_DAYS } from '../lib/constants';

const PRESET_ICONS = ['🎪','🎨','🏆','📚','🎭','🎤','🌳','⚽','🎁','💡','🛠','🎓'];
const PRESET_COLORS = ['#7B2D8E','#E91E8B','#F58220','#6CB33E','#00A8B5','#185FA5','#FFCC00','#1A2B5F'];

export default function InitiativesTab({ data, onRefresh }) {
  const { user, profile, warehouseId, can, isFounder } = useAuth();
  const [initiatives, setInitiatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, flash] = useFlash();

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);   // { initiative, items }
  const [confirming, setConfirming] = useState(null);
  const [executing, setExecuting] = useState(null);  // المبادرة المختارة للإخراج

  useEffect(() => { if (warehouseId) load(); }, [warehouseId]);

  async function load() {
    setLoading(true);
    const { data: list } = await supabase
      .from('initiatives')
      .select('*, initiative_items(id, item_id, quantity, notes, items(id, name, photo_url, quantity, tags))')
      .eq('warehouse_id', warehouseId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setInitiatives(list || []);
    setLoading(false);
  }

  async function handleCreate(values) {
    setBusy(true);
    const { data: inserted, error } = await supabase.from('initiatives').insert({
      warehouse_id: warehouseId,
      name: values.name.trim(),
      description: values.description?.trim() || null,
      color: values.color || '#7B2D8E',
      icon: values.icon || '🎪',
      created_by: user?.id
    }).select().single();
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash(`✅ أُنشئت "${values.name}"`);
    setShowCreate(false);
    await load();
    if (inserted) setEditing({ initiative: inserted, items: [] });
  }

  async function handleUpdateInitiative(id, patch) {
    setBusy(true);
    const { error } = await supabase.from('initiatives').update(patch).eq('id', id);
    setBusy(false);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ تم الحفظ');
    await load();
  }

  async function handleSoftDelete(initiative) {
    setBusy(true);
    const { error } = await supabase.from('initiatives')
      .update({ deleted_at: new Date().toISOString() }).eq('id', initiative.id);
    setBusy(false);
    setConfirming(null);
    if (error) return flash('فشل: ' + error.message, 'error');
    flash('✅ حُذفت المبادرة');
    await load();
  }

  return (
    <>
      <StatusToast msg={msg} />

      <div className="bg-gradient-to-l from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4 mb-4 flex items-center gap-3">
        <div className="text-3xl">🎪</div>
        <div className="flex-1">
          <h2 className="text-base font-display font-bold text-brand-purple">حُزَم المبادرات</h2>
          <p className="text-xs text-stone-700">احفظ قائمة الأدوات التي تحتاجها كلّ فعاليّة، ثمّ أخرجها كلّها بضغطة واحدة</p>
        </div>
        {(isFounder || can('add')) && (
          <button onClick={() => setShowCreate(true)}
            className="text-xs bg-gradient-to-l from-brand-navy to-brand-purple text-white px-4 py-2 rounded-lg hover:opacity-90 font-bold shadow-sm">
            + مبادرة جديدة
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-stone-400 py-12">جاري التحميل...</p>
      ) : initiatives.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-sm text-stone-600 mb-3">لا توجد مبادرات بعد</p>
          <p className="text-xs text-stone-500 mb-4">أنشئ مبادرتك الأولى لتسريع تجهيز الفعاليّات</p>
          {(isFounder || can('add')) && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex bg-gradient-to-l from-brand-navy to-brand-purple text-white px-5 py-2.5 rounded-lg font-bold text-xs hover:opacity-90">
              + إنشاء أوّل مبادرة
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {initiatives.map(init => {
            const itemsCount = init.initiative_items?.length || 0;
            const totalQty = (init.initiative_items || []).reduce((s, ii) => s + (ii.quantity || 0), 0);
            return (
              <div key={init.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-md transition">
                <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${init.color}25 0%, white 100%)`, borderBottom: `3px solid ${init.color}` }}>
                  <div className="flex items-start gap-2">
                    <div className="text-3xl">{init.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-display font-bold truncate" style={{ color: init.color }}>{init.name}</h3>
                      {init.description && <p className="text-[11px] text-stone-600 truncate">{init.description}</p>}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-stone-50 rounded-lg p-2 text-center">
                      <div className="text-base font-bold text-stone-900">{itemsCount}</div>
                      <div className="text-[10px] text-stone-500">صنف</div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-2 text-center">
                      <div className="text-base font-bold text-stone-900">{totalQty}</div>
                      <div className="text-[10px] text-stone-500">قطعة</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing({ initiative: init, items: init.initiative_items || [] })}
                      className="flex-1 text-[11px] bg-stone-100 hover:bg-stone-200 px-2 py-1.5 rounded font-medium">
                      ✏️ تعديل
                    </button>
                    {itemsCount > 0 && can('checkout') && (
                      <button onClick={() => setExecuting(init)}
                        className="flex-1 text-[11px] bg-gradient-to-l from-brand-navy to-brand-purple text-white px-2 py-1.5 rounded font-bold hover:opacity-90">
                        🚀 إخراج
                      </button>
                    )}
                    <button onClick={() => setConfirming(init)}
                      className="text-[11px] bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded hover:bg-red-100">
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <FormModal title="🎪 مبادرة جديدة" subtitle="حُزمة جاهزة من الأدوات لفعاليّة" onClose={() => setShowCreate(false)} maxWidth="max-w-md">
          <InitiativeForm busy={busy} onCancel={() => setShowCreate(false)} onSave={handleCreate} />
        </FormModal>
      )}

      {editing && (
        <FormModal
          title={`${editing.initiative.icon} تعديل "${editing.initiative.name}"`}
          subtitle="حدّد الأدوات والكميّات المطلوبة لهذه المبادرة"
          onClose={() => { setEditing(null); load(); }}
          maxWidth="max-w-3xl"
        >
          <InitiativeItemsManager
            initiative={editing.initiative}
            allItems={data.items}
            allBoxes={data.boxes}
            allZones={data.zones}
            onClose={() => { setEditing(null); load(); }}
            onUpdateInfo={(p) => handleUpdateInitiative(editing.initiative.id, p)}
          />
        </FormModal>
      )}

      {executing && (
        <FormModal
          title={`🚀 إخراج "${executing.name}"`}
          subtitle="إخراج كلّ أدوات المبادرة دفعة واحدة"
          onClose={() => setExecuting(null)}
          maxWidth="max-w-lg"
        >
          <ExecuteInitiativeForm
            initiative={executing}
            allItems={data.items}
            allBoxes={data.boxes}
            user={user}
            profile={profile}
            warehouseId={warehouseId}
            onCancel={() => setExecuting(null)}
            onDone={async () => { setExecuting(null); flash('✅ تمّ إخراج المبادرة'); await onRefresh(); }}
          />
        </FormModal>
      )}

      {confirming && (
        <ConfirmDelete
          message={`سيُحذف "${confirming.name}". الأدوات نفسها لن تتأثّر — فقط القائمة المحفوظة.`}
          busy={busy}
          onConfirm={() => handleSoftDelete(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}

// ===== نموذج إنشاء/تعديل بيانات المبادرة =====
function InitiativeForm({ initial = {}, busy, onCancel, onSave }) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [color, setColor] = useState(initial.color || PRESET_COLORS[0]);
  const [icon, setIcon] = useState(initial.icon || PRESET_ICONS[0]);
  const isValid = name.trim().length > 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (isValid) onSave({ name, description, color, icon }); }} className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1">اسم المبادرة *</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          placeholder="مثال: مبادرة الصيف"
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">الوصف (اختياري)</label>
        <input value={description} onChange={e => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">الأيقونة</label>
        <div className="flex gap-1 flex-wrap">
          {PRESET_ICONS.map(i => (
            <button type="button" key={i} onClick={() => setIcon(i)}
              className={`w-9 h-9 rounded-lg border-2 text-xl ${icon === i ? 'border-brand-navy bg-brand-navy/10' : 'border-stone-200 hover:border-stone-400'}`}>
              {i}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">اللون</label>
        <div className="flex gap-1 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button type="button" key={c} onClick={() => setColor(c)}
              className={`w-9 h-9 rounded-lg ${color === c ? 'ring-2 ring-offset-2 ring-stone-900' : ''}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-2 border-t border-stone-200">
        <button type="submit" disabled={busy || !isValid}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm">
          {busy ? '...' : '💾 حفظ'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </form>
  );
}

// ===== مدير أدوات المبادرة =====
function InitiativeItemsManager({ initiative, allItems, allBoxes, allZones, onClose, onUpdateInfo }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('all');
  const [busy, setBusy] = useState(false);
  const [showInfoEdit, setShowInfoEdit] = useState(false);

  useEffect(() => { reload(); }, [initiative.id]);

  async function reload() {
    const { data } = await supabase.from('initiative_items')
      .select('id, item_id, quantity, notes, items(id, name, photo_url, quantity)')
      .eq('initiative_id', initiative.id);
    setItems(data || []);
  }

  async function addItem(item) {
    if (items.find(ii => ii.item_id === item.id)) return;
    setBusy(true);
    await supabase.from('initiative_items').insert({
      initiative_id: initiative.id, item_id: item.id, quantity: 1
    });
    setBusy(false);
    await reload();
  }
  async function removeItem(initItem) {
    setBusy(true);
    await supabase.from('initiative_items').delete().eq('id', initItem.id);
    setBusy(false);
    await reload();
  }
  async function updateQty(initItem, qty) {
    setBusy(true);
    await supabase.from('initiative_items').update({ quantity: Math.max(1, parseInt(qty) || 1) }).eq('id', initItem.id);
    setBusy(false);
    await reload();
  }

  const enrichedAvailable = useMemo(() => {
    const inSet = new Set(items.map(ii => ii.item_id));
    return allItems.filter(it => !inSet.has(it.id)).map(it => {
      const box = allBoxes.find(b => b.id === it.box_id);
      const zoneLetter = box?.code?.split('-')[0];
      return { ...it, boxCode: box?.code, zoneLetter };
    });
  }, [items, allItems, allBoxes]);

  const filteredAvailable = enrichedAvailable.filter(it => {
    if (search.trim() && !`${it.name} ${it.boxCode || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterZone !== 'all' && it.zoneLetter !== filterZone) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-xs text-stone-700">
          <strong>{items.length}</strong> صنف في الحُزمة ·
          <strong> {items.reduce((s, ii) => s + ii.quantity, 0)}</strong> قطعة إجمالاً
        </div>
        <button onClick={() => setShowInfoEdit(true)}
          className="text-[11px] bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded font-medium">
          ✏️ تعديل بيانات الحُزمة
        </button>
      </div>

      {showInfoEdit && (
        <div className="mb-4 bg-stone-50 border border-stone-200 rounded-lg p-3">
          <InitiativeForm
            initial={initiative}
            busy={busy}
            onCancel={() => setShowInfoEdit(false)}
            onSave={async (p) => { await onUpdateInfo(p); setShowInfoEdit(false); }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* قائمة المُضاف */}
        <div className="bg-purple-50/50 border border-purple-200 rounded-lg p-3">
          <h5 className="text-xs font-bold text-brand-purple mb-2">✓ في الحُزمة ({items.length})</h5>
          {items.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-4">أضِف أدوات من اللائحة المقابلة</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {items.map(ii => (
                <div key={ii.id} className="bg-white border border-stone-200 rounded p-2 flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate font-medium">{ii.items?.name}</span>
                  <input type="number" min="1" value={ii.quantity}
                    onChange={e => updateQty(ii, e.target.value)}
                    className="w-14 px-2 py-1 border border-stone-300 rounded text-center text-xs" />
                  <button onClick={() => removeItem(ii)} className="text-red-600 hover:text-red-800">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* قائمة المتاح للإضافة */}
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
          <h5 className="text-xs font-bold mb-2">+ متاح للإضافة</h5>
          <div className="grid grid-cols-2 gap-1 mb-2">
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 ابحث..."
              className="px-2 py-1 border border-stone-300 rounded text-xs" />
            <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
              className="px-2 py-1 border border-stone-300 rounded text-xs bg-white">
              <option value="all">كل المساحات</option>
              {(allZones || []).map(z => <option key={z.id} value={z.letter}>{z.letter}</option>)}
            </select>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {filteredAvailable.map(it => (
              <button key={it.id} onClick={() => addItem(it)} disabled={busy}
                className="w-full text-right bg-white border border-stone-200 rounded p-1.5 hover:border-brand-purple hover:bg-purple-50 transition text-xs flex items-center justify-between gap-2">
                <span className="flex-1 truncate">{it.name}</span>
                <span className="text-[10px] text-stone-400 font-mono">{it.boxCode}</span>
                <span className="text-brand-purple font-bold">+</span>
              </button>
            ))}
            {filteredAvailable.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-4">لا نتائج</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-3 border-t border-stone-200 mt-3">
        <button onClick={onClose}
          className="text-xs bg-gradient-to-l from-brand-navy to-brand-purple text-white px-4 py-2 rounded-lg font-bold hover:opacity-90">
          ✓ تمّ
        </button>
      </div>
    </div>
  );
}

// ===== نموذج إخراج المبادرة (إخراج جماعي) =====
function ExecuteInitiativeForm({ initiative, allItems, allBoxes, user, profile, warehouseId, onCancel, onDone }) {
  const [purpose] = useState('initiative');
  const [initiativeName, setInitiativeName] = useState(initiative.name);
  const [dateOut, setDateOut] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  const items = initiative.initiative_items || [];

  async function handleExecute() {
    if (!initiativeName.trim()) return alert('اسم المبادرة مطلوب');
    setBusy(true);
    setProgress({ done: 0, total: items.length, errors: [] });

    for (let i = 0; i < items.length; i++) {
      const ii = items[i];
      const item = ii.items || allItems.find(x => x.id === ii.item_id);
      const box = allBoxes.find(b => b.id === item?.box_id);
      if (!item || !box) {
        setProgress(p => ({ ...p, done: p.done + 1, errors: [...p.errors, `${item?.name || 'صنف'}: لم يُعثَر على الصندوق`] }));
        continue;
      }
      const { error } = await supabase.from('checkouts').insert({
        warehouse_id: warehouseId,
        box_id: box.id,
        box_code: box.code,
        item_id: item.id,
        item_name: item.name,
        quantity: ii.quantity,
        user_id: user.id,
        user_name: profile?.full_name || 'مستخدم',
        purpose: 'initiative',
        initiative: initiativeName.trim(),
        date_out: dateOut
      });
      if (error) {
        setProgress(p => ({ ...p, done: p.done + 1, errors: [...p.errors, `${item.name}: ${error.message}`] }));
      } else {
        await logActivity('إخراج', `${item.name} × ${ii.quantity}`, box.code, 'item', item.id);
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }
    }

    setBusy(false);
  }

  if (progress?.done === items.length && !busy) {
    return (
      <div className="text-center py-4">
        <div className="text-4xl mb-2">{progress.errors.length === 0 ? '✅' : '⚠️'}</div>
        <p className="text-sm font-bold mb-2">
          {progress.errors.length === 0
            ? `تمّ إخراج كلّ ${items.length} صنف`
            : `أُخرِج ${items.length - progress.errors.length} من ${items.length} (${progress.errors.length} خطأ)`}
        </p>
        {progress.errors.length > 0 && (
          <ul className="text-[10px] text-red-700 list-disc pr-4 max-h-32 overflow-y-auto bg-red-50 p-2 rounded">
            {progress.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        <button onClick={onDone}
          className="mt-3 inline-flex bg-gradient-to-l from-brand-navy to-brand-purple text-white px-4 py-2 rounded-lg font-bold text-xs">
          إغلاق
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
        ستُنشأ <strong>{items.length} عمليّة إخراج</strong> دفعة واحدة بعد الضغط على "تأكيد".
        المهلة الافتراضيّة للإرجاع: <strong>{DEFAULT_RETURN_DAYS} أيّام</strong>.
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">اسم المبادرة (يظهر في السجلّات)</label>
        <input value={initiativeName} onChange={e => setInitiativeName(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">تاريخ الإخراج</label>
        <input type="date" value={dateOut} onChange={e => setDateOut(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs" />
      </div>

      <div className="bg-stone-50 rounded-lg p-2 max-h-56 overflow-y-auto">
        <p className="text-[11px] font-bold mb-1.5">الأدوات ({items.length}):</p>
        {items.map((ii, i) => (
          <div key={ii.id} className="text-[11px] py-0.5 flex items-center justify-between">
            <span className="truncate">{i + 1}. {ii.items?.name || '?'}</span>
            <span className="text-stone-500 font-mono">×{ii.quantity}</span>
          </div>
        ))}
      </div>

      {progress && busy && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
          <p className="text-xs font-bold">جاري الإخراج: {progress.done}/{progress.total}</p>
          <div className="w-full bg-blue-200 rounded-full h-2 mt-1.5 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }}></div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-stone-200">
        <button onClick={handleExecute} disabled={busy}
          className="flex-1 bg-gradient-to-l from-brand-navy to-brand-purple text-white py-2.5 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? '...جاري الإخراج' : '🚀 تأكيد إخراج كل الأدوات'}
        </button>
        <button onClick={onCancel} disabled={busy}
          className="px-4 py-2.5 border border-stone-300 rounded-lg text-xs hover:bg-stone-100">
          إلغاء
        </button>
      </div>
    </div>
  );
}
