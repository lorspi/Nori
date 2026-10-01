/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Desktop } from '@phosphor-icons/react';

// Phones (any orientation) and small touch tablets: the editor needs room for the canvas,
// the Inspector and the timeline, plus a keyboard and a precise pointer
const SMALL_SCREEN_QUERY = '(max-width: 767px), (pointer: coarse) and (max-width: 1023px)';
const DISMISS_KEY = 'nori-desktop-only-dismissed';

const matchesSmallScreen = () => window.matchMedia(SMALL_SCREEN_QUERY).matches;

/**
 * Shows a "desktop only" screen instead of the editor on small screens. "Continuar de todos
 * modos" opens the editor anyway for the rest of the session.
 */
export function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  const [isSmall, setIsSmall] = useState(matchesSmallScreen);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const mq = window.matchMedia(SMALL_SCREEN_QUERY);
    const handler = () => setIsSmall(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!isSmall || dismissed) return <>{children}</>;

  const handleContinue = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground flex items-center justify-center px-6 py-10">
      <div className="max-w-sm w-full text-center space-y-5 animate-fade-in">
        <img src="/icon.svg" alt="Nori" className="w-16 h-16 mx-auto" />
        <div className="space-y-2">
          <h1 className="text-xl font-bold font-heading">Nori es para escritorio</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            El editor necesita una pantalla amplia para el lienzo, el Inspector y la línea del tiempo, además de
            teclado y ratón o trackpad. Ábrelo desde una computadora para crear tus animaciones.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-xl px-3 py-2.5">
          <Desktop className="w-4 h-4 text-bento-blue shrink-0" />
          <span>Disponible solo en computadoras de escritorio y portátiles</span>
        </div>
        <button
          onClick={handleContinue}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground cursor-pointer"
        >
          Continuar de todos modos
        </button>
      </div>
    </div>
  );
}
