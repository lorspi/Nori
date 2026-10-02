/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useVersion, useUpdateCheck } from '../hooks/useVersion';
import {
  Info,
  GithubLogo as Github,
  Coffee,
  Scales as Scale,
  Globe,
  Heart,
  Code as Code2,
  Download,
  ArrowSquareOut as ExternalLink,
  Newspaper,
} from '@phosphor-icons/react';
import changelog from '../../CHANGELOG.md?raw';
import { t } from '../i18n';

// Simple markdown renderer for changelog (handles headers, lists, bold)
function ChangelogRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-sm font-bold text-foreground mt-6 mb-2 pb-1 border-b border-border">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-xs font-bold text-bento-blue mt-3 mb-1 uppercase tracking-wider">{line.slice(4)}</h3>);
    } else if (line.startsWith('- **')) {
      const match = line.match(/^- \*\*(.+?)\*\*\s*(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="mt-2 mb-0.5">
            <span className="text-xs font-bold text-foreground">{match[1]}</span>
            {match[2] && <span className="text-xs text-muted-foreground"> {match[2]}</span>}
          </div>
        );
      } else {
        elements.push(<p key={i} className="text-xs text-muted-foreground ml-2">{line.slice(2)}</p>);
      }
    } else if (line.startsWith('  ') && line.trim()) {
      elements.push(<p key={i} className="text-xs text-muted-foreground ml-4 leading-relaxed">{line.trim()}</p>);
    } else if (line.trim() === '') {
      // skip blank lines
    } else {
      elements.push(<p key={i} className="text-xs text-muted-foreground">{line}</p>);
    }
  });

  return <div className="space-y-0">{elements}</div>;
}

