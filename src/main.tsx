import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import App from './App.tsx';
import { UIProvider } from './lib/ui.tsx';
import { TooltipLayer } from './components/Tooltip.tsx';
import { DesktopOnlyGate } from './components/DesktopOnlyGate.tsx';
import { initWorkspaceStorage } from './utils/folderSync.ts';
import './index.css';

// With a linked local folder, its workspace is read before the interface starts
initWorkspaceStorage().finally(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Default every Phosphor icon to the duotone weight app-wide. Individual
        icons still control their size via Tailwind width/height classes. */}
    <IconContext.Provider value={{ weight: 'duotone' }}>
      <UIProvider>
        <DesktopOnlyGate>
          <App />
        </DesktopOnlyGate>
        <TooltipLayer />
      </UIProvider>
    </IconContext.Provider>
  </StrictMode>,
));

// Microsoft Clarity analytics. The ID and host come from a local, untracked
// .env file, so clones of this repo never report to the original project.
const clarityId = import.meta.env.VITE_CLARITY_ID;
const clarityHost = import.meta.env.VITE_CLARITY_HOST;
if (clarityId && clarityHost && location.hostname === clarityHost) {
  const w = window as unknown as { clarity?: { (...args: unknown[]): void; q?: unknown[][] } };
  w.clarity = w.clarity || function (...args: unknown[]) {
    (w.clarity!.q = w.clarity!.q || []).push(args);
  };
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${clarityId}`;
  document.head.appendChild(script);
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }).then((reg) => {
      console.log('Service worker registered.', reg);
    }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
