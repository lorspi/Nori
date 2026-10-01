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
  FolderOpen,
  FileSvg,
  ClipboardText,
  FloppyDisk as Save,
  FilePlus,
  CaretDown as ChevronDown,
  Checkerboard as Grid,
  ArrowUUpLeft as Undo2,
  ArrowUUpRight as Redo2,
  Info,
  FigmaLogo,
} from '@phosphor-icons/react';
import { Project } from '../types/animation';
import { ToastType } from '../lib/ui';
import ThemeToggle from './ThemeToggle';
import { Dropdown } from './Dropdown';
import { isLottieJson, convertLottieToProject } from '../utils/lottieImporter';

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
  onNewProject: () => void;
  onSaveJson: () => void;
  onLoadJson: (project: Project, message?: string) => void;
  onImportSvg: (svgText: string, fileName: string) => void;
  onOpenPasteSvg: () => void;
  onOpenFigmaImport: () => void;
  onOpenExample: () => void;
  onRenameProject: (title: string) => void;
  onAddLayer: (type: ShapeType) => void;
  onShowToast?: (message: string, type?: ToastType) => void;
  onOpenAbout: () => void;
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
  onNewProject,
  onSaveJson,
  onLoadJson,
  onImportSvg,
  onOpenPasteSvg,
  onOpenFigmaImport,
  onOpenExample,
  onRenameProject,
  onAddLayer,
  onShowToast,
  onOpenAbout,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const openMenuRef = useRef<HTMLDivElement>(null);
  const [showOpenMenu, setShowOpenMenu] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);

  // Keep the editable title in sync when another project is opened
  useEffect(() => setTitleDraft(project.title), [project.title]);

  // Close the Open menu when clicking outside of it
  useEffect(() => {
    if (!showOpenMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (openMenuRef.current && !openMenuRef.current.contains(e.target as Node)) setShowOpenMenu(false);
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [showOpenMenu]);

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(project.title);
    } else if (next !== project.title) {
      onRenameProject(next);
    }
  };
  const [showShapesDropdown, setShowShapesDropdown] = React.useState(false);

  const notify = (msg: string, type: ToastType = 'error') => {
    if (onShowToast) onShowToast(msg, type);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // 1. Check if it is a Lottie JSON animation
        if (isLottieJson(parsed)) {
          const converted = convertLottieToProject(parsed);
          onLoadJson(
            converted,
            `¡Animación Lottie importada con éxito! (${converted.layers.length} capas, ${converted.duration}s)`
          );
          return;
        }

        // 2. Check if it is a Nori project JSON
        if (parsed.layers && Array.isArray(parsed.layers) && (parsed.width || parsed.w)) {
          const normalized: Project = {
            id: parsed.id || `project_${Date.now()}`,
            title: parsed.title || parsed.nm || file.name.replace(/\.json$/i, ''),
            width: parsed.width || parsed.w || 960,
            height: parsed.height || parsed.h || 540,
            fps: parsed.fps || parsed.fr || 30,
            duration: parsed.duration || 3,
            backgroundColor: parsed.backgroundColor || '#121316',
            layers: parsed.layers,
          };
          onLoadJson(normalized, `¡Proyecto cargado con éxito! (${normalized.title})`);
          return;
        }

        // 3. Fallback generic JSON parser
        if (Array.isArray(parsed) || typeof parsed === 'object') {
          notify('El archivo JSON no tiene un formato compatible de Lottie ni de Nori.');
        }
      } catch (err: any) {
        console.error('JSON load error:', err);
        notify(`Error al procesar el archivo JSON: ${err?.message || 'Formato no válido'}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSvgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => onImportSvg(event.target?.result as string, file.name);
    reader.readAsText(file);
    e.target.value = '';
  };

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

        {/* File actions (icons only): new project, open menu and save */}
        <div className="flex items-center bg-secondary rounded-lg p-0.5 border border-border ml-1">
          <button
            onClick={onNewProject}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            data-tooltip="Nuevo proyecto"
            aria-label="Nuevo proyecto"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>

          {/* Open: Lottie / Nori JSON, SVG from a file or SVG pasted from the clipboard */}
          <div className="relative" ref={openMenuRef}>
            <button
              onClick={() => setShowOpenMenu((prev) => !prev)}
              className={`p-1.5 rounded-md transition-colors flex items-center gap-0.5 ${
                showOpenMenu
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
              data-tooltip="Abrir"
              aria-label="Abrir"
              aria-haspopup="menu"
              aria-expanded={showOpenMenu}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {showOpenMenu && (
              <div
                className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-card-hover py-1 w-52 z-50 text-foreground"
                onClick={() => setShowOpenMenu(false)}
                role="menu"
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-accent text-left"
                  data-tooltip="Abrir animación JSON de Lottie o proyecto Nori"
                  role="menuitem"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-bento-blue" />
                  <span>Abrir JSON / Lottie</span>
                </button>
                <button
                  onClick={() => svgInputRef.current?.click()}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-accent text-left"
                  data-tooltip="Abrir un archivo SVG como proyecto (si es animado, sus animaciones pasan a la línea del tiempo)"
                  role="menuitem"
                >
                  <FileSvg className="w-3.5 h-3.5 text-bento-blue" />
                  <span>Importar SVG</span>
                </button>
                <button
                  onClick={onOpenPasteSvg}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-accent text-left"
                  data-tooltip="Pegar el código de un SVG desde el portapapeles"
                  role="menuitem"
                >
                  <ClipboardText className="w-3.5 h-3.5 text-bento-blue" />
                  <span>Código SVG</span>
                </button>
                <button
                  onClick={onOpenFigmaImport}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-accent text-left"
                  data-tooltip="Crear un proyecto a partir de un frame copiado en Figma"
                  role="menuitem"
                >
                  <FigmaLogo className="w-3.5 h-3.5 text-bento-blue" />
                  <span>Importar desde Figma</span>
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  onClick={onOpenExample}
                  className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-accent text-left"
                  data-tooltip="Abrir la animación del logo de Nori que se muestra en la primera visita"
                  role="menuitem"
                >
                  <img src="/icon.svg" alt="" className="w-3.5 h-3.5" />
                  <span>Proyecto de ejemplo</span>
                </button>
              </div>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,.nori.json"
            className="hidden"
          />
          <input
            type="file"
            ref={svgInputRef}
            onChange={handleSvgFileChange}
            accept=".svg,image/svg+xml"
            className="hidden"
          />

          <button
            onClick={onSaveJson}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            data-tooltip="Guardar proyecto como JSON"
            data-shortcut="Ctrl+S"
            aria-label="Guardar"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Zone 2: Project name, renamed in place (click to edit, Enter to save, Esc to cancel) */}
      <div className="flex items-center min-w-0">
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
          className="max-w-[16rem] bg-transparent border-0 text-center text-foreground font-semibold text-sm tracking-tight font-heading hover:bg-accent focus:bg-card px-2 py-1 rounded-xl focus:outline-none transition-colors focus:ring-1 focus:ring-ring truncate"
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

        {/* About Nori */}
        <button
          onClick={onOpenAbout}
          className="w-8 h-8 rounded-lg bg-card border border-border shadow-card flex items-center justify-center text-foreground hover:bg-accent transition-all duration-300 ease-out cursor-pointer"
          data-tooltip="Acerca de Nori"
          aria-label="Acerca de Nori"
        >
          <Info className="w-4 h-4" />
        </button>

        <ThemeToggle />

        {/* Main Export CTA Button */}
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-bento-blue hover:bg-bento-blue/90 active:bg-bento-blue/80 text-white font-bold rounded-lg shadow-card h-8 transition-all duration-300 ease-out whitespace-nowrap cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar</span>
        </button>
      </div>
    </header>
  );
};
