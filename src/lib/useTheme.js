// إدارة الوضع الداكن — مع حفظ التفضيل في localStorage
import { useEffect, useState } from 'react';

const THEME_KEY = 'sraj.theme';

export function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    // لو ما اختار، اتبع تفضيل النظام
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {}
  return 'light';
}

export function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  function toggle() {
    setThemeState(t => t === 'dark' ? 'light' : 'dark');
  }

  return { theme, toggle, setTheme: setThemeState };
}
