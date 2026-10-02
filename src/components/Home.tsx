/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SquaresFour,
  TrashSimple,
  Trash,
  Info,
  HardDrives,
  Warning,
  FilePlus,
  FolderOpen,
  FileSvg,
  ClipboardText,
  FigmaLogo,
  DotsThree,
  ArrowCounterClockwise,
  DownloadSimple,
  X,
} from '@phosphor-icons/react';
import { Project } from '../types/animation';
import { useUI } from '../lib/ui';
import { useUpdateCheck } from '../hooks/useVersion';
import {
  ProjectMeta,
  listProjects,
  listTrashedProjects,
  loadProject,
  renameProject,
  duplicateProject,
  trashProject,
  restoreProject,
  deleteProjectForever,
  emptyTrash,
  getStorageUsage,
} from '../utils/projectStorage';
import {
  ImportedProject,
  createBlankProject,
  downloadProjectJson,
  importFigmaProject,
  importProjectFile,
  importSvgProject,
} from '../utils/projectFiles';
import { NORI_INTRO_PROJECT } from '../utils/noriIntro';
import ThemeToggle from './ThemeToggle';
import AboutNori from './AboutNori';
import { ProjectThumbnail } from './ProjectThumbnail';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { ExportModal } from './ExportModal';
import { PasteSvgModal } from './PasteSvgModal';
import { FigmaImportModal } from './FigmaImportModal';

type Section = 'projects' | 'trash' | 'about';

// Space browsers usually give each site in localStorage (in characters)
const STORAGE_QUOTA = 5 * 1024 * 1024;

const STORAGE_WARNING_TITLE = 'Tus proyectos solo existen en este navegador';
const STORAGE_WARNING_TEXT =
  'Nori los guarda en el almacenamiento local (localStorage) de este navegador, en este equipo. No se sincronizan con otros dispositivos ni navegadores, y se pierden si borras los datos del sitio o usas una ventana privada. Descarga una copia en JSON de los que quieras conservar.';
// Remembers that the storage warning was closed in this browser
const WARNING_DISMISSED_KEY = 'nori-storage-warning-dismissed';

