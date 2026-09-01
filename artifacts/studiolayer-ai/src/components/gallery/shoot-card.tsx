import { cn } from '@/lib/utils';
import {
  formatShootDate,
  isFailedGalleryRenderWithoutOutput,
  SHOOT_TYPE_LABEL,
  type GalleryShoot,
} from '@/lib/gallery-shoots';
import { galleryFailedRenderCopy } from '@/lib/generation-failure-copy';
import { resolveGalleryCardImageUrl } from '@/lib/gallery-card-image';

const SL_TOKEN_ICON = '/icons/sl-token.svg';

interface ShootCardProps {
  shoot: GalleryShoot;
  imagePriority?: boolean;
  isExiting?: boolean;
  isEntering?: boolean;
  onOpen: (shoot: GalleryShoot) => void;
}

function ShootCoverImage({ src, priority }: { src: string; priority?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      className="sl-shoot-card-cover-image"
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      draggable={false}
    />
  );
}

/**
 * One tile per Shoot: the first resolvable slot image is the representative
 * cover. No new data is introduced — the remaining images stay reachable
 * through the existing Shoot detail dialog.
 */
function ShootCover({ shoot, priority }: { shoot: GalleryShoot; priority?: boolean }) {
  const urls = shoot.images
    .map((img) => resolveGalleryCardImageUrl(img))
    .filter((url): url is string => Boolean(url));

  if (urls.length === 0) {
    const failedSlot = shoot.images.find((img) => isFailedGalleryRenderWithoutOutput(img));
    const failedCopy = failedSlot
      ? galleryFailedRenderCopy(failedSlot.status)
      : null;

    return (
      <div
        className="sl-shoot-card-cover sl-shoot-card-cover--single sl-shoot-card-cover-failed"
        data-testid={`shoot-card-failed-${shoot.rootId}`}
      >
        {failedCopy ? (
          <div className="sl-shoot-card-failed-copy">
            <p className="sl-shoot-card-failed-headline">{failedCopy.headline}</p>
            {failedCopy.creditLine ? (
              <p className="sl-shoot-card-failed-credit">{failedCopy.creditLine}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="sl-shoot-card-cover sl-shoot-card-cover--single">
      <ShootCoverImage src={urls[0]!} priority={priority} />
    </div>
  );
}

export function ShootCard({
  shoot,
  imagePriority,
  isExiting = false,
  isEntering = false,
  onOpen,
}: ShootCardProps) {
  return (
    <article
      className={cn(
        'sl-shoot-card',
        isEntering && 'sl-shoot-card--enter',
        isExiting && 'sl-shoot-card--exit',
      )}
      data-testid={`card-shoot-${shoot.rootId}`}
    >
      <button
        type="button"
        className="sl-shoot-card-open"
        onClick={() => onOpen(shoot)}
        aria-label={`Open ${SHOOT_TYPE_LABEL[shoot.generationType]}`}
      >
        <ShootCover shoot={shoot} priority={imagePriority} />
        {/* Revealed on hover/focus; the button's aria-label carries the same
            information for assistive tech regardless of pointer state. */}
        <div className="sl-shoot-card-caption" aria-hidden="true">
          <span className="sl-shoot-card-title">
            {SHOOT_TYPE_LABEL[shoot.generationType]}
          </span>
          <span className="sl-shoot-card-date">{formatShootDate(shoot.createdAt)}</span>
          <span className="sl-shoot-card-view">View</span>
        </div>
      </button>
    </article>
  );
}

export function ShootCardSkeleton({ index }: { index: number }) {
  return (
    <article
      className="sl-shoot-card sl-shoot-card--skeleton"
      aria-hidden
      data-testid={`card-shoot-skeleton-${index}`}
    >
      <div className="sl-shoot-card-cover sl-shoot-card-cover--single">
        <div className="sl-ledger-card-skeleton-shimmer sl-shoot-card-cover-skeleton" />
      </div>
    </article>
  );
}

export function ShootCardGhost({ index }: { index: number }) {
  return (
    <article
      className="sl-shoot-card sl-shoot-card--ghost"
      aria-hidden
      data-testid={`card-shoot-ghost-${index}`}
    >
      <div className="sl-shoot-card-cover sl-shoot-card-cover--single sl-shoot-card-cover--ghost">
        <img src={SL_TOKEN_ICON} alt="" aria-hidden className="sl-ledger-watermark" draggable={false} />
      </div>
    </article>
  );
}