export default function AboutNori() {
  const [activeTab, setActiveTab] = useState<'about' | 'changelog'>('about');
  const version = useVersion();
  const { updateAvailable, remoteVersion } = useUpdateCheck();

  const techStack = [
    'React 19',
    'TypeScript',
    'Vite',
    'Tailwind CSS',
    'Phosphor Icons',
    'Canvas 2D',
    'gifenc',
    'fflate',
    'paper.js',
  ];

  const tabs = [
    { id: 'about' as const, label: t('Acerca de'), icon: Info },
    { id: 'changelog' as const, label: t('Changelog'), icon: Newspaper },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background text-foreground select-text animate-fade-in">
      <div className="flex-1 overflow-auto p-4 sm:p-6 font-body">
        <div className="max-w-2xl mx-auto">

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 mb-6 bg-secondary rounded-xl p-1 border border-border">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Acerca de Tab */}
          {activeTab === 'about' && (
            <div className="space-y-6 sm:space-y-8">
              {/* Header */}
              <div className="text-center space-y-3 pb-4">
                <img src="/icon.svg" alt="Nori" className="w-16 h-16 mx-auto" />
                <div>
                  <h1 className="text-2xl font-bold text-foreground font-heading">Nori</h1>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{t('versión {version}', { version })}</p>
                </div>
                {updateAvailable && (
                  <a
                    href="https://github.com/lorspi/Nori/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-bento-blue-light text-bento-blue border border-bento-blue/30 px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('Nueva versión disponible (v{version})', { version: remoteVersion ?? '' })}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {t('El lugar donde las ideas cobran movimiento. Animación vectorial y motion design en el navegador, sin servidores externos ni suscripciones.')}
                </p>
              </div>

              {/* Filosofía */}
              <section className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-card">
                <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                  <Heart className="w-4 h-4 text-bento-orange" />
                  {t('Filosofía')}
                </h2>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-bento-blue mt-0.5">•</span>
                    {t('Las animaciones y los archivos pertenecen a quienes los crean.')}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-bento-blue mt-0.5">•</span>
                    {t('No depende de servidores externos ni de suscripciones para existir.')}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-bento-blue mt-0.5">•</span>
                    {t('La simplicidad es una característica, no una limitación.')}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-bento-blue mt-0.5">•</span>
                    {t('Los proyectos se guardan en formatos abiertos y legibles (JSON, Lottie, SVG).')}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-bento-blue mt-0.5">•</span>
                    {t('Cada nueva funcionalidad debe justificar su existencia.')}
                  </li>
                </ul>
              </section>

              {/* Info General */}
              <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
                <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                  <Info className="w-4 h-4 text-bento-blue" />
                  {t('Información')}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-secondary rounded-xl p-3 border border-border">
                    <span className="text-muted-foreground block mb-0.5 font-semibold">{t('Autor')}</span>
                    <span className="text-foreground font-bold">Juan Pablo Pérez</span>
                  </div>
                  <div className="bg-secondary rounded-xl p-3 border border-border">
                    <span className="text-muted-foreground block mb-0.5 font-semibold">{t('Licencia')}</span>
                    <span className="text-foreground font-bold">Apache 2.0</span>
                  </div>
                  <div className="bg-secondary rounded-xl p-3 border border-border">
                    <span className="text-muted-foreground block mb-0.5 font-semibold">{t('Versión')}</span>
                    <span className="text-foreground font-mono font-bold">{version}</span>
                  </div>
                  <div className="bg-secondary rounded-xl p-3 border border-border">
                    <span className="text-muted-foreground block mb-0.5 font-semibold">{t('Plataforma')}</span>
                    <span className="text-foreground font-bold">{t('Web (Offline-first)')}</span>
                  </div>
                </div>
              </section>

              {/* Tech Stack */}
              <section className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-card">
                <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-bento-blue" />
                  {t('Stack Tecnológico')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {techStack.map(tech => (
                    <span
                      key={tech}
                      className="text-[11px] font-semibold bg-secondary border border-border text-muted-foreground px-2.5 py-1 rounded-lg"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </section>

              {/* Links */}
              <section className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-card">
                <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                  <Globe className="w-4 h-4 text-bento-green" />
                  {t('Enlaces')}
                </h2>

                <div className="flex flex-col gap-2">
                  <a
                    href="https://github.com/lorspi/Nori"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 bg-secondary hover:bg-accent border border-border rounded-xl px-4 py-2.5 text-xs font-semibold text-foreground transition-colors"
                  >
                    <Github className="w-4 h-4 text-muted-foreground" />
                    {t('Repositorio en GitHub')}
                  </a>

                  <a
                    href="https://ko-fi.com/lorspi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 bg-secondary hover:bg-accent border border-border rounded-xl px-4 py-2.5 text-xs font-semibold text-foreground transition-colors"
                  >
                    <Coffee className="w-4 h-4 text-bento-orange" />
                    {t('Apoya al creador en Ko-fi')}
                  </a>
                </div>
              </section>

              {/* License Notice */}
              <section className="bg-card border border-border rounded-2xl p-5 space-y-3 shadow-card">
                <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                  <Scale className="w-4 h-4 text-muted-foreground" />
                  {t('Licencia')}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('Nori se distribuye bajo la Licencia Apache 2.0. Puedes usar, modificar y distribuir este software libremente siempre que se mantenga la atribución original y la nota de licencia. Esta licencia no proporciona garantía alguna sobre el software.')}
                </p>
              </section>

              {/* Footer */}
              <p className="text-center text-[10px] text-muted-foreground pb-4">
                {t('Hecho con cariño por lorspi · {year}', { year: new Date().getFullYear() })}
              </p>
            </div>
          )}

          {/* Changelog Tab */}
          {activeTab === 'changelog' && (
            <div className="space-y-4 pb-8">
              <div className="bg-card border border-border rounded-2xl p-5 shadow-card">
                <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2 mb-4">
                  <Newspaper className="w-4 h-4 text-bento-blue" />
                  {t('Historial de Cambios')}
                </h2>
                <ChangelogRenderer content={changelog} />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
