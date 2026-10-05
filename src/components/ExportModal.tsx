import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Download,
  FilmStrip as Film,
  Image,
  FileCode,
  WarningCircle as AlertCircle,
  CircleNotch as Loader2,
  Sparkle as Sparkles,
  Checkerboard as Grid,
  Trash,
  Eye,
  Wind,
  UniteSquare,
  FileJs,
  Lightning,
  Info,
} from '@phosphor-icons/react';
import { ExportFormat, ExportSettings, Project, SvgBooleanMode } from '../types/animation';
import {
  ANTIALIAS_LEVELS,
  DEFAULT_ANTIALIAS,
  exportProject,
  ExportProgress,
  getAntialiasFactor,
  motionBlurSamples,
} from '../utils/videoExporter';
import { exportToLottie } from '../utils/lottieExporter';
import { exportToAnimatedSvg, hasAnimatedBooleanGroups } from '../utils/svgExporter';
import { hasBooleanLayers, useBooleanEngine } from '../utils/booleanOps';
import { ColorSwatch, HexColorInput, isNoColor } from './ColorSwatch';
import { Dropdown } from './Dropdown';
import { t, useLanguage } from '../i18n';

interface ExportModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

// Formats rendered frame by frame (SVG and Lottie are generated live)
type RasterFormat = Exclude<ExportFormat, 'svg' | 'lottie'>;

const FORMATS: { id: ExportFormat; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'gif', label: 'GIF', icon: Image, desc: 'Web y chats' },
  { id: 'webm', label: 'WebM', icon: Film, desc: 'Alfa transparente' },
  { id: 'mp4', label: 'MP4', icon: Film, desc: 'Universal' },
  { id: 'svg', label: 'SVG', icon: FileCode, desc: 'Vector animado' },
  { id: 'lottie', label: 'Lottie', icon: FileJs, desc: 'JSON para web y apps' },
];

// Versions of the Lottie file
const LOTTIE_OPTIONS: { value: boolean; label: string; description: string }[] = [
  {
    value: false,
    label: 'Normal',
    description: 'Máxima fidelidad: todos los fotogramas clave, tres decimales y los nombres de las formas',
  },
  {
    value: true,
    label: 'Optimizado',
    description: 'Archivo más pequeño para web y apps: menos decimales, sin fotogramas clave que no cambian el movimiento y sin nombres de formas',
  },
];

// Antialiasing of GIF and video: frames rendered larger and scaled down
const ANTIALIAS_OPTIONS = ANTIALIAS_LEVELS.map((level) => ({
  value: level as number,
  label: level === 1 ? 'Desactivado' : level === DEFAULT_ANTIALIAS ? '{level}x (recomendado)' : '{level}x (máxima calidad)',
}));

// How boolean groups whose shapes move against each other are written in the SVG
const SVG_BOOLEAN_OPTIONS: { value: SvgBooleanMode; label: string; description: string }[] = [
  {
    value: 'auto',
    label: 'Automático',
    description: 'Máscaras para los grupos sin trazo; trazado exacto para los que tienen trazo',
  },
  {
    value: 'masks',
    label: 'Máscaras',
    description: 'Archivo liviano y movimiento fluido; el trazo del resultado se aproxima donde las formas se cruzan',
  },
  {
    value: 'flatten',
    label: 'Aplanar',
    description: 'Un solo trazado que cambia en cada fotograma: exacto y fácil de abrir en editores, pero más pesado',
  },
];

const SCALES = [0.5, 1, 1.5, 2, 3, 4];
const SCALE_NOTES: Record<number, string> = { 2: 'HD', 3: 'QHD', 4: '4K' };
const FPS_OPTIONS = [
  { value: 24, label: '24 FPS (Cinemático)' },
  { value: 30, label: '30 FPS (Estándar)' },
  { value: 60, label: '60 FPS (Ultra fluido)' },
];

// Finished render of a format; kept while switching formats until it is deleted
interface RenderResult {
  url: string;
  filename: string;
  blob: Blob;
  width: number;
  height: number;
  fps: number;
  motionBlur: number; // shutter used (0 = off)
  antialias: number; // supersampling factor used (1 = off)
  // Signature of the project it was made from, to warn when the project has changed since
  signature: string;
}

