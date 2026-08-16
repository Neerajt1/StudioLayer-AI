import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ledgerAspectRatio,
  refinementsForRender,
  studioCreditsForRender,
  type LedgerRender,
} from '@/lib/creative-ledger';
import { galleryFailedRenderCopy } from '@/lib/generation-failure-copy';

import { GalleryImageDownloadButton } from '@/components/shared/gallery-image-download-button';

const SL_TOKEN_ICON = '/icons/sl-token.svg';
const STUDIO_SPARK_ICON = '/icons/studio-spark.svg';

export interface CreativeLedgerCardRender extends LedgerRender {
  sourceImageUrl: string | null;
  outputImageUrl: string | null;
  /** Lightweight Gallery card preview — null until async generation completes. */
  previewImageUrl?: string | null;
  status: string;
  modelPersona?: string;
  locationEnvironment?: string;
  generationType?: 'hero' | 'campaign' | 'editorial';
  generationSessionId?: string | null;
  refinementType?: string | null;
  assetType?: string | null;
}

type CreativeLedgerCardProps =
  | {
      skeleton: true;
      skeletonIndex: number;
      ghost?: never;
      ghostIndex?: never;
      render?: never;
      allRenders?: never;
      imagePriority?: never;
      onView?: never;
      onInsufficientCredits?: never;
      onDownloadError?: never;
      onCreditsConsumed?: never;
      onDelete?: never;
      deletePending?: never;
    }
  | {
      ghost: true;
      ghostIndex: number;
      skeleton?: never;
      skeletonIndex?: never;
      render?: never;
      allRenders?: never;
      imagePriority?: never;
      onView?: never;
      onInsufficientCredits?: never;
      onDownloadError?: never;
      onCreditsConsumed?: never;
      onDelete?: never;
      deletePending?: never;
    }
  | {
      skeleton?: false;
      skeletonIndex?: never;
      ghost?: false;
      ghostIndex?: never;
      render: CreativeLedgerCardRender;
      allRenders: CreativeLedgerCardRender[];
      imagePriority?: boolean;
      onView: (render: CreativeLedgerCardRender) => void;
      onInsufficientCredits?: () => void;
      onDownloadError?: (message: string) => void;
      onCreditsConsumed?: () => void;
      onDelete: (render: CreativeLedgerCardRender) => void;
      deletePending?: boolean;
    };

function LedgerWatermark() {
  return (
    <img
      src={SL_TOKEN_ICON}
      alt=""
      aria-hidden
      className="sl-ledger-watermark"
      draggable={false}
    />
  );
}

function LedgerCardMediaSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('sl-ledger-card-skeleton-shimmer', className)}
      aria-hidden
    />
  );
}

function AccountingMetric({
  iconSrc,
  label,
  value,
  studioCreditIcon = false,
}: {
  iconSrc: string;
  label: string;
  value: number;
  studioCreditIcon?: boolean;
}) {
  return (
    <div className="sl-ledger-metric">
      <img
        src={iconSrc}
        alt=""
        aria-hidden
        className={cn(
          'sl-ledger-metric-icon',
          studioCreditIcon && 'sl-ledger-metric-icon--studio-credit',
        )}
      />
      <span className="sl-ledger-metric-value" aria-label={`${label}: ${value}`}>
        {value}
      </span>
    </div>
  );
}

function SkeletonCreativeLedgerCard({ skeletonIndex }: { skeletonIndex: number }) {
  return (
    <article
      className="sl-creative-ledger-card sl-creative-ledger-card--skeleton"
      aria-hidden="true"
      data-testid={`card-skeleton-${skeletonIndex}`}
    >
      <div
        className="sl-ledger-card-media"
        style={{ aspectRatio: ledgerAspectRatio() }}
      >
        <LedgerCardMediaSkeleton />
      </div>
      <div className="sl-ledger-accounting-strip sl-ledger-accounting-strip--skeleton">
        <div className="sl-ledger-skeleton-metric" aria-hidden />
        <div className="sl-ledger-skeleton-metric" aria-hidden />
      </div>
    </article>
  );
}

function GhostCreativeLedgerCard({ ghostIndex }: { ghostIndex: number }) {
  return (
    <article
      className="sl-creative-ledger-card sl-creative-ledger-card--ghost"
      aria-hidden="true"
      data-testid={`card-ghost-${ghostIndex}`}
    >
      <div
        className="sl-ledger-card-media"
        style={{ aspectRatio: ledgerAspectRatio() }}
      >
        <div className="sl-ledger-card-placeholder">
          <LedgerWatermark />
        </div>
      </div>
      <div className="sl-ledger-accounting-strip">
        <AccountingMetric iconSrc={SL_TOKEN_ICON} label="Credits Used" value={0} studioCreditIcon />
        <AccountingMetric iconSrc={STUDIO_SPARK_ICON} label="Edits Made" value={0} />
      </div>
    </article>
  );
}

