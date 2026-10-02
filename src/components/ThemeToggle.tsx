/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from '@phosphor-icons/react';
import { t } from '../i18n';

type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'nori-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) || 'system';
    } catch {
      return 'system';
    }
  });
  // Followed while the theme is 'system'
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const handler = () => setSystemTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Theme in use, worked out from state so the button and the page always agree
  const resolved = theme === 'system' ? systemTheme : theme;
  const isDark = resolved === 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  const label = isDark ? t('Cambiar a tema claro') : t('Cambiar a tema oscuro');

  // The icon shows the theme the button switches to: the sun in dark mode, the moon in light mode
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-8 h-8 rounded-lg bg-card border border-border shadow-card flex items-center justify-center text-foreground hover:bg-accent transition-all duration-300 ease-out cursor-pointer"
      data-tooltip={label}
      aria-label={label}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
