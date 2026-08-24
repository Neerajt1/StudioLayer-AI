import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export type StudioCompactSelectOption<T extends string | number> = {
  value: T;
  label: string;
  /** Secondary line (descriptions, credit copy). */
  description?: string;
  unavailable?: boolean;
  testId?: string;
};

type StudioCompactSelectProps<T extends string | number> = {
  label: string;
  value: T;
  /** Closed-state summary (selected label + optional credit cue). */
  triggerLabel: string;
  options: ReadonlyArray<StudioCompactSelectOption<T>>;
  disabled?: boolean;
  onChange: (value: T) => void;
  className?: string;
  /** Hide the visible label when a parent section already names the control. */
  hideLabel?: boolean;
  /** Optional content below the trigger (e.g. Custom Campaign stepper). */
  below?: ReactNode;
  'aria-label'?: string;
};

export function StudioCompactSelect<T extends string | number>({
  label,
  value,
  triggerLabel,
  options,
  disabled = false,
  onChange,
  className,
  hideLabel = false,
  below,
  'aria-label': ariaLabel,
}: StudioCompactSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const width = triggerRef.current?.offsetWidth;
    if (width) setMenuWidth(width);
  }, [open]);

  const selectOption = (next: T) => {
    onChange(next);
    setOpen(false);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className={cn('sl-compact-select', className)}>
      <p className={cn('sl-compact-select-label', hideLabel && 'sr-only')}>{label}</p>
      <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={ariaLabel ?? label}
            className={cn('sl-compact-select-trigger', open && 'is-open')}
            onKeyDown={handleTriggerKeyDown}
          >
            <span className="sl-compact-select-trigger-value">{triggerLabel}</span>
            <ChevronDown className="sl-compact-select-chevron" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="sl-compact-select-menu w-auto max-w-none p-1 shadow-none"
          style={
            menuWidth
              ? {
                  minWidth: Math.max(menuWidth, 14 * 16),
                  width: 'max-content',
                  maxWidth: 'min(22rem, calc(100vw - 2rem))',
                }
              : undefined
          }
          onOpenAutoFocus={(event) => {
            // Keep the open menu visually neutral — do not paint a focused/selected row.
            event.preventDefault();
            document.getElementById(listId)?.focus();
          }}
        >
          <div
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel ?? label}
            className="sl-compact-select-list"
          >
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  id={`${listId}-option-${String(opt.value)}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={opt.testId}
                  className={cn(
                    'sl-compact-select-option',
                    opt.unavailable && 'is-unavailable',
                  )}
                  onClick={() => selectOption(opt.value)}
                >
                  <span className="sl-compact-select-option-label">{opt.label}</span>
                  {opt.description ? (
                    <span className="sl-compact-select-option-desc">{opt.description}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {below}
    </div>
  );
}
