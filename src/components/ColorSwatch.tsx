import React from 'react';
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

interface ColorSwatchProps {
  value: string;
  onChange: (color: string) => void;
  title?: string;
  className?: string;
}

// Color square filled edge to edge with the color; clicking it opens the native picker
export const ColorSwatch: React.FC<ColorSwatchProps> = ({ value, onChange, title, className = 'w-7 h-7' }) => {
  const none = isNoColor(value);
  return (
    <label
      className={`relative shrink-0 rounded-md border border-border overflow-hidden cursor-pointer ${className}`}
      style={CHECKER}
      title={title}
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
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={title}
      />
    </label>
  );
};
