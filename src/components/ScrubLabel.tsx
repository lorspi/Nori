import React, { useRef } from 'react';
import { t } from '../i18n';

interface ScrubLabelProps {
  value: number;
  onChange: (value: number) => void;
  // Called once when a drag actually starts (used to record a single undo step)
  onScrubStart?: () => void;
  // Value change per dragged pixel (Shift multiplies it by 10)
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

// Figma-style field label: dragging it horizontally increases (right) or decreases (left) the value
export const ScrubLabel: React.FC<ScrubLabelProps> = ({
  value,
  onChange,
  onScrubStart,
  step = 1,
  min,
  max,
  className = '',
  title,
  children,
}) => {
  // Always call the latest handlers while a drag is in progress
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startValue = value;
    const decimals = (String(step).split('.')[1] || '').length;
    const previousCursor = document.body.style.cursor;
    let started = false;

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!started) {
        if (Math.abs(dx) < 2) return;
        started = true;
        onScrubStart?.();
        // Keep the arrows cursor even when the pointer leaves the label
        document.body.style.cursor = 'ew-resize';
      }
      let next = startValue + dx * step * (ev.shiftKey ? 10 : 1);
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      onChangeRef.current(Number(next.toFixed(decimals)));
    };

    const handleUp = () => {
      el.removeEventListener('pointermove', handleMove);
      el.removeEventListener('pointerup', handleUp);
      el.removeEventListener('pointercancel', handleUp);
      document.body.style.cursor = previousCursor;
    };

    el.addEventListener('pointermove', handleMove);
    el.addEventListener('pointerup', handleUp);
    el.addEventListener('pointercancel', handleUp);
  };

  return (
    <span
      onPointerDown={handlePointerDown}
      data-tooltip={title ?? t('Arrastra a los lados para cambiar el valor. Más rápido con')}
      data-shortcut={title ? undefined : 'Shift'}
      className={`cursor-ew-resize touch-none select-none ${className}`}
    >
      {children}
    </span>
  );
};