const CHECKER: React.CSSProperties = {
  backgroundImage: 'conic-gradient(#e4e4e7 25%, #ffffff 0 50%, #e4e4e7 0 75%, #ffffff 0)',
  backgroundSize: '16px 16px',
};

// What the export depends on (timeline-only state like expanded rows is left out)
const projectSignature = (project: Project) =>
  JSON.stringify(project, (key, value) => (key === 'expanded' ? undefined : value));

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

const downloadUrl = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Color for formats exported with a background (white when the project has none)
const exportBackground = (color: string) => (isNoColor(color) ? '#ffffff' : color);

export const ExportModal: React.FC<ExportModalProps> = ({ project, isOpen, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('gif');
  const [fps, setFps] = useState<number>(project.fps || 60);
  const [scale, setScale] = useState<number>(project.width < 500 ? 2 : 1);
  const [transparent, setTransparent] = useState<boolean>(isNoColor(project.backgroundColor));
  const [backgroundColor, setBackgroundColor] = useState<string>(exportBackground(project.backgroundColor));
  const [loop] = useState<number>(0);
  // Motion blur (MP4 / WebM only): on / off and shutter intensity in %
  const [motionBlurOn, setMotionBlurOn] = useState<boolean>(false);
  const [motionBlurIntensity, setMotionBlurIntensity] = useState<number>(50);
  // Antialiasing (GIF / video) and Lottie version
  const [antialias, setAntialias] = useState<number>(DEFAULT_ANTIALIAS);
  const [lottieOptimized, setLottieOptimized] = useState<boolean>(false);
  // The Lottie warnings (and names inside the file) are in the interface language
  const language = useLanguage();

  // Sync with project on open
  useEffect(() => {
    if (isOpen) {
      setFps(project.fps || 60);
      setScale(project.width < 500 ? 2 : 1);
      setBackgroundColor(exportBackground(project.backgroundColor));
      // A project without a background exports transparent by default
      setTransparent(isNoColor(project.backgroundColor));
    }
  }, [isOpen, project.fps, project.width, project.backgroundColor]);

  const [renders, setRenders] = useState<Partial<Record<RasterFormat, RenderResult>>>({});
  const [errors, setErrors] = useState<Partial<Record<RasterFormat, string>>>({});
  // Only one render runs at a time; it keeps going while another format is shown
  const [exporting, setExporting] = useState<{ format: RasterFormat; progress: ExportProgress | null } | null>(null);

  // Stops the render in progress (Cancel button, or the modal going away)
  const abortRef = useRef<AbortController | null>(null);

  // Free every render's object URL when the editor goes away
  const rendersRef = useRef(renders);
  rendersRef.current = renders;
  useEffect(
    () => () => {
      abortRef.current?.abort();
      Object.values(rendersRef.current).forEach((r) => r && URL.revokeObjectURL(r.url));
    },
    []
  );

  // Escape closes the modal, unless it is closing one of its menus or leaving a field
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (dialogRef.current?.querySelector('[role="listbox"]')) return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
  // A click outside closes it only when it also started outside (not a drag that ends there)
  const pressedOutsideRef = useRef(false);

  // Boolean groups: their geometry comes from paper.js, loaded before the SVG is generated
  const [booleanMode, setBooleanMode] = useState<SvgBooleanMode>('auto');
  const needsBooleanEngine = isOpen && hasBooleanLayers(project);
  const booleanEngineReady = useBooleanEngine(needsBooleanEngine);
  const waitingForEngine = needsBooleanEngine && !booleanEngineReady;
  // The option only shows when some group's outline changes during the animation
  const hasAnimatedBooleans = useMemo(
    () => isOpen && format === 'svg' && !waitingForEngine && hasAnimatedBooleanGroups(project),
    [isOpen, format, waitingForEngine, project]
  );

  // SVG needs no rendering: it is generated live from the current settings
  const svgPreview = useMemo(() => {
    if (!isOpen || format !== 'svg' || waitingForEngine) return null;
    const svg = exportToAnimatedSvg(project, { transparent, backgroundColor, fps, booleanMode });
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  }, [isOpen, format, project, transparent, backgroundColor, fps, booleanMode, waitingForEngine]);

  // Lottie too: both versions are generated to compare their sizes
  const lottie = useMemo(() => {
    if (!isOpen || format !== 'lottie' || waitingForEngine) return null;
    const make = (optimized: boolean) => {
      const { json, warnings } = exportToLottie(project, { fps, transparent, backgroundColor, optimized });
      return { blob: new Blob([json], { type: 'application/json' }), warnings };
    };
    return { normal: make(false), optimized: make(true) };
  }, [isOpen, format, project, transparent, backgroundColor, fps, waitingForEngine, language]);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!svgPreview) {
      setSvgUrl(null);
      return;
    }
    const url = URL.createObjectURL(svgPreview);
    setSvgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [svgPreview]);

  if (!isOpen) return null;

  const isSvg = format === 'svg';
  const isLottie = format === 'lottie';
  // Generated live, without a render step
  const isLive = isSvg || isLottie;
  const raster = isLive ? null : (format as RasterFormat);
  const lottieFile = lottie ? (lottieOptimized ? lottie.optimized : lottie.normal) : null;
  const render = raster ? renders[raster] : undefined;
  const error = raster ? errors[raster] : undefined;
  const isVideo = format === 'mp4' || format === 'webm';
  const motionBlur = isVideo && motionBlurOn ? motionBlurIntensity / 100 : 0;
  const isRenderingThis = !!exporting && exporting.format === format;
  const baseName = project.title.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'nori_animation';

  const handleStartExport = async () => {
    if (!raster || exporting) return;
    const target = raster;
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting({ format: target, progress: null });
    setErrors((prev) => ({ ...prev, [target]: undefined }));

    const settings: ExportSettings = { format: target, fps, scale, transparent, backgroundColor, loop, motionBlur, antialias };
    try {
      const { blob, filename } = await exportProject(
        project,
        settings,
        (progress) => {
          if (!controller.signal.aborted) setExporting({ format: target, progress });
        },
        controller.signal
      );
      const result: RenderResult = {
        url: URL.createObjectURL(blob),
        filename,
        blob,
        width: Math.round(project.width * scale),
        height: Math.round(project.height * scale),
        fps,
        motionBlur,
        antialias: getAntialiasFactor(Math.round(project.width * scale), Math.round(project.height * scale), antialias),
        signature: projectSignature(project),
      };
      setRenders((prev) => {
        if (prev[target]) URL.revokeObjectURL(prev[target]!.url);
        return { ...prev, [target]: result };
      });
    } catch (err: any) {
      // Cancelled: back to the empty preview, without an error
      if (controller.signal.aborted) return;
      console.error('Export error:', err);
      setErrors((prev) => ({ ...prev, [target]: err?.message || t('Error durante la exportación del archivo.') }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setExporting(null);
    }
  };

  const handleCancelExport = () => abortRef.current?.abort();

  const handleDeleteRender = () => {
    if (!raster || !render) return;
    URL.revokeObjectURL(render.url);
    setRenders((prev) => ({ ...prev, [raster]: undefined }));
  };

  const lottieFilename = `${baseName}${lottieOptimized ? '.min' : ''}.json`;

  const handleDownload = () => {
    if (isSvg) {
      if (svgUrl) downloadUrl(svgUrl, `${baseName}.svg`);
    } else if (isLottie) {
      if (!lottieFile) return;
      const url = URL.createObjectURL(lottieFile.blob);
      downloadUrl(url, lottieFilename);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (render) {
      downloadUrl(render.url, render.filename);
    }
  };

  const exportWidth = Math.round(project.width * scale);
  const exportHeight = Math.round(project.height * scale);
  const formatLabel = FORMATS.find((f) => f.id === format)?.label ?? format.toUpperCase();
  const renderingLabel = exporting ? FORMATS.find((f) => f.id === exporting.format)?.label : '';

  // ── Right column: preview of the SVG or of the render ─────────────────────
  const renderPreview = () => {
    if (isLottie) {
      return (
        <>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-foreground font-semibold">
              <FileJs className="w-3.5 h-3.5 text-bento-blue" />
              {t('Archivo Lottie')}
            </span>
            {lottieFile && <span className="font-mono text-muted-foreground">{formatSize(lottieFile.blob.size)}</span>}
          </div>
          <PreviewStage transparent={false} empty>
            {waitingForEngine || !lottie ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 text-bento-blue animate-spin" />
                <span>{t('Preparando las operaciones booleanas…')}</span>
              </div>
            ) : (
              <div className="w-full max-w-sm space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {LOTTIE_OPTIONS.map((option) => {
                    const file = option.value ? lottie.optimized : lottie.normal;
                    const selected = option.value === lottieOptimized;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setLottieOptimized(option.value)}
                        className={`flex flex-col items-start justify-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          selected
                            ? 'bg-bento-blue/15 border-bento-blue text-foreground'
                            : 'bg-card border-border text-muted-foreground hover:text-foreground'
                        }`}
                        aria-pressed={selected}
                      >
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">
                          {option.value ? (
                            <Lightning className="w-3.5 h-3.5 text-bento-blue" />
                          ) : (
                            <FileJs className="w-3.5 h-3.5 text-bento-blue" />
                          )}
                          {t(option.label)}
                        </span>
                        <span className="block font-mono text-lg text-foreground mt-1">{formatSize(file.blob.size)}</span>
                        <span className="block text-[10px] text-muted-foreground leading-snug mt-1">{t(option.description)}</span>
                      </button>
                    );
                  })}
                </div>
                {lottie.normal.blob.size > 0 && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    {t('La versión optimizada pesa un {percent}% menos.', {
                      percent: Math.max(0, Math.round((1 - lottie.optimized.blob.size / lottie.normal.blob.size) * 100)),
                    })}
                  </p>
                )}
                {lottieFile && lottieFile.warnings.length > 0 && (
                  <div className="bg-bento-orange/10 border border-bento-orange/30 rounded-lg p-2.5 space-y-1">
                    {lottieFile.warnings.map((warning) => (
                      <p key={warning} className="text-[11px] text-foreground flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-bento-orange" />
                        <span>{warning}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </PreviewStage>
          <p className="text-[11px] text-muted-foreground">
            {t('Lottie es un JSON vectorial que se reproduce en sitios web y apps (lottie-web, iOS, Android, LottieFiles). No necesita renderizarse.')}
          </p>
        </>
      );
    }

    if (isSvg) {
      return (
        <>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-foreground font-semibold">
              <Eye className="w-3.5 h-3.5 text-bento-blue" />
              {t('Vista previa en vivo')}
            </span>
            {svgPreview && <span className="font-mono text-muted-foreground">{formatSize(svgPreview.size)}</span>}
          </div>
          <PreviewStage transparent={transparent}>
            {waitingForEngine ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 text-bento-blue animate-spin" />
                <span>{t('Preparando las operaciones booleanas…')}</span>
              </div>
            ) : (
              svgUrl && <img src={svgUrl} alt={t('Vista previa del SVG')} className="max-w-full max-h-full object-contain" />
            )}
          </PreviewStage>
          <p className="text-[11px] text-muted-foreground">
            {t('El SVG es vectorial y se anima sin JavaScript: no necesita renderizarse y se ve igual a cualquier tamaño.')}
          </p>
        </>
      );
    }

    if (render) {
      const outdated = render.signature !== projectSignature(project);
      return (
        <>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-foreground font-semibold min-w-0">
              <Eye className="w-3.5 h-3.5 text-bento-blue shrink-0" />
              <span className="truncate">
                {t('Render {format}', { format: formatLabel })} · {render.width} × {render.height} · {render.fps} FPS
                {render.antialias > 1 && ` · AA ${render.antialias}x`}
                {render.motionBlur > 0 && ` · ${t('Desenfoque {percent}%', { percent: Math.round(render.motionBlur * 100) })}`}
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-muted-foreground">{formatSize(render.blob.size)}</span>
              <button
                onClick={handleDeleteRender}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                data-tooltip={t('Borrar este render para repetirlo')}
                aria-label={t('Borrar render')}
              >
                <Trash className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
          <PreviewStage transparent={transparent}>
            {format === 'gif' ? (
              <img src={render.url} alt={t('Vista previa del GIF')} className="max-w-full max-h-full object-contain" />
            ) : (
              <video src={render.url} autoPlay loop muted controls className="max-w-full max-h-full object-contain" />
            )}
          </PreviewStage>
          {outdated && (
            <p className="text-[11px] text-bento-orange flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {t('El proyecto cambió desde este render. Bórralo para generar uno nuevo.')}
            </p>
          )}
        </>
      );
    }

    return (
      <PreviewStage transparent={false} empty>
        {isRenderingThis ? (
          <div className="w-full max-w-xs space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-foreground">
                <Loader2 className="w-3.5 h-3.5 text-bento-blue animate-spin" />
                <span>{exporting?.progress?.stage || t('Preparando renderizado...')}</span>
              </div>
              <span className="font-mono text-bento-blue font-semibold">{exporting?.progress?.percentage || 0}%</span>
            </div>
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-bento-blue h-full transition-all duration-150 ease-out"
                style={{ width: `${exporting?.progress?.percentage || 0}%` }}
              />
            </div>
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={handleCancelExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>{t('Cancelar renderizado')}</span>
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="max-w-xs bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex items-start gap-2 text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="text-center text-muted-foreground max-w-xs">
            <Sparkles className="w-7 h-7 mx-auto mb-2 text-bento-blue/70" />
            <p className="text-foreground font-semibold">{t('Todavía no hay render en {format}', { format: formatLabel })}</p>
            <p className="text-[11px] mt-1">{t('Pulsa Renderizar para generarlo y verlo aquí antes de descargarlo.')}</p>
          </div>
        )}
      </PreviewStage>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] p-4 select-none animate-fade-in"
      onMouseDown={(e) => {
        pressedOutsideRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedOutsideRef.current && e.target === e.currentTarget) onClose();
        pressedOutsideRef.current = false;
      }}
    >
      {/* Never taller than the window (minus its margins): the settings column scrolls instead */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('Exportar Animación')}
        className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-4xl max-h-full flex flex-col text-foreground animate-scale-in"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-bento-blue" />
            <h2 className="text-sm font-bold text-foreground font-heading">{t('Exportar Animación')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={t('Cerrar')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content: settings on the left, preview on the right. On wide screens the preview stays
            in place and only the settings scroll when they don't fit; stacked, everything scrolls */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] gap-5 text-xs flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
          <div className="space-y-4 md:min-h-0 md:overflow-y-auto md:-mr-3 md:pr-3">
            {/* Format cards, two per row */}
            <div>
              <label className="text-muted-foreground font-medium block mb-2">{t('Formato de exportación')}</label>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((item) => {
                  const Icon = item.icon;
                  const isSelected = format === item.id;
                  const hasRender = item.id !== 'svg' && item.id !== 'lottie' && !!renders[item.id as RasterFormat];
                  return (
                    <button
                      key={item.id}
                      onClick={() => setFormat(item.id)}
                      className={`relative p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-bento-blue/15 border-bento-blue text-foreground shadow-sm'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
                      }`}
                    >
                      {hasRender && (
                        <span
                          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-bento-green"
                          data-tooltip={t('Ya tiene un render')}
                        />
                      )}
                      {exporting?.format === item.id && (
                        <Loader2 className="absolute top-1.5 right-1.5 w-3 h-3 text-bento-blue animate-spin" />
                      )}
                      <Icon className={`w-4 h-4 mx-auto mb-1 ${isSelected ? 'text-bento-blue' : ''}`} />
                      <span className="font-semibold block text-xs">{item.label}</span>
                      <span className="text-[9px] text-muted-foreground block truncate">{t(item.desc)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Resolution and FPS, each on its own line */}
            <div className="bg-secondary border border-border rounded-xl p-3 space-y-3">
              <div>
                <label className="text-muted-foreground block mb-1">{t('Resolución')}</label>
                <Dropdown
                  value={scale}
                  options={SCALES.map((s) => ({
                    value: s,
                    label: `${s.toFixed(1)}x · ${Math.round(project.width * s)} × ${Math.round(project.height * s)} px${
                      SCALE_NOTES[s] ? ` · ${SCALE_NOTES[s]}` : ''
                    }`,
                  }))}
                  onChange={setScale}
                  align="left"
                  className="w-full bg-card! font-mono"
                  menuClassName="w-full"
                  disabled={isLive}
                  title={isLive ? t('Los formatos vectoriales no dependen de la resolución') : undefined}
                  ariaLabel={t('Resolución')}
                />
              </div>

              <div>
                <label className="text-muted-foreground block mb-1">{t('Velocidad (FPS)')}</label>
                <Dropdown
                  value={fps}
                  options={FPS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                  onChange={setFps}
                  align="left"
                  className="w-full bg-card! font-mono"
                  menuClassName="w-full"
                  ariaLabel={t('Velocidad (FPS)')}
                />
              </div>

              {/* Boolean groups whose shapes move against each other (SVG) */}
              {isSvg && hasAnimatedBooleans && (
                <div className="pt-3 border-t border-border space-y-1">
                  <label className="text-muted-foreground flex items-center gap-1.5">
                    <UniteSquare className="w-3.5 h-3.5 text-bento-blue" />
                    <span>{t('Grupos booleanos animados')}</span>
                  </label>
                  <Dropdown
                    value={booleanMode}
                    options={SVG_BOOLEAN_OPTIONS.map((o) => ({ ...o, label: t(o.label), description: t(o.description) }))}
                    onChange={setBooleanMode}
                    align="left"
                    className="w-full bg-card!"
                    menuClassName="w-72"
                    optionClassName=""
                    ariaLabel={t('Grupos booleanos animados')}
                  />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {t(SVG_BOOLEAN_OPTIONS.find((o) => o.value === booleanMode)?.description ?? '')}.{' '}
                    {t('Los grupos cuyas formas no se mueven entre sí siempre se exportan como un solo trazado.')}
                  </p>
                </div>
              )}

              {/* Antialiasing (GIF and video) */}
              {!isLive && (
                <div className="pt-3 border-t border-border space-y-1">
                  <label className="text-muted-foreground block">{t('Antialiasing')}</label>
                  <Dropdown
                    value={antialias}
                    options={ANTIALIAS_OPTIONS.map((o) => ({ ...o, label: t(o.label, { level: o.value }) }))}
                    onChange={setAntialias}
                    align="left"
                    className="w-full bg-card!"
                    menuClassName="w-full"
                    optionClassName=""
                    ariaLabel={t('Antialiasing')}
                  />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {antialias > 1
                      ? t('Suaviza los bordes: cada fotograma se dibuja {level} veces más grande y se reduce, así que el render tarda más.', { level: antialias })
                      : t('Los bordes se dibujan sin suavizado extra: es lo más rápido, pero pueden verse dentados.')}
                    {antialias > 1 &&
                      getAntialiasFactor(exportWidth, exportHeight, antialias) < antialias &&
                      ` ${t('A esta resolución se usa {level}x.', { level: getAntialiasFactor(exportWidth, exportHeight, antialias) })}`}
                  </p>
                  {format === 'gif' && transparent && (
                    <p className="text-[10px] text-bento-orange leading-snug flex items-start gap-1">
                      <Info className="w-3 h-3 shrink-0 mt-px" />
                      <span>
                        {t('Un GIF transparente solo tiene píxeles opacos o transparentes: el borde contra el fondo no puede suavizarse. Para bordes suaves, usa un color de fondo o WebM.')}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {/* Motion blur (video formats) */}
              {isVideo && (
                <div className="pt-3 border-t border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="motion-blur-chk"
                      checked={motionBlurOn}
                      onChange={(e) => setMotionBlurOn(e.target.checked)}
                      className="app-checkbox w-4 h-4"
                    />
                    <label htmlFor="motion-blur-chk" className="text-foreground font-medium cursor-pointer flex items-center gap-1.5">
                      <Wind className="w-3.5 h-3.5 text-bento-blue" />
                      <span>{t('Desenfoque de movimiento')}</span>
                    </label>
                  </div>
                  {motionBlurOn && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="motion-blur-range" className="text-muted-foreground">{t('Intensidad')}</label>
                        <span className="font-mono text-foreground">
                          {motionBlurIntensity}% · {Math.round(motionBlurIntensity * 3.6)}°
                        </span>
                      </div>
                      <input
                        id="motion-blur-range"
                        type="range"
                        min="10"
                        max="100"
                        step="5"
                        value={motionBlurIntensity}
                        onChange={(e) => setMotionBlurIntensity(Number(e.target.value))}
                        className="w-full accent-bento-blue h-1 bg-muted rounded-md cursor-pointer"
                        aria-label={t('Intensidad del desenfoque de movimiento')}
                      />
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        {t('Parte de cada fotograma en que el obturador queda abierto (100% = 360°). Se mezclan {samples} instantes por fotograma, así que el render tarda más.', {
                          samples: motionBlurSamples(motionBlurIntensity / 100),
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Transparency and background color */}
              <div className="pt-3 border-t border-border space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="transparent-chk"
                    checked={transparent}
                    onChange={(e) => setTransparent(e.target.checked)}
                    className="app-checkbox w-4 h-4"
                  />
                  <label htmlFor="transparent-chk" className="text-foreground font-medium cursor-pointer flex items-center gap-1.5">
                    <Grid className="w-3.5 h-3.5 text-bento-blue" />
                    <span>{t('Fondo transparente (canal alfa)')}</span>
                  </label>
                </div>

                {!transparent && (
                  <div>
                    <label className="text-muted-foreground block mb-1">{t('Color de fondo')}</label>
                    <div className="flex items-center gap-2">
                      <ColorSwatch value={backgroundColor} onChange={setBackgroundColor} title={t('Color de fondo')} className="w-8 h-8 rounded-lg!" />
                      <HexColorInput
                        value={backgroundColor}
                        onChange={setBackgroundColor}
                        className="flex-1 min-w-0 bg-card border border-border rounded-lg px-2 h-8 font-mono text-foreground"
                        ariaLabel={t('Color de fondo')}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview / render */}
          <div className="flex flex-col gap-2 min-h-72 min-w-0 md:min-h-0">{renderPreview()}</div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-border bg-secondary/40 rounded-b-2xl flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {isLive
              ? `${formatLabel} · ${project.width} × ${project.height} (${t('vectorial')})`
              : `${formatLabel} · ${exportWidth} × ${exportHeight} px`}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer"
            >
              {t('Cerrar')}
            </button>

            {isLive || render ? (
              <button
                onClick={handleDownload}
                disabled={(isSvg && !svgUrl) || (isLottie && !lottieFile)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-bento-green hover:bg-bento-green/90 active:bg-bento-green/80 disabled:opacity-50 text-white transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {t('Descargar {filename}', { filename: isSvg ? `${baseName}.svg` : isLottie ? lottieFilename : render!.filename })}
                </span>
              </button>
            ) : exporting ? (
              // One render at a time: while it runs (in this format or another) the button stops it
              <button
                onClick={handleCancelExport}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-secondary hover:bg-destructive/10 border border-border hover:border-destructive/40 text-foreground hover:text-destructive transition-colors cursor-pointer"
                data-tooltip={t('Renderizando {format}...', { format: renderingLabel ?? '' })}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t('Cancelar render {format}', { format: renderingLabel ?? '' })}</span>
              </button>
            ) : (
              <button
                onClick={handleStartExport}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-bento-blue hover:bg-bento-blue/90 active:bg-bento-blue/80 text-white transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('Renderizar')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Framed area where the preview is shown (checkerboard behind transparent exports)
const PreviewStage: React.FC<{ transparent: boolean; empty?: boolean; children: React.ReactNode }> = ({
  transparent,
  empty = false,
  children,
}) => (
  <div
    className={`flex-1 min-h-56 max-h-[60vh] rounded-xl border overflow-hidden flex items-center justify-center p-3 ${
      empty ? 'border-dashed border-border bg-secondary/40' : 'border-border bg-background'
    }`}
    style={transparent ? CHECKER : undefined}
  >
    {children}
  </div>
);
