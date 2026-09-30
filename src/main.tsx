import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import App from './App.tsx';
import { UIProvider } from './lib/ui.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Default every Phosphor icon to the duotone weight app-wide. Individual
        icons still control their size via Tailwind width/height classes. */}
    <IconContext.Provider value={{ weight: 'duotone' }}>
      <UIProvider>
        <App />
      </UIProvider>
    </IconContext.Provider>
  </StrictMode>,
);

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
