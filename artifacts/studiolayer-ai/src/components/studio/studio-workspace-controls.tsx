import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function useStudioPressFeedback(disabled?: boolean) {
  const [pressed, setPressed] = useState(false);

  return {
    pressed,
    pressHandlers: {
      onPointerDown: () => {
        if (!disabled) setPressed(true);
      },
      onPointerUp: () => setPressed(false),
      onPointerLeave: () => setPressed(false),
      onPointerCancel: () => setPressed(false),
    },
  };
}

type StudioWorkspaceButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'ghost' | 'icon';
  fullWidth?: boolean;
};

export function StudioWorkspaceButton({
  loading = false,
  variant = 'outline',
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: StudioWorkspaceButtonProps) {
  const isDisabled = disabled || loading;
  const { pressed, pressHandlers } = useStudioPressFeedback(isDisabled);

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'sl-studio-btn',
        variant === 'primary' && 'sl-studio-btn--primary',
        variant === 'ghost' && 'sl-studio-btn--ghost',
        variant === 'icon' && 'sl-studio-btn--icon',
        fullWidth && 'w-full',
        pressed && 'is-pressed',
        loading && 'is-loading',
        className,
      )}
      {...pressHandlers}
      {...props}
    >
      {loading && <span className="sl-studio-btn-spinner" aria-hidden />}
      {children}
    </button>
  );
}

type StudioRefinementChipProps = {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function StudioRefinementChip({
  label,
  selected,
  disabled,
  onSelect,
}: StudioRefinementChipProps) {
  const { pressed, pressHandlers } = useStudioPressFeedback(disabled);

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'sl-studio-chip',
        selected && 'is-selected',
        pressed && 'is-pressed',
      )}
      {...pressHandlers}
    >
      {selected ? <span className="sl-studio-chip-indicator" aria-hidden /> : null}
      {label}
    </button>
  );
}

type StudioToggleOptionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean;
  tone?: 'solid' | 'accent';
  children: ReactNode;
};

export function StudioToggleOption({
  selected,
  tone = 'solid',
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: StudioToggleOptionProps) {
  const { pressed, pressHandlers } = useStudioPressFeedback(disabled);

  return (
    <button
      type={type}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        'sl-studio-toggle',
        tone === 'accent' && 'sl-studio-toggle--accent',
        selected && 'is-selected',
        pressed && 'is-pressed',
        className,
      )}
      {...pressHandlers}
      {...props}
    >
      {children}
    </button>
  );
}
