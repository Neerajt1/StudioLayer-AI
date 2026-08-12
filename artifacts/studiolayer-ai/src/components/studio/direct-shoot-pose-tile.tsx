import { getPoseReferenceImageUrl } from '@/lib/pose-library-display';
import { cn } from '@/lib/utils';

interface DirectShootPoseTileProps {
  poseId: string;
  poseName: string;
  placementStyle: Record<string, string | number>;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function DirectShootPoseTile({
  poseId,
  poseName,
  placementStyle,
  selected,
  disabled,
  onToggle,
}: DirectShootPoseTileProps) {
  const imageUrl = getPoseReferenceImageUrl(poseId);

  return (
    <button
      type="button"
      className={cn(
        'sl-direct-shoot-pose-tile',
        selected && 'sl-direct-shoot-pose-tile--selected',
        disabled && !selected && 'sl-direct-shoot-pose-tile--disabled',
      )}
      style={placementStyle}
      aria-pressed={selected}
      aria-label={selected ? `${poseName}, selected` : poseName}
      disabled={disabled && !selected}
      onClick={onToggle}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="sl-direct-shoot-pose-image"
          loading="eager"
          draggable={false}
        />
      ) : (
        <span className="sl-direct-shoot-pose-placeholder" aria-hidden />
      )}
      {selected ? (
        <span className="sl-direct-shoot-pose-check" aria-hidden>
          ✓
        </span>
      ) : null}
    </button>
  );
}
