import { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';

export default function QrScannerModal({ onClose, onResult }) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const [error, setError] = useState(null);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!videoRef.current) return;

      try {
        const scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (!mounted) return;
            onResult(result.data);
          },
          {
            highlightScanRegion: true,
            highlightCodeOutline: true,
            preferredCamera: 'environment'
          }
        );
        scannerRef.current = scanner;
        await scanner.start();

        const list = await QrScanner.listCameras(true);
        if (mounted) setCameras(list);

        const flash = await scanner.hasFlash();
        if (mounted) setHasFlash(flash);
      } catch (e) {
        if (mounted) {
          if (e.name === 'NotAllowedError' || e.message?.includes('Permission')) {
            setError('تمّ رفض إذن الكاميرا. اسمح للتطبيق بالوصول للكاميرا من إعدادات المتصفّح.');
          } else if (e.message?.includes('No QR scanner found') || e.message?.includes('camera')) {
            setError('لا توجد كاميرا متاحة على هذا الجهاز.');
          } else {
            setError('فشل تشغيل الكاميرا: ' + (e.message || 'خطأ غير معروف'));
          }
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current.destroy();
      }
    };
  }, [onResult]);

  async function toggleFlash() {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.toggleFlash();
      setFlashOn(scannerRef.current.isFlashOn());
    } catch {}
  }

  async function switchCamera(id) {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.setCamera(id);
      setCurrentCameraId(id);
    } catch {}
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="bg-stone-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📷</span>
          <div>
            <h2 className="text-sm font-display font-bold">مسح رمز QR</h2>
            <p className="text-[10px] text-stone-400">وجّه الكاميرا للستيكر</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white text-3xl leading-none px-2">×</button>
      </div>

      <div className="flex-1 relative bg-black overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bg-white rounded-xl p-5 max-w-sm text-center">
              <div className="text-3xl mb-2">📵</div>
              <p className="text-sm text-stone-700 mb-4">{error}</p>
              <button onClick={onClose}
                className="px-4 py-2 bg-brand-blue text-white rounded-lg text-xs">
                إغلاق
              </button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
        )}
      </div>

      {/* أدوات تحكّم سفليّة */}
      {!error && (
        <div className="bg-stone-900 text-white px-4 py-3 flex items-center justify-center gap-3">
          {hasFlash && (
            <button onClick={toggleFlash}
              className={`px-4 py-2 rounded-lg text-xs ${flashOn ? 'bg-amber-500 text-stone-900' : 'bg-stone-700'}`}>
              {flashOn ? '💡 مضاء' : '🔦 الفلاش'}
            </button>
          )}
          {cameras.length > 1 && (
            <select
              value={currentCameraId || ''}
              onChange={e => switchCamera(e.target.value)}
              className="bg-stone-700 text-white text-xs px-3 py-2 rounded-lg"
            >
              {cameras.map(c => (
                <option key={c.id} value={c.id}>{c.label || `كاميرا ${c.id.slice(0, 6)}`}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
