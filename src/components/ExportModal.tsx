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
} from '@phosphor-icons/react';
import { ExportFormat, ExportSettings, Project } from '../types/animation';
import { exportProject, ExportProgress, motionBlurSamples } from '../utils/videoExporter';
import { exportToAnimatedSvg } from '../utils/svgExporter';
import { ColorSwatch } from './ColorSwatch';
import { Dropdown } from './Dropdown';

interface ExportModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

type RasterFormat = Exclude<ExportFormat, 'svg'>;

const FORMATS: { id: ExportFormat; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'gif', label: 'GIF', icon: Image, desc: 'Web y chats' },
  { id: 'webm', label: 'WebM', icon: Film, desc: 'Alfa transparente' },
  { id: 'mp4', label: 'MP4', icon: Film, desc: 'Universal' },
  { id: 'svg', label: 'SVG', icon: FileCode, desc: 'Vector animado' },
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

export const ExportModal: React.FC<ExportModalProps> = ({ project, isOpen, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('gif');
  const [fps, setFps] = useState<number>(project.fps || 60);
  const [scale, setScale] = useState<number>(project.width < 500 ? 2 : 1);
  const [transparent, setTransparent] = useState<boolean>(false);
  const [backgroundColor, setBackgroundColor] = useState<string>(project.backgroundColor || '#ffffff');
  const [loop] = useState<number>(0);
  // Motion blur (MP4 / WebM only): on / off and shutter intensity in %
  const [motionBlurOn, setMotionBlurOn] = useState<boolean>(false);
  const [motionBlurIntensity, setMotionBlurIntensity] = useState<number>(50);

  // Sync with project on open
  useEffect(() => {
    if (isOpen) {
      setFps(project.fps || 60);
      setScale(project.width < 500 ? 2 : 1);
      setBackgroundColor(project.backgroundColor || '#ffffff');
    }
  }, [isOpen, project.fps, project.width, project.backgroundColor]);

  const [renders, setRenders] = useState<Partial<Record<RasterFormat, RenderResult>>>({});
  const [errors, setErrors] = useState<Partial<Record<RasterFormat, string>>>({});
  // Only one render runs at a time; it keeps going while another format is shown
  const [exporting, setExporting] = useState<{ format: RasterFormat; progress: ExportProgress | null } | null>(null);

  // Free every render's object URL when the editor goes away
  const rendersRef = useRef(renders);
  rendersRef.current = renders;
  useEffect(() => () => Object.values(rendersRef.current).forEach((r) => r && URL.revokeObjectURL(r.url)), []);

  // SVG needs no rendering: it is generated live from the current settings
  const svgPreview = useMemo(() => {
    if (!isOpen || format !== 'svg') return null;
    const svg = exportToAnimatedSvg(project, { transparent, backgroundColor, fps });
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  }, [isOpen, format, project, transparent, backgroundColor, fps]);
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
  const raster = isSvg ? null : (format as RasterFormat);
  const render = raster ? renders[raster] : undefined;
  const error = raster ? errors[raster] : undefined;
  const isVideo = format === 'mp4' || format === 'webm';
  const motionBlur = isVideo && motionBlurOn ? motionBlurIntensity / 100 : 0;
  const isRenderingThis = !!exporting && exporting.format === format;
  const baseName = project.title.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'nori_animation';

  const handleStartExport = async () => {
    if (!raster || exporting) return;
    const target = raster;
    setExporting({ format: target, progress: null });
    setErrors((prev) => ({ ...prev, [target]: undefined }));

    const settings: ExportSettings = { format: target, fps, scale, transparent, backgroundColor, loop, motionBlur };
    try {
      const { blob, filename } = await exportProject(project, settings, (progress) =>
        setExporting({ format: target, progress })
      );
      const result: RenderResult = {
        url: URL.createObjectURL(blob),
        filename,
        blob,
        width: Math.round(project.width * scale),
        height: Math.round(project.height * scale),
        fps,
        motionBlur,
        signature: projectSignature(project),
      };
      setRenders((prev) => {
        if (prev[target]) URL.revokeObjectURL(prev[target]!.url);
        return { ...prev, [target]: result };
      });
    } catch (err: any) {
      console.error('Export error:', err);
      setErrors((prev) => ({ ...prev, [target]: err?.message || 'Error durante la exportación del archivo.' }));
    } finally {
      setExporting(null);
    }
  };

  const handleDeleteRender = () => {
    if (!raster || !render) return;
    URL.revokeObjectURL(render.url);
    setRenders((prev) => ({ ...prev, [raster]: undefined }));
  };

  const handleDownload = () => {
    if (isSvg) {
      if (svgUrl) downloadUrl(svgUrl, `${baseName}.svg`);
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
    if (isSvg) {
      return (
        <>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-foreground font-semibold">
              <Eye className="w-3.5 h-3.5 text-bento-blue" />
              Vista previa en vivo
            </span>
            {svgPreview && <span className="font-mono text-muted-foreground">{formatSize(svgPreview.size)}</span>}
          </div>
          <PreviewStage transparent={transparent}>
            {svgUrl && <img src={svgUrl} alt="Vista previa del SVG" className="max-w-full max-h-full object-contain" />}
          </PreviewStage>
          <p className="text-[11px] text-muted-foreground">
            El SVG es vectorial y se anima con CSS: no necesita renderizarse y se ve igual a cualquier tamaño.
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
                Render {formatLabel} · {render.width} × {render.height} · {render.fps} FPS
                {render.motionBlur > 0 && ` · Desenfoque ${Math.round(render.motionBlur * 100)}%`}
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-muted-foreground">{formatSize(render.blob.size)}</span>
              <button
                onClick={handleDeleteRender}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                data-tooltip="Borrar este render para repetirlo"
                aria-label="Borrar render"
              >
                <Trash className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
          <PreviewStage transparent={transparent}>
            {format === 'gif' ? (
              <img src={render.url} alt="Vista previa del GIF" className="max-w-full max-h-full object-contain" />
            ) : (
              <video src={render.url} autoPlay loop muted controls className="max-w-full max-h-full object-contain" />
            )}
          </PreviewStage>
          {outdated && (
            <p className="text-[11px] text-bento-orange flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              El proyecto cambió desde este render. Bórralo para generar uno nuevo.
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
                <span>{exporting?.progress?.stage || 'Preparando renderizado...'}</span>
              </div>
              <span className="font-mono text-bento-blue font-semibold">{exporting?.progress?.percentage || 0}%</span>
            </div>
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-bento-blue h-full transition-all duration-150 ease-out"
                style={{ width: `${exporting?.progress?.percentage || 0}%` }}
              />
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
            <p className="text-foreground font-semibold">Todavía no hay render en {formatLabel}</p>
            <p className="text-[11px] mt-1">Pulsa Renderizar para generarlo y verlo aquí antes de descargarlo.</p>
          </div>
        )}
      </PreviewStage>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] p-4 select-none animate-fade-in">
      <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-4xl flex flex-col text-foreground animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-bento-blue" />
            <h2 className="text-sm font-bold text-foreground font-heading">Exportar Animación</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content: settings on the left, preview on the right */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)] gap-5 text-xs">
          <div className="space-y-4">
            {/* Format cards, two per row */}
            <div>
              <label className="text-muted-foreground font-medium block mb-2">Formato de exportación</label>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((item) => {
                  const Icon = item.icon;
                  const isSelected = format === item.id;
                  const hasRender = item.id !== 'svg' && !!renders[item.id as RasterFormat];
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
                          data-tooltip="Ya tiene un render"
                        />
                      )}
                      {exporting?.format === item.id && (
                        <Loader2 className="absolute top-1.5 right-1.5 w-3 h-3 text-bento-blue animate-spin" />
                      )}
                      <Icon className={`w-4 h-4 mx-auto mb-1 ${isSelected ? 'text-bento-blue' : ''}`} />
                      <span className="font-semibold block text-xs">{item.label}</span>
                      <span className="text-[9px] text-muted-foreground block truncate">{item.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Resolution and FPS, each on its own line */}
            <div className="bg-secondary border border-border rounded-xl p-3 space-y-3">
              <div>
                <label className="text-muted-foreground block mb-1">Resolución</label>
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
                  disabled={isSvg}
                  title={isSvg ? 'El SVG es vectorial: no depende de la resolución' : undefined}
                  ariaLabel="Resolución"
                />
              </div>

              <div>
                <label className="text-muted-foreground block mb-1">Velocidad (FPS)</label>
                <Dropdown
                  value={fps}
                  options={FPS_OPTIONS}
                  onChange={setFps}
                  align="left"
                  className="w-full bg-card! font-mono"
                  menuClassName="w-full"
                  ariaLabel="Velocidad (FPS)"
                />
              </div>

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
                      <span>Desenfoque de movimiento</span>
                    </label>
                  </div>
                  {motionBlurOn && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="motion-blur-range" className="text-muted-foreground">Intensidad</label>
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
                        aria-label="Intensidad del desenfoque de movimiento"
                      />
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        Parte de cada fotograma en que el obturador queda abierto (100% = 360°). Se mezclan{' '}
                        {motionBlurSamples(motionBlurIntensity / 100)} instantes por fotograma, así que el render tarda más.
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
                    <span>Fondo transparente (canal alfa)</span>
                  </label>
                </div>

                {!transparent && (
                  <div>
                    <label className="text-muted-foreground block mb-1">Color de fondo</label>
                    <div className="flex items-center gap-2">
                      <ColorSwatch value={backgroundColor} onChange={setBackgroundColor} title="Color de fondo" className="w-8 h-8 rounded-lg!" />
                      <input
                        type="text"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="flex-1 min-w-0 bg-card border border-border rounded-lg px-2 h-8 font-mono text-foreground"
                        aria-label="Color de fondo"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview / render */}
          <div className="flex flex-col gap-2 min-h-72 min-w-0">{renderPreview()}</div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-border bg-secondary/40 rounded-b-2xl flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {isSvg ? `SVG · ${project.width} × ${project.height} (vectorial)` : `${formatLabel} · ${exportWidth} × ${exportHeight} px`}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            {isSvg || render ? (
              <button
                onClick={handleDownload}
                disabled={isSvg && !svgUrl}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-bento-green hover:bg-bento-green/90 active:bg-bento-green/80 disabled:opacity-50 text-white transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar {isSvg ? `${baseName}.svg` : render!.filename}</span>
              </button>
            ) : (
              <button
                onClick={handleStartExport}
                disabled={!!exporting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-bento-blue hover:bg-bento-blue/90 active:bg-bento-blue/80 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Renderizando {renderingLabel}...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Renderizar</span>
                  </>
                )}
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