function readWarningDismissed(): boolean {
  try {
    return localStorage.getItem(WARNING_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

const NoriLogo = ({ className }: { className?: string }) => <img src="/icon.svg" alt="" className={className} />;

function formatRelative(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours} h`;
  if (days < 7) return `hace ${days} d`;
  return new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSize(chars: number): string {
  return chars >= 1024 * 1024 ? `${(chars / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(chars / 1024))} KB`;
}

interface HomeProps {
  onOpenProject: (id: string) => void;
  /** Stores a new project and opens it */
  onCreateProject: (project: Project, message: string, autoplay?: boolean) => void;
}

export default function Home({ onOpenProject, onCreateProject }: HomeProps) {
  const { toast, confirm, prompt } = useUI();
  const { updateAvailable } = useUpdateCheck();
  const [section, setSection] = useState<Section>('projects');
  const [projects, setProjects] = useState<ProjectMeta[]>(listProjects);
  const [trashed, setTrashed] = useState<ProjectMeta[]>(listTrashedProjects);
  const [usage, setUsage] = useState<number>(getStorageUsage);
  const [warningDismissed, setWarningDismissed] = useState<boolean>(readWarningDismissed);

  const dismissWarning = () => {
    setWarningDismissed(true);
    try {
      localStorage.setItem(WARNING_DISMISSED_KEY, '1');
    } catch {}
  };

  const refresh = useCallback(() => {
    setProjects(listProjects());
    setTrashed(listTrashedProjects());
    setUsage(getStorageUsage());
  }, []);

  // Projects changed from another tab
  useEffect(() => {
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [refresh]);

  // Files dragged over the window: the drop itself is handled by App, here it is only shown
  const [draggingFile, setDraggingFile] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const handleEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDraggingFile(true);
    };
    const handleLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDraggingFile(false);
    };
    const handleEnd = () => {
      depth = 0;
      setDraggingFile(false);
    };
    window.addEventListener('dragenter', handleEnter);
    window.addEventListener('dragleave', handleLeave);
    window.addEventListener('drop', handleEnd);
    window.addEventListener('dragend', handleEnd);
    return () => {
      window.removeEventListener('dragenter', handleEnter);
      window.removeEventListener('dragleave', handleLeave);
      window.removeEventListener('drop', handleEnd);
      window.removeEventListener('dragend', handleEnd);
    };
  }, []);

  // ── Creating and importing ──────────────────────────────────────────────────
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const [isPasteSvgOpen, setIsPasteSvgOpen] = useState(false);
  const [isFigmaImportOpen, setIsFigmaImportOpen] = useState(false);

  const runImport = async (load: () => Promise<ImportedProject>) => {
    try {
      const { project, message } = await load();
      onCreateProject(project, message);
    } catch (err: any) {
      toast(err?.message || 'No se pudo importar el archivo', 'error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) runImport(() => importProjectFile(file));
  };

  const actions: { label: string; desc: string; Icon: React.ElementType; onClick: () => void; primary?: boolean }[] = [
    {
      label: 'Nuevo proyecto',
      desc: 'Lienzo en blanco de 960 × 540',
      Icon: FilePlus,
      primary: true,
      onClick: () => onCreateProject(createBlankProject(), 'Nuevo proyecto en blanco creado'),
    },
    {
      label: 'Abrir JSON / Lottie',
      desc: 'Proyecto de Nori o animación Lottie',
      Icon: FolderOpen,
      onClick: () => jsonInputRef.current?.click(),
    },
    {
      label: 'Importar SVG',
      desc: 'Si es animado, sus animaciones pasan a la línea del tiempo',
      Icon: FileSvg,
      onClick: () => svgInputRef.current?.click(),
    },
    {
      label: 'Código SVG',
      desc: 'Pegar el código de un SVG',
      Icon: ClipboardText,
      onClick: () => setIsPasteSvgOpen(true),
    },
    {
      label: 'Importar desde Figma',
      desc: 'Un frame copiado como SVG',
      Icon: FigmaLogo,
      onClick: () => setIsFigmaImportOpen(true),
    },
    {
      label: 'Proyecto de ejemplo',
      desc: 'La animación del logo de Nori',
      Icon: NoriLogo,
      onClick: () => onCreateProject(JSON.parse(JSON.stringify(NORI_INTRO_PROJECT)), 'Proyecto de ejemplo abierto', true),
    },
  ];

  // ── Project actions ─────────────────────────────────────────────────────────
  const [menu, setMenu] = useState<{ x: number; y: number; meta: ProjectMeta } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [exportTarget, setExportTarget] = useState<Project | null>(null);

  const withProject = (meta: ProjectMeta, action: (project: Project) => void) => {
    const project = loadProject(meta.id);
    if (project) action(project);
    else toast(`No se pudo leer el proyecto "${meta.title}"`, 'error');
  };

  const handleRename = async (meta: ProjectMeta) => {
    const title = await prompt({
      title: 'Renombrar proyecto',
      defaultValue: meta.title,
      confirmLabel: 'Renombrar',
    });
    if (!title || title === meta.title) return;
    if (renameProject(meta.id, title.slice(0, 80))) {
      refresh();
      toast(`Proyecto renombrado a "${title}"`, 'success');
    } else {
      toast('No se pudo renombrar el proyecto', 'error');
    }
  };

  const handleDuplicate = (meta: ProjectMeta) => {
    const copy = duplicateProject(meta.id);
    if (copy) {
      refresh();
      toast(`Proyecto duplicado: "${copy.title}"`, 'success');
    } else {
      toast('No se pudo duplicar el proyecto (espacio insuficiente en el navegador)', 'error');
    }
  };

  const handleTrash = (meta: ProjectMeta) => {
    if (!trashProject(meta.id)) return;
    refresh();
    toast(`"${meta.title}" se movió a la papelera`, 'success');
  };

  const buildMenuItems = (meta: ProjectMeta): ContextMenuItem[] => [
    { label: 'Abrir', onSelect: () => onOpenProject(meta.id) },
    { label: 'Exportar…', onSelect: () => withProject(meta, setExportTarget) },
    {
      label: 'Descargar JSON',
      onSelect: () => withProject(meta, (p) => toast(`Proyecto descargado: ${downloadProjectJson(p)}`, 'success')),
    },
    'separator',
    { label: 'Renombrar…', onSelect: () => handleRename(meta) },
    { label: 'Duplicar', onSelect: () => handleDuplicate(meta) },
    'separator',
    { label: 'Borrar', danger: true, onSelect: () => handleTrash(meta) },
  ];

  // ── Trash ───────────────────────────────────────────────────────────────────
  const handleRestore = (meta: ProjectMeta) => {
    if (!restoreProject(meta.id)) return;
    refresh();
    toast(`"${meta.title}" se restauró`, 'success');
  };

  const handleDeleteForever = async (meta: ProjectMeta) => {
    const ok = await confirm({
      title: 'Eliminar permanentemente',
      message: `¿Eliminar "${meta.title}" de forma permanente? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (ok !== true) return;
    deleteProjectForever(meta.id);
    refresh();
    toast('Proyecto eliminado permanentemente', 'success');
  };

  const handleEmptyTrash = async () => {
    const ok = await confirm({
      title: 'Vaciar papelera',
      message: `Se eliminarán permanentemente ${trashed.length === 1 ? 'el proyecto' : `los ${trashed.length} proyectos`} de la papelera. Esta acción no se puede deshacer.`,
      confirmLabel: 'Vaciar papelera',
      variant: 'danger',
    });
    if (ok !== true) return;
    emptyTrash();
    refresh();
    toast('Papelera vaciada', 'success');
  };

  // ── Layout ──────────────────────────────────────────────────────────────────
  const navItem = (id: Section, label: string, Icon: React.ElementType, count?: number) => {
    const active = section === id;
    const isTrash = id === 'trash';
    return (
      <button
        onClick={() => setSection(id)}
        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
          active
            ? isTrash
              ? 'bg-destructive/10 text-destructive border-l-2 border-destructive font-bold'
              : 'bg-bento-blue-light text-bento-blue border-l-2 border-bento-blue font-bold'
            : 'hover:bg-accent text-muted-foreground hover:text-foreground'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs font-semibold flex-1">{label}</span>
        {count !== undefined && count > 0 && (
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
              isTrash
                ? 'bg-destructive/20 text-destructive border-destructive/30'
                : 'bg-secondary text-muted-foreground border-border'
            }`}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  const usagePercent = Math.min(100, (usage / STORAGE_QUOTA) * 100);

  return (
    <div className="h-screen w-screen flex bg-background text-foreground overflow-hidden font-body select-none">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-card border-r border-border flex flex-col h-full">
        <div className="p-4 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <img src="/icon.svg" alt="Nori" className="w-8 h-8 shrink-0" />
            <div className="leading-tight overflow-hidden">
              <span className="text-sm font-bold text-foreground block truncate font-heading">Nori</span>
              <span className="text-[10px] text-muted-foreground block truncate font-mono">Animación vectorial</span>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItem('projects', 'Proyectos', SquaresFour, projects.length)}
          {navItem('trash', 'Papelera', TrashSimple, trashed.length)}
        </nav>

        <div className="p-3 border-t border-border bg-secondary mt-auto flex flex-col gap-3">
          {/* Space used in this browser */}
          <div className="px-1 space-y-1.5" data-tooltip="Espacio aproximado que ocupan tus proyectos en el almacenamiento local del navegador">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <HardDrives className="w-3 h-3" />
                Almacenamiento
                {warningDismissed && (
                  <span
                    className="text-muted-foreground hover:text-foreground transition-colors cursor-help"
                    data-tooltip-title={STORAGE_WARNING_TITLE}
                    data-tooltip={STORAGE_WARNING_TEXT}
                    aria-label={`${STORAGE_WARNING_TITLE}. ${STORAGE_WARNING_TEXT}`}
                    role="img"
                  >
                    <Info className="w-3 h-3" />
                  </span>
                )}
              </span>
              <span>{formatSize(usage)} / ~5 MB</span>
            </div>
            <div className="h-1 rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full ${usagePercent > 80 ? 'bg-destructive' : 'bg-bento-blue'}`}
                style={{ width: `${Math.max(2, usagePercent)}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => setSection('about')}
            className={`relative w-full px-3 py-2 border rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-semibold leading-none shadow-card ${
              section === 'about'
                ? 'bg-accent border-ring/40 text-foreground'
                : 'bg-card hover:bg-accent border-border text-foreground'
            }`}
          >
            <Info className="w-4 h-4 text-muted-foreground" />
            Acerca de Nori
            {updateAvailable && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {section === 'about' ? (
          <AboutNori />
        ) : section === 'trash' ? (
          <TrashSection
            trashed={trashed}
            onRestore={handleRestore}
            onDeleteForever={handleDeleteForever}
            onEmpty={handleEmptyTrash}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
              {/* Header */}
              <div className="border-b border-border pb-6">
                <div className="min-w-0">
                  <h1 className="text-2xl font-black text-foreground font-heading">Inicio</h1>
                  <p className="text-muted-foreground text-xs mt-1.5 leading-normal max-w-xl">
                    Tus animaciones se guardan solas mientras las editas. Pasa el cursor sobre un proyecto para ver su animación y haz clic para abrirlo.
                  </p>
                </div>

              </div>

              {/* Where the projects live (once closed, it stays in the sidebar's storage info) */}
              {!warningDismissed && (
                <div className="p-4 bg-bento-orange-light border border-bento-orange/30 rounded-xl flex items-start gap-3 text-xs leading-relaxed">
                  <Warning className="w-5 h-5 shrink-0 text-bento-orange" />
                  <div className="text-foreground flex-1">
                    <span className="font-semibold block mb-0.5 text-bento-orange">{STORAGE_WARNING_TITLE}</span>
                    {STORAGE_WARNING_TEXT}
                  </div>
                  <button
                    onClick={dismissWarning}
                    className="p-1 -m-1 rounded-lg text-bento-orange/70 hover:text-bento-orange hover:bg-bento-orange/10 transition-colors cursor-pointer shrink-0"
                    data-tooltip="Cerrar aviso (seguirá disponible en el icono de información de Almacenamiento)"
                    aria-label="Cerrar aviso"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Create or import */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {actions.map(({ label, desc, Icon, onClick, primary }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      data-tooltip={desc}
                      className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        primary
                          ? 'bg-bento-blue border-bento-blue text-white hover:bg-bento-blue/90 shadow-card'
                          : 'bg-card border-border text-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${primary ? 'text-white' : 'text-bento-blue'}`} />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  También puedes arrastrar un archivo .json (Nori o Lottie) o .svg a cualquier parte de la ventana.
                </p>
                <input type="file" ref={jsonInputRef} onChange={handleFileChange} accept=".json,.nori.json" className="hidden" />
                <input type="file" ref={svgInputRef} onChange={handleFileChange} accept=".svg,image/svg+xml" className="hidden" />
              </section>

              {/* Saved projects */}
              <section className="space-y-3 pb-4">
                <h2 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Mis proyectos <span className="font-mono">({projects.length})</span>
                </h2>
                {projects.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-border rounded-2xl">
                    <SquaresFour className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-sm font-semibold text-foreground">Aún no tienes proyectos</p>
                    <p className="text-xs text-muted-foreground mt-1">Crea uno nuevo o importa un archivo para empezar.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {projects.map((meta) => (
                      <ProjectCard
                        key={meta.id}
                        meta={meta}
                        onOpen={() => onOpenProject(meta.id)}
                        onOpenMenu={(x, y) => setMenu({ x, y, meta })}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {draggingFile && (
        <div className="fixed inset-0 z-40 p-4 bg-background/70 backdrop-blur-[2px] pointer-events-none animate-fade-in">
          <div className="h-full rounded-2xl border-2 border-dashed border-bento-blue bg-bento-blue-light/60 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-bento-blue text-white flex items-center justify-center shadow-card">
              <DownloadSimple className="w-7 h-7" />
            </div>
            <p className="text-base font-bold text-foreground font-heading">Suelta el archivo para importarlo</p>
            <p className="text-xs text-muted-foreground">Proyecto de Nori o animación Lottie (.json) o imagen .svg · se creará un proyecto nuevo</p>
          </div>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildMenuItems(menu.meta)} onClose={closeMenu} />}

      {exportTarget && (
        <ExportModal key={exportTarget.id} project={exportTarget} isOpen onClose={() => setExportTarget(null)} />
      )}

      <PasteSvgModal
        isOpen={isPasteSvgOpen}
        onClose={() => setIsPasteSvgOpen(false)}
        onImport={(svgText) => runImport(() => importSvgProject(svgText, 'svg_pegado'))}
      />

      <FigmaImportModal
        isOpen={isFigmaImportOpen}
        onClose={() => setIsFigmaImportOpen(false)}
        onImport={(svgText) => runImport(() => importFigmaProject(svgText))}
      />
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
  meta: ProjectMeta;
  onOpen: () => void;
  onOpenMenu: (x: number, y: number) => void;
}

function ProjectCard({ meta, onOpen, onOpenMenu }: ProjectCardProps) {
  const [hovered, setHovered] = useState(false);
  const project = useMemo(() => loadProject(meta.id), [meta.id, meta.updatedAt]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(e.clientX, e.clientY);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group border border-border bg-card hover:border-bento-blue/50 hover:shadow-card-hover rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ProjectThumbnail project={project} playing={hovered} className="aspect-video border-b border-border" />
      <div className="p-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground text-sm truncate font-heading">{meta.title}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {project ? `${project.width} × ${project.height} · ${project.duration}s · ` : ''}
            Editado {formatRelative(meta.updatedAt)}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onOpenMenu(rect.left, rect.bottom + 4);
          }}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
          data-tooltip="Más opciones"
          aria-label="Más opciones"
        >
          <DotsThree className="w-4 h-4" weight="bold" />
        </button>
      </div>
    </div>
  );
}

// ─── Trash ────────────────────────────────────────────────────────────────────

interface TrashSectionProps {
  trashed: ProjectMeta[];
  onRestore: (meta: ProjectMeta) => void;
  onDeleteForever: (meta: ProjectMeta) => void;
  onEmpty: () => void;
}

function TrashSection({ trashed, onRestore, onDeleteForever, onEmpty }: TrashSectionProps) {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background animate-fade-in">
      <div className="p-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground font-heading flex items-center gap-2">
              <Trash className="w-5 h-5 text-destructive shrink-0" />
              Papelera de reciclaje
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Los proyectos borrados se mueven aquí. Puedes restaurarlos o eliminarlos permanentemente; mientras estén aquí siguen ocupando espacio en el navegador.
            </p>
          </div>
          {trashed.length > 0 && (
            <button
              onClick={onEmpty}
              className="px-3 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <TrashSimple className="w-3.5 h-3.5" />
              Vaciar papelera
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {trashed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Trash className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-semibold">La papelera está vacía</p>
            <p className="text-xs mt-1">Los proyectos que borres aparecerán aquí.</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl mx-auto">
            {trashed.map((meta) => (
              <TrashRow key={meta.id} meta={meta} onRestore={onRestore} onDeleteForever={onDeleteForever} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrashRow({
  meta,
  onRestore,
  onDeleteForever,
}: {
  meta: ProjectMeta;
  onRestore: (meta: ProjectMeta) => void;
  onDeleteForever: (meta: ProjectMeta) => void;
}) {
  const project = useMemo(() => loadProject(meta.id), [meta.id]);
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-card hover:shadow-card-hover transition-all flex items-center gap-3">
      <ProjectThumbnail project={project} className="w-28 aspect-video rounded-lg border border-border shrink-0" />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-foreground truncate">{meta.title}</h4>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
          <span>Borrado {formatRelative(meta.deletedAt ?? meta.updatedAt)}</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span>Editado {formatRelative(meta.updatedAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onRestore(meta)}
          className="px-2.5 py-1.5 rounded-lg hover:bg-accent text-bento-green text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <ArrowCounterClockwise className="w-4 h-4" />
          Restaurar
        </button>
        <button
          onClick={() => onDeleteForever(meta)}
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          data-tooltip="Eliminar permanentemente"
          aria-label="Eliminar permanentemente"
        >
          <TrashSimple className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
