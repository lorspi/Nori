import React from 'react';
import { Warning as AlertTriangle, FloppyDisk as Save, X } from '@phosphor-icons/react';
import { Project } from '../types/animation';

interface ConfirmSwitchProjectModalProps {
  isOpen: boolean;
  currentProject: Project;
  targetProject: Project | null;
  onConfirmWithoutSaving: () => void;
  onSaveAndConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmSwitchProjectModal: React.FC<ConfirmSwitchProjectModalProps> = ({
  isOpen,
  currentProject,
  targetProject,
  onConfirmWithoutSaving,
  onSaveAndConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] p-4 select-none animate-fade-in">
      <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-xl overflow-hidden text-foreground animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bento-orange-light border border-bento-orange/30 flex items-center justify-center text-bento-orange">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground font-heading">¿Abrir otro proyecto?</h2>
              <span className="text-[11px] text-muted-foreground">Advertencia de cambios no guardados</span>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs leading-relaxed text-foreground">
          <p>
            Los cambios realizados en el proyecto actual{' '}
            <span className="text-foreground font-semibold">"{currentProject.title}"</span> se
            perderán si abres otro proyecto sin guardar.
          </p>

          {targetProject && (
            <div className="bg-secondary border border-border rounded-xl p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proyecto actual:</span>
                <span className="text-foreground font-mono font-medium truncate max-w-[200px]">
                  {currentProject.title}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nuevo proyecto a abrir:</span>
                <span className="text-bento-blue font-mono font-medium truncate max-w-[200px]">
                  {targetProject.title}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-border bg-secondary/40 flex flex-col sm:flex-row gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer order-3 sm:order-1 text-center whitespace-nowrap"
          >
            Cancelar
          </button>

          <button
            onClick={onConfirmWithoutSaving}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer order-2 text-center whitespace-nowrap"
          >
            Continuar sin guardar
          </button>

          <button
            onClick={onSaveAndConfirm}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-bento-blue hover:bg-bento-blue/90 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer order-1 sm:order-3 text-center whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar y continuar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
