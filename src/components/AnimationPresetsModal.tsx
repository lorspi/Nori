import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkle, X } from '@phosphor-icons/react';
import {
  ANIMATION_PRESETS,
  AnimationPreset,
  PRESET_CATEGORIES,
  PresetCategory,
  buildPresetPreview,
  planPresetSpans,
} from '../utils/animationPresets';
import { getLayerPropertiesAtTime } from '../utils/interpolator';
import { Dropdown } from './Dropdown';
import { t } from '../i18n';

interface AnimationPresetsModalProps {
  isOpen: boolean;
  // Names of the layers the animation is added to
  targetNames: string[];
  currentTime: number;
  projectDuration: number;
  fps: number;
  onClose: () => void;
  onApply: (preset: AnimationPreset, length: number) => void;
}

const LENGTHS = [0.3, 0.5, 0.8, 1, 1.5, 2];
const DEFAULT_LENGTH: Record<PresetCategory, number> = { in: 0.5, out: 0.5, inOut: 0.5, emphasis: 1 };
const PREVIEW_DISTANCE = 30;
const fmt = (seconds: number) => `${seconds.toFixed(2)} s`;

// Thumbnail: a square animated with the preset itself (same interpolation as the editor)
// while the card is hovered or focused
const PresetPreview: React.FC<{ preset: AnimationPreset; active: boolean }> = ({ preset, active }) => {
  const preview = useMemo(() => buildPresetPreview(preset, PREVIEW_DISTANCE), [preset]);
  const [time, setTime] = useState(preview.restTime);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setTime(preview.restTime);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      setTime(((now - start) / 1000) % preview.total);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, preview]);

  const p = getLayerPropertiesAtTime(preview.layer, time);
  const blur = Number(p.blur) || 0;
  return (
    <div className="relative h-16 w-full overflow-hidden rounded-lg bg-secondary border border-border flex items-center justify-center">
      <div
        style={{
          transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg) scale(${p.scaleX}, ${p.scaleY})`,
          opacity: Math.max(0, Math.min(1, p.opacity)),
          filter: blur > 0 ? `blur(${(blur * 0.5).toFixed(2)}px)` : undefined,
        }}
        className="w-6 h-6 rounded-md bg-bento-blue shadow-sm"
      />
    </div>
  );
};

export const AnimationPresetsModal: React.FC<AnimationPresetsModalProps> = ({
  isOpen,
  targetNames,
  currentTime,
  projectDuration,
  fps,
  onClose,
  onApply,
}) => {
  const [category, setCategory] = useState<PresetCategory>('in');
  const [lengths, setLengths] = useState<Record<PresetCategory, number>>(DEFAULT_LENGTH);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setHovered(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const length = lengths[category];
  const presets = ANIMATION_PRESETS.filter((p) => p.category === category);
  const spans = planPresetSpans(category, currentTime, length, projectDuration, fps);
  const subtitle =
    targetNames.length === 1
      ? t('Pasa el ratón para ver la animación y haz clic para añadirla a «{name}»', { name: targetNames[0] })
      : t('Pasa el ratón para ver la animación y haz clic para añadirla a {count} capas', { count: targetNames.length });
  const timing =
    category === 'inOut'
      ? t('Entrada de {inStart} a {inEnd} · salida de {outStart} a {outEnd}', {
          inStart: fmt(spans.in!.start),
          inEnd: fmt(spans.in!.end),
          outStart: fmt(spans.out!.start),
          outEnd: fmt(spans.out!.end),
        })
      : (() => {
          const span = spans.in ?? spans.out ?? spans.main!;
          return t('De {start} a {end}', { start: fmt(span.start), end: fmt(span.end) });
        })();

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
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-bento-blue/15 border border-bento-blue/30 flex items-center justify-center text-bento-blue">
              <Sparkle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground font-heading">{t('Animaciones predeterminadas')}</h2>
              <span className="text-[11px] text-muted-foreground block truncate">{subtitle}</span>
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

        {/* Category tabs + duration */}
        <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex bg-secondary rounded-lg p-0.5 border border-border" role="tablist">
            {PRESET_CATEGORIES.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  category === c.id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-tooltip={t(c.hint)}
              >
                {t(c.label)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{category === 'inOut' ? t('Duración de cada parte') : t('Duración')}</span>
            <Dropdown
              value={length}
              options={LENGTHS.map((l) => ({ value: l, label: `${l} s` }))}
              onChange={(l) => setLengths((prev) => ({ ...prev, [category]: l }))}
              ariaLabel={t('Duración de la animación')}
              className="w-24"
            />
          </div>
        </div>

        {/* Presets */}
        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onApply(preset, length)}
                onMouseEnter={() => setHovered(preset.id)}
                onMouseLeave={() => setHovered((h) => (h === preset.id ? null : h))}
                onFocus={() => setHovered(preset.id)}
                onBlur={() => setHovered((h) => (h === preset.id ? null : h))}
                className="group p-1.5 rounded-xl border border-transparent hover:border-bento-blue/50 hover:bg-bento-blue/5 focus-visible:outline-none focus-visible:border-bento-blue transition-colors cursor-pointer text-left"
              >
                <PresetPreview preset={preset} active={hovered === preset.id} />
                <span className="mt-1.5 block px-0.5 text-[11px] font-medium text-foreground group-hover:text-bento-blue truncate">
                  {t(preset.name)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-secondary/40 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{timing}</span>
          <span className="hidden sm:inline">{t('Reemplaza los fotogramas clave de los mismos parámetros en ese tramo')}</span>
        </div>
      </div>
    </div>
  );
};
