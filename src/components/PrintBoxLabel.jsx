// طباعة ملصق فردي لصندوق — يفتح نافذة جديدة بـQR + الرمز + الوصف للطباعة
import QRCode from 'qrcode';

export async function printBoxLabel(box, warehouseId, warehouseName, zoneName) {
  const url = `${window.location.origin}/?wh=${warehouseId}&box=${box.code}`;
  const qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 1 });

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>ملصق ${box.code}</title>
  <style>
    @page { size: 10cm 10cm; margin: 0; }
    body {
      margin: 0;
      padding: 0.5cm;
      font-family: 'Tajawal', 'Arial', sans-serif;
      direction: rtl;
      box-sizing: border-box;
    }
    .label {
      width: 100%;
      height: 100%;
      border: 3px solid #1A2B5F;
      border-radius: 8px;
      padding: 0.4cm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      gap: 0.2cm;
    }
    .header {
      text-align: center;
      width: 100%;
    }
    .wh-name {
      font-size: 9pt;
      color: #6B7280;
      font-weight: 600;
    }
    .zone-name {
      font-size: 11pt;
      color: #1A2B5F;
      font-weight: bold;
      margin-top: 2pt;
    }
    .qr {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr img { width: 5cm; height: 5cm; }
    .footer {
      text-align: center;
      width: 100%;
      border-top: 2px dashed #D1D5DB;
      padding-top: 0.2cm;
    }
    .code {
      font-family: 'Courier New', monospace;
      font-size: 22pt;
      font-weight: bold;
      color: #1A2B5F;
      letter-spacing: 1pt;
    }
    .desc {
      font-size: 10pt;
      color: #4B5563;
      margin-top: 2pt;
      max-height: 1.5em;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="header">
      <div class="wh-name">${escapeHtml(warehouseName || '')}</div>
      ${zoneName ? `<div class="zone-name">${escapeHtml(zoneName)}</div>` : ''}
    </div>
    <div class="qr"><img src="${qrDataUrl}" alt="QR" /></div>
    <div class="footer">
      <div class="code">${escapeHtml(box.code)}</div>
      ${box.description ? `<div class="desc">${escapeHtml(box.description)}</div>` : ''}
    </div>
  </div>
  <script>window.onload = () => { setTimeout(() => { window.print(); }, 200); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=400,height=400');
  if (!win) {
    alert('السماحُ بنوافذ الإطار مطلوب للطباعة. فعّل النوافذ المنبثقة وأعد المحاولة.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
