import {
  getPoseFigureImageStyle,
  getPoseFigureLayout,
  getPoseReferenceImageUrl,
} from '@/lib/pose-library-display';
import { cn } from '@/lib/utils';

interface DirectShootMobileTileProps {
  poseName: string;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function DirectShootMobileTile({
  poseName,
  selected,
  disabled,
  onToggle,
}: DirectShootMobileTileProps) {
  const imageUrl = getPoseReferenceImageUrl(poseName);
  const figureLayout = getPoseFigureLayout(poseName);

  return (
    <button
      type="button"
      className={cn(
        'sl-direct-shoot-mobile-tile',
        selected && 'sl-direct-shoot-mobile-tile--selected',
        disabled && !selected && 'sl-direct-shoot-mobile-tile--disabled',
      )}
      aria-pressed={selected}
      aria-label={selected ? `${poseName}, selected` : poseName}
      disabled={disabled && !selected}
      onClick={onToggle}
    >
      <span className="sl-direct-shoot-mobile-tile-canvas">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="sl-direct-shoot-mobile-tile-image"
            style={figureLayout ? getPoseFigureImageStyle(figureLayout) : undefined}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="sl-direct-shoot-mobile-tile-placeholder" aria-hidden />
        )}
      </span>
      {selected ? (
        <span className="sl-direct-shoot-mobile-tile-check" aria-hidden>
          ✓
        </span>
      ) : null}
    </button>
  );
}
