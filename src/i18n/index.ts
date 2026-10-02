import { useSyncExternalStore } from 'react';

/**
 * Interface language. Texts are written in Spanish in the code and wrapped in t(): the Spanish
 * text is the key, and English translations live in src/i18n/en/*.ts (one file per area of the
 * app, merged here). A text with no translation is shown in Spanish.
 *
 * The first time, the language comes from the browser: Spanish or English when it is one of
 * them, English otherwise. The choice made in the language menu is stored.
 */

export type Language = 'es' | 'en';

export const LANGUAGES: { id: Language; name: string; short: string }[] = [
  { id: 'es', name: 'Español', short: 'ES' },
  { id: 'en', name: 'English', short: 'EN' },
];

const LANGUAGE_KEY = 'nori-language';

const dictionaries = import.meta.glob<{ default: Record<string, string> }>('./en/*.ts', { eager: true });
const EN: Record<string, string> = Object.assign({}, ...Object.values(dictionaries).map((m) => m.default));

/** Language of the browser: the first of its preferred languages that Nori has, English otherwise */
export function detectBrowserLanguage(): Language {
  const preferred = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const tag of preferred) {
    const base = (tag || '').toLowerCase().split('-')[0];
    if (base === 'es' || base === 'en') return base;
  }
  return 'en';
}

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return stored === 'es' || stored === 'en' ? stored : null;
  } catch {
    return null;
  }
}

let current: Language = readStoredLanguage() ?? detectBrowserLanguage();
const listeners = new Set<() => void>();

if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLanguage = () => current;

export function setLanguage(language: Language) {
  if (language === current) return;
  current = language;
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {}
  document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Current language; the component renders again when it changes */
export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage, getLanguage);

/**
 * Text in the current language. Placeholders in braces are replaced by params:
 * t('{count} capas eliminadas', { count: 3 }). A Spanish text that needs two different
 * translations takes a context after "##" ('Inicio##tiempo'), which Spanish doesn't show.
 */
export function t(text: string, params?: Record<string, string | number>): string {
  const translated = current === 'es' ? text.split('##')[0] : (EN[text] ?? text.split('##')[0]);
  if (!params) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match
  );
}

/** Locale for numbers and dates in the current language */
export const getLocale = () => (current === 'es' ? 'es' : 'en');
