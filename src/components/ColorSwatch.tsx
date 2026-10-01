import React, { useCallback, useEffect, useRef } from 'react';
import { parseColor } from '../utils/interpolator';

// Hex value for the native color picker (it only understands #rrggbb)
export function toHexColor(color: string, fallback = '#0084ff'): string {
  if (!color || color === 'transparent') return fallback;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase();
  if (color.startsWith('#') || color.startsWith('rgb')) {
    const { r, g, b } = parseColor(color);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return fallback;
}

export const isNoColor = (color: string | undefined) => !color || color === 'transparent';

// Checkerboard behind the color, so translucent colors and "no color" read clearly
const CHECKER: React.CSSProperties = {
  backgroundImage: 'conic-gradient(#d4d4d8 25%, #ffffff 0 50%, #d4d4d8 0 75%, #ffffff 0)',
  backgroundSize: '8px 8px',
};

// Groups a run of changes (dragging inside the color picker, typing a hex value) into one
// undo step: take() is true only for the first change after begin().
export function useUndoSession() {
  const pendingRef = useRef(true);
  const begin = useCallback(() => {
    pendingRef.current = true;
  }, []);
  const take = useCallback(() => {
    const first = pendingRef.current;
    pendingRef.current = false;
    return first;
  }, []);
  return { begin, take };
}

interface ColorSwatchProps {
  value: string;
  // recordUndo is true only for the first change of each pick, so a pick undoes in one step
  onChange: (color: string, recordUndo: boolean) => void;
  title?: string;
  className?: string;
}

// Color square filled edge to edge with the color; clicking it opens the native picker
export const ColorSwatch: React.FC<ColorSwatchProps> = ({ value, onChange, title, className = 'w-7 h-7' }) => {
  const none = isNoColor(value);
  const session = useUndoSession();
  const inputRef = useRef<HTMLInputElement>(null);

  // The native "change" event fires when the picker closes: the next pick is a new undo step
  // (React's onChange follows "input", which fires on every move inside the picker)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.addEventListener('change', session.begin);
    return () => input.removeEventListener('change', session.begin);
  }, [session.begin]);

  return (
    <label
      onPointerDown={session.begin}
      className={`relative shrink-0 rounded-md border border-border overflow-hidden cursor-pointer ${className}`}
      style={CHECKER}
      data-tooltip={title}
    >
      {none ? (
        // Red diagonal: no color
        <span
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top right, transparent calc(50% - 1px), #ef4444 calc(50% - 1px), #ef4444 calc(50% + 1px), transparent calc(50% + 1px))',
          }}
        />
      ) : (
        <span className="absolute inset-0" style={{ background: value }} />
      )}
      <input
        type="color"
        value={toHexColor(value)}
        onFocus={session.begin}
        onChange={(e) => onChange(e.target.value, session.take())}
        ref={inputRef}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={title}
      />
    </label>
  );
};
