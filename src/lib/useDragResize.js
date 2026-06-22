import { useState, useRef, useEffect } from 'react';

// محرّك سحب/تكبير عامّ بالنِّسب المئويّة فوق حاوية محدّدة (containerRef).
// rect: { top, left, width, height } نِسب مئويّة. enabled: هل التفاعل مفعّل.
// onChange(rect): يُستدعى عند إفلات السحب/التكبير بالموضع/الحجم النهائي.
// مقبض التكبير في الزاوية السفليّة-اليسرى (الحافّة اليمنى مثبّتة) — متوافق مع FreeItemSquare.
export default function useDragResize({ rect, containerRef, enabled, onChange, minW = 6, maxW = 100, minH = 6, maxH = 100 }) {
  const [pos, setPos] = useState(rect);
  const [mode, setMode] = useState(null); // 'move' | 'resize' | null
  const stRef = useRef(null);
  const posRef = useRef(rect);

  useEffect(() => { posRef.current = pos; }, [pos]);

  // أعِد المزامنة من الخارج حين لا يوجد سحب نشط
  useEffect(() => {
    if (!mode) setPos(rect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect.top, rect.left, rect.width, rect.height, mode]);

  function begin(kind, clientX, clientY) {
    if (!enabled) return;
    const r = containerRef?.current?.getBoundingClientRect();
    if (!r) return;
    stRef.current = {
      r, startX: clientX, startY: clientY,
      startLeft: pos.left, startTop: pos.top, startW: pos.width, startH: pos.height
    };
    setMode(kind);
  }

  useEffect(() => {
    if (!mode) return;
    function apply(cx, cy) {
      const s = stRef.current;
      if (!s) return;
      const dxPct = ((cx - s.startX) / s.r.width) * 100;
      const dyPct = ((cy - s.startY) / s.r.height) * 100;
      if (mode === 'move') {
        const left = Math.max(0, Math.min(100 - s.startW, s.startLeft + dxPct));
        const top = Math.max(0, Math.min(100 - s.startH, s.startTop + dyPct));
        setPos(p => ({ ...p, left, top }));
      } else {
        const width = Math.max(minW, Math.min(maxW, s.startW - dxPct));
        const height = Math.max(minH, Math.min(maxH, s.startH + dyPct));
        const rightEdge = s.startLeft + s.startW;
        const left = Math.max(0, rightEdge - width);
        setPos(p => ({ ...p, width, height, left }));
      }
    }
    function onMM(e) { apply(e.clientX, e.clientY); }
    function onTM(e) { if (e.touches[0]) { e.preventDefault(); apply(e.touches[0].clientX, e.touches[0].clientY); } }
    function onUp() {
      const s = stRef.current;
      setMode(null);
      stRef.current = null;
      if (s) onChange?.(posRef.current);
    }
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTM, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTM);
      window.removeEventListener('touchend', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return { pos, mode, begin };
}
