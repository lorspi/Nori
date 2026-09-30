import React, { useState } from 'react';
import {
  X,
  Download,
  FilmStrip as Film,
  Image,
  FileCode,
  Stack as Layers,
  CheckCircle as CheckCircle2,
  WarningCircle as AlertCircle,
  CircleNotch as Loader2,
  Sparkle as Sparkles,
  Checkerboard as Grid,
} from '@phosphor-icons/react';
import { ExportFormat, ExportSettings, Project } from '../types/animation';
import { exportProject, ExportProgress } from '../utils/videoExporter';

interface ExportModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ project, isOpen, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('gif');
  const [fps, setFps] = useState<number>(project.fps || 60);
  const [scale, setScale] = useState<number>(project.width < 500 ? 2 : 1);
  const [transparent, setTransparent] = useState<boolean>(false);
  const [backgroundColor, setBackgroundColor] = useState<string>(project.backgroundColor || '#ffffff');
  const [loop, setLoop] = useState<number>(0);

  // Sync with project on open
  React.useEffect(() => {
    if (isOpen) {
      setFps(project.fps || 60);
      setScale(project.width < 500 ? 2 : 1);
      setBackgroundColor(project.backgroundColor || '#ffffff');
    }
  }, [isOpen, project.fps, project.width, project.backgroundColor]);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<{ url: string; filename: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(null);
    setResult(null);
    setError(null);

    const settings: ExportSettings = {
      format,
      fps,
      scale,
      transparent,
      backgroundColor,
      loop,
    };

    try {
      const { blob, filename } = await exportProject(project, settings, (p) => {
        setProgress(p);
      });

      const url = URL.createObjectURL(blob);
      setResult({ url, filename, blob });
    } catch (err: any) {
      console.error('Export error:', err);
      setError(err?.message || 'Error durante la exportación del archivo.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportWidth = Math.round(project.width * scale);
  const exportHeight = Math.round(project.height * scale);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] p-4 select-none animate-fade-in">
      <div className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-xl overflow-hidden text-foreground animate-scale-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-bento-blue" />
            <h2 className="text-sm font-bold text-foreground font-heading">Exportar Animación</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Format Selection Cards */}
          <div>
            <label className="text-muted-foreground font-medium block mb-2">Formato de Exportación</label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: 'gif', label: 'GIF', icon: Image, desc: 'Web & Chats' },
                { id: 'webm', label: 'WebM', icon: Film, desc: 'Alfa transparente' },
                { id: 'mp4', label: 'MP4', icon: Film, desc: 'Universal' },
                { id: 'svg', label: 'SVG', icon: FileCode, desc: 'Vector animado' },
                { id: 'json', label: 'JSON', icon: Layers, desc: 'Proyecto Nori' },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = format === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setFormat(item.id as ExportFormat);
                      setResult(null);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-bento-blue/15 border-bento-blue text-foreground shadow-sm'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mx-auto mb-1 ${isSelected ? 'text-bento-blue' : ''}`} />
                    <span className="font-semibold block text-xs">{item.label}</span>
                    <span className="text-[9px] text-muted-foreground block truncate">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration Settings */}
          {format !== 'json' && (
            <div className="bg-secondary border border-border rounded-xl p-3 space-y-3">
              {/* Resolution & FPS */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground block mb-1">Resolución</label>
                  <select
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full bg-card border border-input rounded-lg px-2.5 py-1.5 font-mono text-foreground focus:outline-none focus:border-ring"
                  >
                    <option value={0.5}>0.5x ({Math.round(project.width * 0.5)} × {Math.round(project.height * 0.5)})</option>
                    <option value={1}>1.0x ({project.width} × {project.height} px)</option>
                    <option value={1.5}>1.5x ({Math.round(project.width * 1.5)} × {Math.round(project.height * 1.5)})</option>
                    <option value={2}>2.0x ({project.width * 2} × {project.height * 2} px - HD)</option>
                    <option value={3}>3.0x ({project.width * 3} × {project.height * 3} px - QHD)</option>
                    <option value={4}>4.0x ({project.width * 4} × {project.height * 4} px - 4K)</option>
                  </select>
                </div>

                <div>
                  <label className="text-muted-foreground block mb-1">Velocidad (FPS)</label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-full bg-card border border-input rounded-lg px-2.5 py-1.5 font-mono text-foreground focus:outline-none focus:border-ring"
                  >
                    <option value={24}>24 FPS (Cinemático)</option>
                    <option value={30}>30 FPS (Estándar)</option>
                    <option value={60}>60 FPS (Ultra fluido)</option>
                  </select>
                </div>
              </div>

              {/* Transparency and Background Options */}
              <div className="pt-2 border-t border-border flex items-center justify-between">
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
                    <span>Fondo transparente (Canal alfa)</span>
                  </label>
                </div>

                {!transparent && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-[11px]">Color:</span>
                    <input
                      type="color"
                      value={backgroundColor.startsWith('#') ? backgroundColor : '#ffffff'}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="w-6 h-6 rounded-md border border-border bg-transparent cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress / Status Bar */}
          {isExporting && (
            <div className="bg-secondary border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-foreground">
                  <Loader2 className="w-3.5 h-3.5 text-bento-blue animate-spin" />
                  <span>{progress?.stage || 'Preparando renderizado...'}</span>
                </div>
                <span className="font-mono text-bento-blue font-semibold">
                  {progress?.percentage || 0}%
                </span>
              </div>
              <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-bento-blue h-full transition-all duration-150 ease-out"
                  style={{ width: `${progress?.percentage || 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex items-start gap-2 text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 text-destructive mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Result & Preview */}
          {result && (
            <div className="bg-bento-green-light border border-bento-green/30 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-bento-green">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold text-xs">¡Archivo generado con éxito!</span>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {(result.blob.size / 1024).toFixed(1)} KB
                </span>
              </div>

              {/* Live Preview of generated export */}
              <div className="max-h-48 overflow-hidden rounded-lg border border-border bg-background flex items-center justify-center p-2">
                {format === 'gif' && (
                  <img
                    src={result.url}
                    alt="GIF Export Preview"
                    className="max-h-40 object-contain rounded-md"
                  />
                )}
                {(format === 'webm' || format === 'mp4') && (
                  <video
                    src={result.url}
                    autoPlay
                    loop
                    muted
                    controls
                    className="max-h-40 object-contain rounded-md"
                  />
                )}
                {format === 'svg' && (
                  <div className="text-center py-4">
                    <FileCode className="w-8 h-8 text-bento-blue mx-auto mb-2" />
                    <p className="text-foreground text-xs">SVG Vectorial con animaciones CSS integrado listo para incrustar.</p>
                  </div>
                )}
                {format === 'json' && (
                  <div className="text-center py-4">
                    <Layers className="w-8 h-8 text-bento-blue mx-auto mb-2" />
                    <p className="text-foreground text-xs">Estructura completa de proyecto exportada en JSON.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-border bg-secondary/40 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground font-mono">
            {format.toUpperCase()} · {exportWidth} × {exportHeight} px
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            {!result ? (
              <button
                onClick={handleStartExport}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-bento-blue hover:bg-bento-blue/90 active:bg-bento-blue/80 disabled:opacity-50 text-white transition-colors cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Renderizando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Iniciar Exportación</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-bento-green hover:bg-bento-green/90 active:bg-bento-green/80 text-white transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar {result.filename}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
