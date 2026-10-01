import React, { useEffect, useRef, useState } from 'react';
import { CaretDown as ChevronDown, Check } from '@phosphor-icons/react';

export interface DropdownOption<T> {
  value: T;
  label: React.ReactNode;
  // Optional content shown before the label (e.g. a curve thumbnail)
  icon?: React.ReactNode;
  description?: string;
  // Draws a divider above the option
  separatorBefore?: boolean;
}

interface DropdownProps<T> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  // Content of the trigger button; defaults to the selected option's icon and label
  triggerLabel?: React.ReactNode;
  // Decides which option shows the check mark (defaults to strict equality)
  isSelected?: (option: T, value: T) => boolean;
  align?: 'left' | 'right';
  className?: string;
  menuClassName?: string;
  optionClassName?: string;
  title?: string;
  ariaLabel?: string;
}

// Button + floating menu with a check on the selected option. Closes on selection,
// outside click or Escape.
export function Dropdown<T>({
  value,
  options,
  onChange,
  triggerLabel,
  isSelected = (option, current) => option === current,
  align = 'right',
  className = '',
  menuClassName = 'w-28',
  optionClassName = 'font-mono',
  title,
  ariaLabel,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => isSelected(o.value, value));

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1 px-2 h-8 bg-secondary border border-border rounded-lg text-foreground text-[11px] cursor-pointer ${className}`}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {triggerLabel ?? (
          <span className="flex items-center gap-1.5 min-w-0">
            {selected?.icon}
            <span className="truncate">{selected?.label}</span>
          </span>
        )}
        <ChevronDown className="w-2.5 h-2.5 text-muted-foreground shrink-0 ml-auto" />
      </button>

      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 bg-popover border border-border rounded-xl shadow-card-hover py-1 z-50 text-foreground ${menuClassName}`}
          role="listbox"
        >
          {options.map((option, idx) => {
            const active = isSelected(option.value, value);
            return (
              <React.Fragment key={idx}>
                {option.separatorBefore && <div className="my-1 border-t border-border" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    onChange(option.value);
                  }}
                  title={option.description}
                  className={`w-full px-3 py-1 flex items-center justify-between gap-2 hover:bg-accent text-left text-xs ${optionClassName}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {active && <Check className="w-3 h-3 text-bento-blue shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
