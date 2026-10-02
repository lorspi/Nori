import React, { useEffect, useRef, useState } from 'react';
import {
  Cursor as MousePointer,
  Hand,
  Square,
  Circle,
  Star,
  Triangle,
  Hexagon,
  Download,
  Video,
  CaretDown as ChevronDown,
  Checkerboard as Grid,
  ArrowUUpLeft as Undo2,
  ArrowUUpRight as Redo2,
  Path as PathIcon,
  SelectionSlash,
  UniteSquare,
} from '@phosphor-icons/react';
import { BooleanOperation, Project } from '../types/animation';
import { BOOLEAN_LABELS, BOOLEAN_OPERATIONS } from '../utils/booleanGroups';
import { BOOLEAN_ICONS } from './booleanIcons';
import ThemeToggle from './ThemeToggle';
import { Dropdown } from './Dropdown';

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 4.38];

export type ToolMode = 'select' | 'hand';

export type ShapeType = 'rect' | 'ellipse' | 'triangle' | 'polygon' | 'star';

const SHAPE_MENU: { type: ShapeType; label: string; Icon: React.ElementType }[] = [
  { type: 'rect', label: 'Rectángulo', Icon: Square },
  { type: 'ellipse', label: 'Elipse', Icon: Circle },
  { type: 'triangle', label: 'Triángulo', Icon: Triangle },
  { type: 'polygon', label: 'Polígono', Icon: Hexagon },
  { type: 'star', label: 'Estrella', Icon: Star },
];

