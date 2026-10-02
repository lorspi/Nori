import React, { useEffect, useRef, useState } from 'react';
import { ClipboardText, CircleNotch, FigmaLogo, X } from '@phosphor-icons/react';
import { ClipboardContent, classifyClipboardEvent, readClipboard } from '../utils/clipboard';
import { getLanguage, t } from '../i18n';

interface FigmaImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (svgText: string) => void;
}

// Translated text whose placeholders are replaced by markup: {button} → parts.button
function fill(text: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return text.split(/(\{\w+\})/g).map((piece, i) => {
    const match = piece.match(/^\{(\w+)\}$/);
    return <React.Fragment key={i}>{match && match[1] in parts ? parts[match[1]] : piece}</React.Fragment>;
  });
}

// Spanish keys, translated when shown
const MESSAGES = {
  figma:
    'Lo que hay en el portapapeles es una copia normal de Figma (Ctrl + C), que usa un formato propio que Nori no puede leer. Vuelve a copiar el frame con "Copiar como SVG".',
  empty: 'El portapapeles no contiene un SVG. Copia el frame en Figma con "Copiar como SVG" y vuelve a intentarlo.',
  blocked: 'El navegador no dejó leer el portapapeles. Pulsa Ctrl + V en esta ventana para pegar el frame.',
};

export const FigmaImportModal: React.FC<FigmaImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const handleContent = (content: ClipboardContent) => {
    if (content?.type === 'svg') {
      onImport(content.svg);
      onClose();
    } else {
      setMessage(content?.type === 'figma' ? MESSAGES.figma : MESSAGES.empty);
    }
  };
  // The window listeners always call the latest handler
  const handleContentRef = useRef(handleContent);
  handleContentRef.current = handleContent;

  useEffect(() => {
    if (!isOpen) return;
    setMessage(null);
    setIsReading(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Ctrl + V works in every browser, without clipboard permissions
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleContentRef.current(classifyClipboardEvent(e));
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('paste', handlePaste, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('paste', handlePaste, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleImportClick = async () => {
    setIsReading(true);
    const probe = await readClipboard();
    setIsReading(false);
    if (probe.status === 'unknown') {
      setMessage(MESSAGES.blocked);
      return;
    }
    handleContent(probe.content);
  };

  const steps: React.ReactNode[] = [
    fill(t('En Figma, selecciona el {frame} (artboard) que quieres animar.'), {
      frame: <strong className="text-foreground">{t('frame')}</strong>,
    }),
    <>
      {fill(t('Haz clic derecho sobre él y elige {command}'), {
        command: <strong className="text-foreground">{t('Copiar/Pegar como › Copiar como SVG')}</strong>,
      })}
      {/* Figma's English menu names, for those using it in English (redundant when Nori is in English) */}
      {getLanguage() === 'es' && (
        <>
          {' '}
          <span className="text-muted-foreground/80">(Copy/Paste as › Copy as SVG)</span>
        </>
      )}
      .
    </>,
    fill(t('Vuelve aquí y pulsa {button} o {keys}.'), {
      button: <strong className="text-foreground">{t('Importar')}</strong>,
      keys: (
        <>
          <kbd className="px-1 py-0.5 rounded border border-border bg-secondary font-mono text-[10px]">Ctrl</kbd>{' '}
          <kbd className="px-1 py-0.5 rounded border border-border bg-secondary font-mono text-[10px]">V</kbd>
        </>
      ),
    }),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] p-4 select-none animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-lg overflow-hidden text-foreground animate-scale-in flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bento-blue/15 border border-bento-blue/30 flex items-center justify-center text-bento-blue">
              <FigmaLogo className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground font-heading">{t('Importar desde Figma')}</h2>
              <span className="text-[11px] text-muted-foreground">{t('Crea un proyecto nuevo a partir de un frame de Figma')}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            data-tooltip={t('Cerrar')}
            data-shortcut="Esc"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="p-5 space-y-4 text-xs text-muted-foreground">
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-5 h-5 shrink-0 rounded-full bg-bento-blue text-white text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="leading-relaxed pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] leading-relaxed border-t border-border pt-3">
            {t('El lienzo toma el tamaño del frame y su color de fondo, y cada forma pasa a ser una capa. Los textos llegan convertidos en trazados, los degradados se aproximan con su primer color y las imágenes se omiten.')}
          </p>
          {message && (
            <p className="text-[11px] leading-relaxed text-bento-orange" role="alert">
              {t(message)}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-border bg-secondary/40 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            {t('Cancelar')}
          </button>
          <button
            onClick={handleImportClick}
            disabled={isReading}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-bento-blue hover:bg-bento-blue/90 text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {isReading ? <CircleNotch className="w-3.5 h-3.5 animate-spin" /> : <ClipboardText className="w-3.5 h-3.5" />}
            <span>{t('Importar')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
