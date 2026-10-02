import React, { useEffect, useRef, useState } from 'react';
import { AnimatableProperty } from '../types/animation';
import { PROPERTY_META } from '../utils/animationTracks';
import { ColorSwatch, isNoColor, toHexColor } from './ColorSwatch';
import { formatDecimal, parseDecimal, toDecimalSeparator } from './NumberInput';
import { t } from '../i18n';

// Properties stored as a fraction (0–1, or 1 = 100 % scale) and shown in %
const PERCENT_PROPERTIES = new Set<AnimatableProperty>(['scaleX', 'scaleY', 'opacity', 'fillOpacity', 'strokeOpacity']);
// Never below zero
const NON_NEGATIVE = new Set<AnimatableProperty>(['opacity', 'fillOpacity', 'strokeOpacity', 'strokeWidth', 'radius', 'width', 'height', 'blur']);
// At most 100 %
const MAX_100 = new Set<AnimatableProperty>(['opacity', 'fillOpacity', 'strokeOpacity']);

interface TrackValueProps {
  property: AnimatableProperty;
  // Value of the property at the current time
  value: number | string | undefined;
  // recordUndo is false while dragging (the drag start records one undo step)
  onChange: (value: number | string, recordUndo: boolean) => void;
  onScrubStart?: () => void;
}

const clampDisplay = (property: AnimatableProperty, v: number) => {
  let next = v;
  if (NON_NEGATIVE.has(property)) next = Math.max(0, next);
  if (MAX_100.has(property)) next = Math.min(100, next);
  return next;
};


// Value of an animated parameter in its timeline row (as in After Effects): drag it to the sides
// to change it, or click to type a new one. Colors open the color picker.
export const TrackValue: React.FC<TrackValueProps> = ({ property, value, onChange, onScrubStart }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape discards the draft even if the field fires blur as it goes away
  const cancelledRef = useRef(false);
  // Always call the latest handler while a drag is in progress
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (draft === null) return;
    cancelledRef.current = false;
    inputRef.current?.select();
  }, [draft !== null]);

  if (property === 'fill' || property === 'stroke') {
    const color = typeof value === 'string' ? value : '';
    return (
      <span className="flex items-center gap-1 min-w-0">
        <span className="font-mono text-foreground truncate">{isNoColor(color) ? '—' : toHexColor(color)}</span>
        <ColorSwatch
          value={color}
          onChange={(c, recordUndo) => onChange(c, recordUndo)}
          title={t(PROPERTY_META[property].label)}
          className="w-3.5 h-3.5 rounded-sm"
        />
      </span>
    );
  }

  if (typeof value !== 'number') return null;

  const percent = PERCENT_PROPERTIES.has(property);
  const unit = PROPERTY_META[property].unit;
  const shown = percent ? Math.round(value * 100) : Number(value.toFixed(1));
  const toValue = (display: number) => {
    const clamped = clampDisplay(property, display);
    return percent ? clamped / 100 : Number(clamped.toFixed(2));
  };

  const commit = () => {
    if (draft === null || cancelledRef.current) return;
    const parsed = parseDecimal(draft);
    setDraft(null);
    if (parsed !== null && toValue(parsed) !== value) onChange(toValue(parsed), true);
  };

  if (draft !== null) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        // A point or a comma is turned into the language's decimal separator
        onChange={(e) => setDraft(toDecimalSeparator(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            cancelledRef.current = true;
            setDraft(null);
          }
        }}
        aria-label={t(PROPERTY_META[property].label)}
        className="w-14 h-5 bg-card border border-bento-blue rounded px-1 text-right font-mono text-foreground focus:outline-none"
      />
    );
  }

  // Drag horizontally to change the value; a click without dragging starts typing
  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startValue = shown;
    const previousCursor = document.body.style.cursor;
    let started = false;

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!started) {
        if (Math.abs(dx) < 2) return;
        started = true;
        onScrubStart?.();
        document.body.style.cursor = 'ew-resize';
      }
      onChangeRef.current(toValue(startValue + dx * (ev.shiftKey ? 10 : 1)), false);
    };

    const handleUp = () => {
      el.removeEventListener('pointermove', handleMove);
      el.removeEventListener('pointerup', handleUp);
      el.removeEventListener('pointercancel', handleUp);
      document.body.style.cursor = previousCursor;
      if (!started) setDraft(formatDecimal(shown));
    };

    el.addEventListener('pointermove', handleMove);
    el.addEventListener('pointerup', handleUp);
    el.addEventListener('pointercancel', handleUp);
  };

  return (
    <span
      onPointerDown={handlePointerDown}
      className="font-mono text-bento-blue cursor-ew-resize touch-none select-none hover:underline decoration-dotted underline-offset-2"
      data-tooltip={t('Arrastra a los lados para cambiar el valor o haz clic para escribirlo. Más rápido con')}
      data-shortcut="Shift"
    >
      {formatDecimal(shown)}
      {unit && <span className="text-muted-foreground">{unit === 'px' ? ' px' : unit}</span>}
    </span>
  );
};
