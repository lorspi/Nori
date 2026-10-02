import React, { useRef, useState } from 'react';

// Numbers are shown with a decimal comma; typing a point also works and turns into a comma
export const formatDecimal = (value: number) => String(value).replace('.', ',');

// Keeps a leading minus, digits and one decimal comma ("." is turned into ",")
const sanitize = (text: string) => {
  const cleaned = text.replace(/\./g, ',').replace(/[^0-9,-]/g, '');
  const negative = cleaned.startsWith('-');
  const [whole, ...decimals] = cleaned.replace(/-/g, '').split(',');
  return `${negative ? '-' : ''}${whole}${decimals.length > 0 ? `,${decimals.join('')}` : ''}`;
};

// null while the text isn't a number yet ("", "-", ",")
export const parseDecimal = (text: string): number | null => {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> {
  value: number;
  // Called while typing with every valid number, and with the value clamped to min / max on blur
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  // Arrow up / down step (Shift: 10 times)
  step?: number;
  // Apply the value only on Enter / blur, not while typing (e.g. the project duration, where
  // the "0" typed on the way to "0,8" would cut every layer)
  commitOnBlur?: boolean;
  // Decimals always shown (e.g. 2 for a time: "1,50")
  decimals?: number;
}

// Numeric field that accepts a point or a comma as the decimal separator.
// data-numeric lets Space keep toggling playback while it has the focus.
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  commitOnBlur = false,
  decimals,
  onBlur,
  onKeyDown,
  ...rest
}) => {
  // Text being typed (null when the field isn't being edited)
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const clamp = (n: number) => {
    let next = n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      data-numeric=""
      value={draft ?? (decimals === undefined ? formatDecimal(value) : value.toFixed(decimals).replace('.', ','))}
      onChange={(e) => {
        const text = sanitize(e.target.value);
        setDraft(text);
        const n = parseDecimal(text);
        if (n !== null && !commitOnBlur) onChange(n);
      }}
      onBlur={(e) => {
        const n = draft === null || cancelledRef.current ? null : parseDecimal(draft);
        cancelledRef.current = false;
        if (n !== null && (commitOnBlur ? clamp(n) !== value : clamp(n) !== n)) onChange(clamp(n));
        setDraft(null);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          // Discards what was typed when it isn't applied yet
          cancelledRef.current = true;
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const stepDecimals = (String(step).split('.')[1] || '').length;
          const current = (draft !== null ? parseDecimal(draft) : null) ?? value;
          const delta = step * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          const next = clamp(Number((current + delta).toFixed(stepDecimals)));
          setDraft(formatDecimal(next));
          onChange(next);
        }
        onKeyDown?.(e);
      }}
    />
  );
};
