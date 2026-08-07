import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  formatShootDate,
  SHOOT_TYPE_LABEL,
  type GalleryShoot,
} from '@/lib/gallery-shoots';

const SL_TOKEN_ICON = '/icons/sl-token.svg';
const STUDIO_SPARK_ICON = '/icons/studio-spark.svg';

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

function ShootCover({ shoot, priority }: { shoot: GalleryShoot; priority?: boolean }) {
  const urls = shoot.images
    .map((img) => img.outputImageUrl)
    .filter((url): url is string => Boolean(url));

  if (urls.length === 0) {
    return <div className="sl-shoot-card-cover-empty" aria-hidden />;
  }

  if (urls.length === 1) {
    return (
      <div className="sl-shoot-card-cover sl-shoot-card-cover--single">
        <ShootCoverImage src={urls[0]!} priority={priority} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'sl-shoot-card-cover sl-shoot-card-cover--mosaic',
        urls.length === 2 && 'sl-shoot-card-cover--duo',
        urls.length >= 4 && 'sl-shoot-card-cover--quad',
      )}
    >
      {urls.slice(0, 4).map((url, index) => (
        <ShootCoverImage key={`${shoot.id}-${index}`} src={url} priority={priority && index === 0} />
      ))}
    </div>
  );
}

function ShootMetricColumn({
  iconSrc,
  iconClassName,
  tooltip,
  value,
}: {
  iconSrc: string;
  iconClassName?: string;
  tooltip: string;
  value: number;
}) {
  return (
    <div className="sl-shoot-metric sl-shoot-metric--compact">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="sl-shoot-metric-icon-wrap" tabIndex={0} aria-label={tooltip}>
            <img
              src={iconSrc}
              alt=""
              aria-hidden
              className={cn('sl-shoot-metric-icon', iconClassName)}
              draggable={false}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="sl-shoot-metric-tooltip">
          {tooltip}
        </TooltipContent>
      </Tooltip>
      <span
        className="sl-billing-cycle-stat-value"
        aria-label={`${tooltip}: ${value}`}
      >
        {value}
      </span>
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
        <div className="sl-shoot-card-heading">
          <h3 className="sl-shoot-card-title">{SHOOT_TYPE_LABEL[shoot.generationType]}</h3>
          <p className="sl-shoot-card-date">
            Generated {formatShootDate(shoot.createdAt)}
          </p>
        </div>
      </button>

      <div className="sl-shoot-accounting-strip" aria-label="Shoot accounting">
        <ShootMetricColumn
          iconSrc={SL_TOKEN_ICON}
          iconClassName="sl-shoot-metric-icon--studio-credit"
          tooltip="Studio Credits Used"
          value={shoot.studioCreditsUsed}
        />
        <ShootMetricColumn
          iconSrc={STUDIO_SPARK_ICON}
          iconClassName="sl-shoot-metric-icon--refinement"
          tooltip="Refinements"
          value={shoot.refinementCount}
        />
      </div>
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
      <div className="sl-shoot-accounting-strip sl-shoot-accounting-strip--skeleton">
        <div className="sl-shoot-metric-placeholder" />
        <div className="sl-shoot-metric-placeholder" />
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
      <div className="sl-shoot-accounting-strip">
        <ShootMetricColumn
          iconSrc={SL_TOKEN_ICON}
          iconClassName="sl-shoot-metric-icon--studio-credit"
          tooltip="Studio Credits Used"
          value={0}
        />
        <ShootMetricColumn
          iconSrc={STUDIO_SPARK_ICON}
          iconClassName="sl-shoot-metric-icon--refinement"
          tooltip="Refinements"
          value={0}
        />
      </div>
    </article>
  );
}
