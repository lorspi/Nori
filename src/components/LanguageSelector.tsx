import React from 'react';
import { Dropdown } from './Dropdown';
import { LANGUAGES, Language, setLanguage, t, useLanguage } from '../i18n';

// Interface language (Spanish or English), next to the theme button
export default function LanguageSelector() {
  const language = useLanguage();
  const current = LANGUAGES.find((l) => l.id === language) ?? LANGUAGES[0];
  return (
    <Dropdown<Language>
      value={language}
      options={LANGUAGES.map((l) => ({ value: l.id, label: l.name }))}
      onChange={setLanguage}
      triggerLabel={<span className="font-semibold text-[11px]">{current.short}</span>}
      align="right"
      className="h-8 bg-card! border border-border shadow-card rounded-lg"
      menuClassName="w-32"
      optionClassName=""
      title={t('Idioma')}
      ariaLabel={t('Idioma')}
    />
  );
}
