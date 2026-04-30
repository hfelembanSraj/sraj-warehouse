// تنبيه يومي بالعدّة المتأخّرة
// يُرسل بريداً للمستخدم الذي أخرج العُدّة + ملخّصاً للمؤسّس
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const DEFAULT_RETURN_DAYS = 10;

if (!RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY');
  process.exit(1);
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html })
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`✗ Email to ${to} failed: ${res.status} ${txt}`);
    return false;
  }
  console.log(`✓ Email sent to ${to}`);
  return true;
}

function buildUserEmail(userName, items, siteUrl) {
  const rows = items.map(c => {
    const days = daysSince(c.date_out);
    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e5e5;">${c.item_name} × ${c.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e5e5;font-family:monospace;">${c.box_code}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e5e5;color:#dc2626;font-weight:bold;">${days} يوم</td>
      </tr>`;
  }).join('');
  return `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fafaf9;padding:20px;border-radius:12px;">
      <div style="background:white;padding:20px;border-radius:8px;">
        <h2 style="color:#185FA5;margin:0 0 8px;">تذكير بإرجاع العُدّة المتأخّرة</h2>
        <p style="color:#57534e;font-size:14px;">السلام عليكم ${userName}،</p>
        <p style="color:#57534e;font-size:14px;">عندك ${items.length} عُدّة متأخّرة عن المهلة المحدّدة (${DEFAULT_RETURN_DAYS} أيام). نرجو إرجاعها قريباً.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
          <thead>
            <tr style="background:#fef2f2;">
              <th style="padding:10px;text-align:right;">الأداة</th>
              <th style="padding:10px;text-align:right;">الصندوق</th>
              <th style="padding:10px;text-align:right;">عدد الأيام</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <a href="${siteUrl}" style="display:inline-block;background:#185FA5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">فتح المستودع للإرجاع</a>
        <p style="color:#a8a29e;font-size:11px;margin-top:24px;">جمعية المسؤولية الاجتماعية · Sraj-Warehouse</p>
      </div>
    </div>`;
}

function buildFounderEmail(allOverdue, siteUrl) {
  const byUser = {};
  allOverdue.forEach(c => {
    const key = `${c.user_id}::${c.user_name}`;
    if (!byUser[key]) byUser[key] = { name: c.user_name, items: [] };
    byUser[key].items.push(c);
  });
  const sections = Object.values(byUser).map(g => {
    const rows = g.items.map(c => {
      const days = daysSince(c.date_out);
      return `<li>${c.item_name} × ${c.quantity} <span style="color:#a8a29e;">(${c.box_code} · ${days} يوم)</span></li>`;
    }).join('');
    return `
      <div style="margin-bottom:14px;padding:12px;background:#fafaf9;border-radius:6px;">
        <p style="margin:0 0 4px;font-weight:bold;color:#185FA5;">${g.name} (${g.items.length})</p>
        <ul style="margin:0;padding-right:20px;font-size:13px;color:#57534e;">${rows}</ul>
      </div>`;
  }).join('');

  return `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fafaf9;padding:20px;border-radius:12px;">
      <div style="background:white;padding:20px;border-radius:8px;">
        <h2 style="color:#D85A30;margin:0 0 8px;">👑 ملخّص المتأخّرات اليومي</h2>
        <p style="color:#57534e;font-size:14px;">إجمالي ${allOverdue.length} عُدّة متأخّرة عند ${Object.keys(byUser).length} مستخدم.</p>
        ${sections}
        <a href="${siteUrl}" style="display:inline-block;background:#185FA5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:8px;">فتح لوحة الإدارة</a>
        <p style="color:#a8a29e;font-size:11px;margin-top:24px;">إذا أردت إيقاف هذا التنبيه، عدّل cron job في GitHub Actions.</p>
      </div>
    </div>`;
}

async function main() {
  const siteUrl = process.env.SITE_URL || 'https://sraj-warehouse.vercel.app';

  // جلب كل عمليّات الإخراج النشطة (لم تُرجَع/تُتلَف/تُدعَم)
  const { data: checkouts, error } = await supabase
    .from('checkouts')
    .select('*')
    .eq('purpose', 'initiative')
    .is('returned_at', null)
    .is('damaged_at', null)
    .is('donated_at', null);

  if (error) { console.error('Failed to query checkouts:', error); process.exit(1); }

  // تصفية المتأخّرة فقط
  const overdue = (checkouts || []).filter(c => daysSince(c.date_out) > DEFAULT_RETURN_DAYS);
  console.log(`Found ${overdue.length} overdue checkouts`);

  if (overdue.length === 0) {
    console.log('✅ No overdue items today.');
    return;
  }

  // جلب بيانات المستخدمين
  const userIds = [...new Set(overdue.map(c => c.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_founder')
    .in('id', userIds);

  const userMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  // جمع المتأخّرات حسب المستخدم
  const byUser = {};
  for (const c of overdue) {
    if (!byUser[c.user_id]) byUser[c.user_id] = [];
    byUser[c.user_id].push(c);
  }

  // إرسال بريد لكل مستخدم
  for (const [userId, items] of Object.entries(byUser)) {
    const user = userMap[userId];
    if (!user?.email) {
      console.warn(`No email for user ${userId}`);
      continue;
    }
    await sendEmail({
      to: user.email,
      subject: `📦 تذكير: عندك ${items.length} عُدّة متأخّرة`,
      html: buildUserEmail(user.full_name || user.email, items, siteUrl)
    });
  }

  // ملخّص للمؤسّس
  const founder = (profiles || []).find(p => p.is_founder);
  if (founder?.email) {
    await sendEmail({
      to: founder.email,
      subject: `👑 ملخّص المتأخّرات (${overdue.length} عُدّة)`,
      html: buildFounderEmail(overdue, siteUrl)
    });
  }

  console.log('✅ Done.');
}

main().catch(err => {
  console.error('notify-overdue failed:', err);
  process.exit(1);
});