interface TopBarProps {
  project: Project;
  activeTool: ToolMode;
  setActiveTool: (tool: ToolMode) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  showCheckerboard: boolean;
  setShowCheckerboard: (val: boolean | ((prev: boolean) => boolean)) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenExport: () => void;
  onDownloadJson: () => void;
  onGoHome: () => void;
  /** Folder that holds the project, shown in the breadcrumb */
  folder: { id: string; name: string } | null;
  onOpenFolder: (id: string) => void;
  onRenameProject: (title: string) => void;
  onAddLayer: (type: ShapeType) => void;
  // Boolean operations on the selection: combine shapes or change the selected group's operation
  booleanState: { canCombine: boolean; activeOp: BooleanOperation | null; canFlatten: boolean };
  onBooleanOperation: (op: BooleanOperation) => void;
  onFlattenBoolean: () => void;
  onUngroupBoolean: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  project,
  activeTool,
  setActiveTool,
  zoom,
  setZoom,
  showCheckerboard,
  setShowCheckerboard,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenExport,
  onDownloadJson,
  onGoHome,
  folder,
  onOpenFolder,
  onRenameProject,
  onAddLayer,
  booleanState,
  onBooleanOperation,
  onFlattenBoolean,
  onUngroupBoolean,
}) => {
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [showBooleanMenu, setShowBooleanMenu] = useState(false);
  const booleanMenuRef = useRef<HTMLDivElement>(null);
  const booleanEnabled = booleanState.canCombine || booleanState.canFlatten;
  const ActiveBooleanIcon = booleanState.activeOp ? BOOLEAN_ICONS[booleanState.activeOp] : UniteSquare;

  // The boolean menu closes on a click outside it or when nothing can be combined anymore
  useEffect(() => {
    if (!showBooleanMenu) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (!booleanMenuRef.current?.contains(e.target as Node)) setShowBooleanMenu(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [showBooleanMenu]);
  useEffect(() => {
    if (!booleanEnabled) setShowBooleanMenu(false);
  }, [booleanEnabled]);

  // Keep the editable title in sync when another project is opened
  useEffect(() => setTitleDraft(project.title), [project.title]);

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(project.title);
    } else if (next !== project.title) {
      onRenameProject(next);
    }
  };
  const [showShapesDropdown, setShowShapesDropdown] = React.useState(false);

  return (
    <header className="h-12 shrink-0 border-b border-border bg-card px-3 flex items-center justify-between text-xs select-none z-30">
      {/* Zone 1: Tools, Undo/Redo & Navigation */}
      <div className="flex items-center gap-1.5">
        {/* Logo / App Icon */}
        <div className="flex items-center gap-2 mr-2 pr-2.5 border-r border-border">
          <img src="/icon.svg" alt="Nori" className="w-6 h-6 shrink-0" />
          <span className="text-sm font-bold text-foreground font-heading hidden sm:inline">
            Nori
          </span>
        </div>

        {/* Undo / Redo controls */}
        <div className="flex items-center bg-secondary rounded-lg p-0.5 border border-border mr-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            data-tooltip="Deshacer"
            data-shortcut="Ctrl+Z"
            className={`p-1.5 rounded-md transition-colors ${
              canUndo
                ? 'text-foreground hover:bg-accent'
                : 'text-muted-foreground/50 opacity-40 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            data-tooltip="Rehacer"
            data-shortcut="Ctrl+Y / Ctrl+Shift+Z"
            className={`p-1.5 rounded-md transition-colors ${
              canRedo
                ? 'text-foreground hover:bg-accent'
                : 'text-muted-foreground/50 opacity-40 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tool selector */}
        <div className="flex items-center bg-secondary rounded-lg p-0.5 border border-border">
          <button
            onClick={() => setActiveTool('select')}
            data-tooltip="Seleccionar"
            data-shortcut="V"
            className={`p-1.5 rounded-md transition-colors ${
              activeTool === 'select'
                ? 'bg-bento-blue text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setActiveTool('hand')}
            data-tooltip="Mano: desplazar el lienzo (o mantén Espacio)"
            data-shortcut="H"
            className={`p-1.5 rounded-md transition-colors ${
              activeTool === 'hand'
                ? 'bg-bento-blue text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
          </button>
          {/* Shape tools dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowShapesDropdown(!showShapesDropdown)}
              data-tooltip="Añadir forma"
              className={`p-1.5 rounded-md transition-colors flex items-center gap-0.5 ${
                showShapesDropdown
                  ? 'bg-bento-blue text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {showShapesDropdown && (
              <div
                className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-card-hover py-1 w-40 z-50 text-foreground"
                onClick={() => setShowShapesDropdown(false)}
              >
                {SHAPE_MENU.map(({ type, label, Icon }) => (
                  <button
                    key={type}
                    onClick={() => onAddLayer(type)}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-accent text-left"
                  >
                    <Icon className="w-3.5 h-3.5 text-bento-blue" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Boolean operations: combine the selected shapes, or change the selected group */}
        <div ref={booleanMenuRef} className="relative">
          <button
            onClick={() => booleanEnabled && setShowBooleanMenu(!showBooleanMenu)}
            disabled={!booleanEnabled}
            data-tooltip={
              booleanEnabled
                ? 'Operaciones booleanas'
                : 'Operaciones booleanas: selecciona dos o más formas (Shift + clic) o un grupo booleano'
            }
            className={`p-1.5 rounded-lg border flex items-center gap-0.5 transition-colors ${
              showBooleanMenu
                ? 'bg-bento-blue text-white border-bento-blue'
                : booleanEnabled
                  ? 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                  : 'bg-secondary border-border text-muted-foreground/50 opacity-50 cursor-not-allowed'
            }`}
          >
            <ActiveBooleanIcon className="w-3.5 h-3.5" />
            <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          </button>

          {showBooleanMenu && (
            <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-card-hover py-1 w-64 z-50 text-foreground">
              {BOOLEAN_OPERATIONS.map((op) => {
                const Icon = BOOLEAN_ICONS[op];
                const active = booleanState.activeOp === op;
                return (
                  <button
                    key={op}
                    disabled={!booleanState.canCombine}
                    onClick={() => {
                      onBooleanOperation(op);
                      setShowBooleanMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent ${
                      active ? 'text-bento-blue' : ''
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-bento-blue" weight={active ? 'fill' : 'regular'} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium">{BOOLEAN_LABELS[op].action}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">{BOOLEAN_LABELS[op].description}</span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{BOOLEAN_LABELS[op].shortcut}</span>
                  </button>
                );
              })}
              <div className="my-1 border-t border-border" />
              <button
                disabled={!booleanState.canFlatten}
                onClick={() => {
                  onFlattenBoolean();
                  setShowBooleanMenu(false);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <PathIcon className="w-4 h-4 shrink-0 text-bento-blue" />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">Aplanar</span>
                  <span className="block text-[10px] text-muted-foreground truncate">Convierte el grupo en un trazado editable</span>
                </span>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">Ctrl+E</span>
              </button>
              <button
                disabled={!booleanState.canFlatten}
                onClick={() => {
                  onUngroupBoolean();
                  setShowBooleanMenu(false);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <SelectionSlash className="w-4 h-4 shrink-0 text-bento-blue" />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">Desagrupar</span>
                  <span className="block text-[10px] text-muted-foreground truncate">Saca las formas del grupo y lo elimina</span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Zone 2: Breadcrumb back to Inicio and the project name, renamed in place
          (click to edit, Enter to save, Esc to cancel) */}
      <div className="flex items-center min-w-0 text-sm font-heading">
        <button
          onClick={onGoHome}
          className="px-1.5 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent font-semibold transition-colors cursor-pointer whitespace-nowrap"
          data-tooltip="Volver a los proyectos guardados"
        >
          Inicio
        </button>
        <span className="text-muted-foreground/60 px-0.5 select-none" aria-hidden="true">/</span>
        {folder && (
          <>
            <button
              onClick={() => onOpenFolder(folder.id)}
              className="px-1.5 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent font-semibold transition-colors cursor-pointer whitespace-nowrap max-w-48 truncate"
              data-tooltip="Ir a la carpeta del proyecto"
            >
              {folder.name}
            </button>
            <span className="text-muted-foreground/60 px-0.5 select-none" aria-hidden="true">/</span>
          </>
        )}
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              setTitleDraft(project.title);
              // Blur after the reset so the original title is kept
              requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
            }
          }}
          size={Math.max(8, titleDraft.length + 1)}
          maxLength={80}
          spellCheck={false}
          data-tooltip="Clic para renombrar el proyecto"
          aria-label="Nombre del proyecto"
          className="max-w-[16rem] bg-transparent border-0 text-foreground font-semibold text-sm tracking-tight font-heading hover:bg-accent focus:bg-card px-2 py-1 rounded-xl focus:outline-none transition-colors focus:ring-1 focus:ring-ring truncate"
        />
      </div>

      {/* Zone 3: Zoom, Transparency Toggle & Export */}
      <div className="flex items-center gap-2">
        {/* Checkerboard transparency preview toggle */}
        <button
          onClick={() => setShowCheckerboard((prev) => !prev)}
          className={`flex items-center gap-1 px-2 h-8 rounded-lg border text-[11px] font-mono transition-colors cursor-pointer ${
            showCheckerboard
              ? 'bg-bento-blue/15 border-bento-blue/40 text-bento-blue'
              : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
          }`}
          data-tooltip="Alternar fondo transparente con patrón ajedrez"
        >
          <Grid className="w-3 h-3" />
          <span className="hidden sm:inline">Transparencia</span>
        </button>

        {/* Zoom selector */}
        <Dropdown
          value={zoom}
          options={ZOOM_LEVELS.map((z) => ({ value: z, label: `${Math.round(z * 100)}%` }))}
          onChange={setZoom}
          isSelected={(z, current) => Math.abs(current - z) < 0.05}
          triggerLabel={<span>{Math.round(zoom * 100)}%</span>}
          className="font-mono"
          title="Zoom"
        />

        <ThemeToggle />

        {/* Download the project as a Nori JSON file */}
        <button
          onClick={onDownloadJson}
          className="w-8 h-8 rounded-lg bg-card border border-border shadow-card flex items-center justify-center text-foreground hover:bg-accent transition-all duration-300 ease-out cursor-pointer"
          data-tooltip="Descargar proyecto (JSON)"
          data-shortcut="Ctrl+S"
          aria-label="Descargar proyecto"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Main Export CTA Button */}
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-bento-blue hover:bg-bento-blue/90 active:bg-bento-blue/80 text-white font-bold rounded-lg shadow-card h-8 transition-all duration-300 ease-out whitespace-nowrap cursor-pointer"
        >
          <Video className="w-3.5 h-3.5" />
          <span>Exportar</span>
        </button>
      </div>
    </header>
  );
};
