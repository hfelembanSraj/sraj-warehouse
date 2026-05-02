// hook عامّ لإدارة اختصارات لوحة المفاتيح
import { useEffect } from 'react';

// يُسجّل دالّة تُستدعى عند ضغط Esc
export function useEscapeKey(handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        handler(e);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, enabled]);
}

// hook لاختصارات عامّة في الموقع: / للبحث، Ctrl+K للقفز السريع
export function useGlobalShortcuts({ onFocusSearch, onOpenScanner }) {
  useEffect(() => {
    function onKey(e) {
      // تجاهل إن كان المستخدم يكتب في حقل
      const tag = e.target?.tagName?.toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

      // / لتركيز شريط البحث
      if (e.key === '/' && !inField && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onFocusSearch?.();
      }
      // Ctrl+K أو Cmd+K → فتح ماسح QR (أسرع وصول للإجراء)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenScanner?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFocusSearch, onOpenScanner]);
}
