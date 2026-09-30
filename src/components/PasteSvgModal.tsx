import React, { useEffect, useRef, useState } from 'react';
import { ClipboardText, FileSvg, X } from '@phosphor-icons/react';
import { isSvgText } from '../utils/svgImporter';

interface PasteSvgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (svgText: string) => void;
}

export const PasteSvgModal: React.FC<PasteSvgModalProps> = ({ isOpen, onClose, onImport }) => {
  const [code, setCode] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCode('');
    // Focus so the user can paste right away (Ctrl+V)
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isValid = isSvgText(code);

  const handleImport = () => {
    if (!isValid) return;
    onImport(code.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] p-4 select-none animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-3xl overflow-hidden text-foreground animate-scale-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bento-blue/15 border border-bento-blue/30 flex items-center justify-center text-bento-blue">
              <ClipboardText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground font-heading">Importar SVG desde el portapapeles</h2>
              <span className="text-[11px] text-muted-foreground">
                Pega el código del SVG; se abrirá como un proyecto nuevo
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Cerrar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 min-h-0">
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleImport();
              }
            }}
            spellCheck={false}
            placeholder={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  …\n</svg>'}
            className="w-full h-[50vh] min-h-64 resize-none bg-secondary border border-border rounded-xl p-3 font-mono text-[11px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-bento-blue select-text"
          />
          {code.trim() && !isValid && (
            <p className="mt-2 text-[11px] text-bento-orange">El texto pegado no contiene un elemento &lt;svg&gt;.</p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-border bg-secondary/40 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">Ctrl + Enter para importar</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={!isValid}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-bento-blue hover:bg-bento-blue/90 text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileSvg className="w-3.5 h-3.5" />
              <span>Importar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
