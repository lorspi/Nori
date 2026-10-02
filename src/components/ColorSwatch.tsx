import React, { useCallback, useEffect, useRef, useState } from 'react';
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

// Keeps only hex digits (at most 6) behind a "#"; an empty field stays empty
export function sanitizeHexInput(text: string): string {
  const digits = text.replace(/[^0-9a-f]/gi, '').slice(0, 6);
  return digits ? `#${digits}` : '';
}

// Completes a partial hex value following its pattern: "f" → #ffffff, "c0" → #c0c0c0,
// "abc" → #aabbcc (CSS shorthand); 4 or 5 digits repeat from the start. null when empty.
export function completeHexColor(text: string): string | null {
  const digits = sanitizeHexInput(text).slice(1);
  if (!digits) return null;
  if (digits.length === 3) return `#${digits.split('').map((c) => c + c).join('')}`;
  return `#${digits.repeat(6).slice(0, 6)}`;
}

interface HexColorInputProps {
  value: string;
  onChange: (color: string, recordUndo: boolean) => void;
  // Committed when the field is emptied (e.g. "transparent"); without it, an empty field reverts
  emptyValue?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

// Hex text field: adds the "#", accepts only hex digits (up to 6) and, when it loses focus or on
// Enter, completes a partial value. Each visit to the field is one undo step.
export const HexColorInput: React.FC<HexColorInputProps> = ({
  value,
  onChange,
  emptyValue,
  placeholder,
  className = '',
  ariaLabel,
}) => {
  const session = useUndoSession();
  const shown = isNoColor(value) ? '' : value;
  // Text being typed (null while the field isn't being edited)
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (color: string) => {
    if (color.toLowerCase() !== value.toLowerCase()) onChange(color, session.take());
  };

  // Escape leaves the field without applying the text being typed
  const cancelRef = useRef(false);

  const finish = () => {
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    if (draft === null || cancelled) {
      setDraft(null);
      return;
    }
    const complete = completeHexColor(draft);
    if (complete) commit(complete);
    else if (emptyValue !== undefined) commit(emptyValue);
    setDraft(null);
  };

  return (
    <input
      type="text"
      value={draft ?? shown}
      placeholder={placeholder}
      spellCheck={false}
      maxLength={7}
      onFocus={session.begin}
      onChange={(e) => {
        const next = sanitizeHexInput(e.target.value);
        setDraft(next);
        // A full value applies while typing
        if (next.length === 7) commit(next);
      }}
      onPaste={(e) => {
        // Pasted text is cleaned before the length limit cuts it ("ff00aa", "#FF00AA80"…)
        e.preventDefault();
        const input = e.currentTarget;
        const text = input.value;
        const start = input.selectionStart ?? text.length;
        const end = input.selectionEnd ?? text.length;
        const next = sanitizeHexInput(text.slice(0, start) + e.clipboardData.getData('text') + text.slice(end));
        setDraft(next);
        if (next.length === 7) commit(next);
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          cancelRef.current = true;
          e.currentTarget.blur();
        }
      }}
      className={className}
      aria-label={ariaLabel}
    />
  );
};