function LedgerCardImage({
  src,
  priority,
}: {
  src: string;
  priority?: boolean;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, [src]);

  return (
    <>
      <LedgerCardMediaSkeleton
        className={imageLoaded ? 'sl-ledger-card-skeleton-shimmer--hidden' : undefined}
      />
      <img
        ref={imgRef}
        src={src}
        alt="Editorial image"
        className={cn(
          'sl-ledger-card-image',
          imageLoaded && 'sl-ledger-card-image--loaded',
        )}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={() => setImageLoaded(true)}
      />
    </>
  );
}

function RealCreativeLedgerCard({
  render,
  allRenders,
  imagePriority,
  onView,
  onInsufficientCredits,
  onDownloadError,
  onCreditsConsumed,
  onDelete,
  deletePending,
}: {
  render: CreativeLedgerCardRender;
  allRenders: CreativeLedgerCardRender[];
  imagePriority?: boolean;
  onView: (render: CreativeLedgerCardRender) => void;
  onInsufficientCredits?: () => void;
  onDownloadError?: (message: string) => void;
  onCreditsConsumed?: () => void;
  onDelete: (render: CreativeLedgerCardRender) => void;
  deletePending?: boolean;
}) {
  const studioCredits = studioCreditsForRender(render);
  const refinements = refinementsForRender(allRenders, render);
  const hasOutput =
    render.status === 'completed' &&
    render.outputImageUrl != null &&
    render.outputImageUrl.length > 0;
  const isProcessing = render.status === 'processing' || render.status === 'pending';
  const canInteract = hasOutput && !deletePending;
  const failedCopy =
    !hasOutput && render.status === 'failed'
      ? galleryFailedRenderCopy(render.status)
      : null;

  return (
    <article
      className="sl-creative-ledger-card sl-creative-ledger-card--live"
      data-testid={`card-render-${render.id}`}
    >
      <div
        className="sl-ledger-card-media"
        style={{ aspectRatio: ledgerAspectRatio(render.id) }}
      >
        {hasOutput ? (
          <LedgerCardImage src={render.outputImageUrl!} priority={imagePriority} />
        ) : (
          <div className="sl-ledger-card-placeholder">
            {isProcessing ? (
              <p className="sl-ledger-card-status">Creating…</p>
            ) : failedCopy ? (
              <div className="sl-ledger-card-failed-copy">
                <p className="sl-ledger-card-status">{failedCopy.headline}</p>
                {failedCopy.creditLine ? (
                  <p className="sl-ledger-card-status-detail">{failedCopy.creditLine}</p>
                ) : null}
              </div>
            ) : null}
            <LedgerWatermark />
          </div>
        )}

        <div className="sl-ledger-card-actions" aria-label="Asset actions">
          <button
            type="button"
            className="sl-ledger-card-action"
            disabled={!canInteract}
            onClick={() => onView(render)}
            data-testid={`btn-view-render-${render.id}`}
          >
            View
          </button>
          <GalleryImageDownloadButton
            renderId={render.id}
            outputImageUrl={render.outputImageUrl!}
            disabled={!canInteract}
            onDownloadError={onDownloadError}
          />
          <button
            type="button"
            className="sl-ledger-card-action sl-ledger-card-action--delete"
            disabled={deletePending}
            onClick={() => onDelete(render)}
            data-testid={`btn-delete-render-${render.id}`}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="sl-ledger-accounting-strip">
        <AccountingMetric
          iconSrc={SL_TOKEN_ICON}
          label="Credits Used"
          value={studioCredits}
          studioCreditIcon
        />
        <AccountingMetric
          iconSrc={STUDIO_SPARK_ICON}
          label="Edits Made"
          value={refinements}
        />
      </div>
    </article>
  );
}

export function CreativeLedgerCard(props: CreativeLedgerCardProps) {
  if (props.skeleton) {
    return <SkeletonCreativeLedgerCard skeletonIndex={props.skeletonIndex} />;
  }

  if (props.ghost) {
    return <GhostCreativeLedgerCard ghostIndex={props.ghostIndex} />;
  }

  return (
    <RealCreativeLedgerCard
      render={props.render}
      allRenders={props.allRenders}
      imagePriority={props.imagePriority}
      onView={props.onView}
      onInsufficientCredits={props.onInsufficientCredits}
      onDownloadError={props.onDownloadError}
      onCreditsConsumed={props.onCreditsConsumed}
      onDelete={props.onDelete}
      deletePending={props.deletePending}
    />
  );
}
