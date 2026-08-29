import { useMemo, useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { AppShell } from '@/components/layout/app-shell';
import {
  useListRenders,
  useDeleteRender,
  useGetRenderUsage,
  useCreateRender,
  useGetRender,
  useGetMe,
  getListRendersQueryKey,
  getGetRenderUsageQueryKey,
} from '@workspace/api-client-react';
import type { Render } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { withErrorContactHelper } from '@/lib/studio-contact';
import { useToast } from '@/hooks/use-toast';
import { EditorialPageHeader } from '@/components/design-system/editorial-page-header';
import { CreativeLedgerGrid } from '@/components/gallery/creative-ledger-grid';
import { GalleryDashboardCard } from '@/components/gallery/gallery-dashboard-card';
import { GalleryLedgerLegend } from '@/components/gallery/gallery-ledger-legend';
import { GalleryImageViewer } from '@/components/gallery/gallery-image-viewer';
import { ShootDetailDialog } from '@/components/gallery/shoot-detail-dialog';
import {
  GalleryImageEditDialog,
  type GalleryCropState,
} from '@/components/gallery/gallery-image-edit-dialog';
import type { CreativeLedgerCardRender } from '@/components/gallery/creative-ledger-card';
import { buildGalleryShoots, type GalleryShoot } from '@/lib/gallery-shoots';
import { buildGalleryRemoveBackgroundRequest } from '@/lib/gallery-refinement';
import { readPreviewImageUrlFromApiRender } from '@/lib/gallery-card-image';
import { galleryQueryOptions, galleryUsageQueryOptions } from '@/lib/gallery-queries';
import { revokeCropObjectUrl } from '@/lib/studio-crop';
import {
  creditCostForRemoveBackground,
  resolveStudioAdminFlag,
} from '@workspace/studio-credit-engine';
import { hasSufficientStudioCreditsForCost } from '@/lib/studio-credit-availability';
import { zeroStudioCreditBlockToast } from '@/lib/studio-credit-block-copy';
import {
  galleryDeleteFailedToast,
  galleryDeleteSucceededToast,
} from '@/lib/gallery-delete-copy';
import {
  delay,
  GALLERY_EXIT_ANIMATION_MS,
} from '@/lib/gallery-shoot-stability';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { StudioWorkspaceButton } from '@/components/studio/studio-workspace-controls';

/** Stable empty list — avoids re-running shoot grouping on every render while data is undefined. */
const EMPTY_LEDGER_RENDERS: CreativeLedgerCardRender[] = [];

function makeRefetchInterval(enabled: boolean) {
  return (query: { state: { data: { status?: string } | undefined } }) => {
    if (!enabled) return false;
    const render = query.state.data;
    if (render && (render.status === 'processing' || render.status === 'pending')) {
      return 2000;
    }
    return false;
  };
}

function renderApiErrorDescription(error: unknown): string {
  if (import.meta.env.DEV) {
    const err = error as {
      message?: string;
      response?: { data?: { error?: string; details?: { message?: string } } };
    };
    const apiMessage =
      err.response?.data?.details?.message ??
      err.response?.data?.error ??
      err.message;
    if (apiMessage) return apiMessage;
  }
  return 'Please try again in a few moments.';
}

const GALLERY_FAQ = [
  {
    q: 'Can I see where I spend my Studio Credits?',
    a: 'Yes.\n\nEvery Shoot in your Studio Gallery records exactly how many Studio Credits were used and how many paid post-production edits were made to produce the final result.\n\nStudio Gallery acts as your Creative Ledger, giving you complete transparency for every generation session.',
  },
  {
    q: 'What is my Creative Ledger?',
    a: 'Your Creative Ledger is the permanent record of every generation session you create in StudioLayer.\n\nEach Shoot shows Studio Credit usage and post-production activity — so you always know where your creative investment went.',
  },
  {
    q: 'What are Studio Credits?',
    a: 'Studio Credits are your allowance for creating Editorial Images. Every credit consumed appears in your Creative Ledger alongside the Shoot it helped produce.',
  },
];

function toCreativeLedgerCardRender(render: Render): CreativeLedgerCardRender {
  return {
    ...render,
    sourceImageUrl: render.sourceImageUrl ?? null,
    outputImageUrl: render.outputImageUrl ?? null,
    previewImageUrl: readPreviewImageUrlFromApiRender(render),
    status: render.status,
    generationType: render.generationType,
    generationSessionId: render.generationSessionId,
    refinementType: render.refinementType,
    assetType: render.assetType,
  };
}

export default function GalleryPage() {
  const { data: user, isLoading: authLoading, isSuccess: isAuthenticated } = useGetMe();
  const {
    data: renders,
    isPending: rendersPending,
    isFetching: rendersFetching,
    isError: rendersError,
    isSuccess: rendersSuccess,
    refetch: refetchRenders,
  } = useListRenders({
    query: {
      ...galleryQueryOptions,
      // Visitors see an empty ledger — never fetch another account's renders.
      enabled: isAuthenticated,
    } as never,
  });
  const { data: usage } = useGetRenderUsage({
    query: {
      ...galleryUsageQueryOptions,
      enabled: isAuthenticated && !rendersPending,
    } as never,
  });
  const createRender = useCreateRender();
  const deleteRender = useDeleteRender();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [openShoot, setOpenShoot] = useState<GalleryShoot | null>(null);
  const [viewRender, setViewRender] = useState<CreativeLedgerCardRender | null>(null);
  const [editRender, setEditRender] = useState<CreativeLedgerCardRender | null>(null);
  const [cropStateByRenderId, setCropStateByRenderId] = useState<
    Record<number, GalleryCropState>
  >({});
  const [removeBackgroundInFlight, setRemoveBackgroundInFlight] = useState(false);
  const [removeBackgroundPending, setRemoveBackgroundPending] = useState<{
    parentRenderId: number;
    childRenderId: number;
  } | null>(null);
  const removeBackgroundHandledRef = useRef<number | null>(null);
  const [exitingShoots, setExitingShoots] = useState<GalleryShoot[]>([]);
  const exitingShootIdsRef = useRef<Set<string>>(new Set());

  const pendingChildId = removeBackgroundPending?.childRenderId ?? 0;
  const { data: pendingRemoveBackgroundRender } = useGetRender(pendingChildId, {
    query: {
      enabled: pendingChildId > 0,
      refetchInterval: makeRefetchInterval(pendingChildId > 0),
    } as never,
  });

  // Authoritative ledger: fresh API → buildGalleryShoots (newest → oldest). No client stabilize.
  const shoots = useMemo(
    () => buildGalleryShoots((renders ?? EMPTY_LEDGER_RENDERS) as CreativeLedgerCardRender[]),
    [renders],
  );

  const hasCachedShoots = shoots.length > 0;

  /**
   * Initial load only — not errors, not background refetches on an empty ledger.
   * Cached shoots stay visible during background refetch (keepPreviousData).
   * Visitors skip the list query and land on the empty Creative Ledger state.
   */
  const isVisitor = !authLoading && !isAuthenticated;
  const isGalleryLoading =
    !hasCachedShoots
    && !rendersError
    && (authLoading || (isAuthenticated && rendersPending));
  const isGalleryEmpty =
    (isVisitor || rendersSuccess) && !hasCachedShoots && !rendersError;

  const gridShoots = useMemo(() => {
    const activeIds = new Set(shoots.map((shoot) => shoot.id));
    const fading = exitingShoots.filter((shoot) => !activeIds.has(shoot.id));
    return [...shoots, ...fading];
  }, [shoots, exitingShoots]);

  const exitingShootIds = useMemo(
    () => new Set(exitingShoots.map((shoot) => shoot.id)),
    [exitingShoots],
  );

  useEffect(() => {
    if (!editRender?.id || !renders) return;

    const fresh = (renders as CreativeLedgerCardRender[]).find(
      (render) => render.id === editRender.id,
    );
    if (!fresh) return;

    setEditRender((current) => {
      if (!current || current.id !== fresh.id) return current;
      if (
        current.outputImageUrl === fresh.outputImageUrl
        && current.status === fresh.status
        && current.refinementType === fresh.refinementType
        && current.assetType === fresh.assetType
      ) {
        return current;
      }
      return fresh;
    });
  }, [renders, editRender?.id]);

  useEffect(() => {
    if (!openShoot) return;

    const shootId = openShoot.id;
    const updated = shoots.find((entry) => entry.id === shootId);
    if (updated) {
      if (updated.imageCount === 0) {
        setOpenShoot(null);
      } else {
        setOpenShoot((current) => {
          if (!current || current.id !== shootId) return current;
          const sameImages =
            current.images.length === updated.images.length &&
            current.images.every((image, index) => image.id === updated.images[index]?.id);
          return sameImages ? current : updated;
        });
      }
      return;
    }

    if (exitingShootIdsRef.current.has(shootId)) return;
    exitingShootIdsRef.current.add(shootId);

    const snapshot = openShoot;
    setExitingShoots((current) => [...current, snapshot]);
    void delay(GALLERY_EXIT_ANIMATION_MS).then(() => {
      exitingShootIdsRef.current.delete(shootId);
      setExitingShoots((current) => current.filter((shoot) => shoot.id !== shootId));
      setOpenShoot((current) => (current?.id === shootId ? null : current));
    });
  }, [shoots, openShoot]);

  const handleDelete = (render: CreativeLedgerCardRender): Promise<void> => {
    if (deleteRender.isPending) {
      return Promise.reject(new Error('Delete already in progress'));
    }

    return new Promise((resolve, reject) => {
      deleteRender.mutate(
        { id: render.id },
        {
          onSuccess: () => {
            if (viewRender?.id === render.id) {
              setViewRender(null);
            }
            queryClient.invalidateQueries({ queryKey: getListRendersQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
            const copy = galleryDeleteSucceededToast();
            toast({ title: copy.title, description: copy.description });
            resolve();
          },
          onError: () => {
            const copy = galleryDeleteFailedToast();
            toast({ title: copy.title, description: copy.description });
            // Reject so Shoot Detail keeps the image visible (no exit/remove).
            reject(new Error('Delete failed'));
          },
        },
      );
    });
  };

  const handleDownloadInsufficientCredits = () => {
    setLocation('/billing');
  };

  const handleDownloadError = (message: string) => {
    toast({
      title: message,
      description: withErrorContactHelper('Please try again in a few moments.'),
    });
  };

  const handleDownloadCreditsConsumed = () => {
    queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
  };

  const handleOpenShoot = (shoot: GalleryShoot) => {
    setOpenShoot(shoot);
  };

  const getGalleryDisplayUrl = (render: CreativeLedgerCardRender) =>
    cropStateByRenderId[render.id]?.displayUrl ?? render.outputImageUrl;

  const handleCropStateChange = (renderId: number, state: GalleryCropState | null) => {
    setCropStateByRenderId((prev) => {
      const next = { ...prev };
      revokeCropObjectUrl(prev[renderId]?.displayUrl);
      if (state == null) {
        delete next[renderId];
      } else {
        next[renderId] = state;
      }
      return next;
    });
  };

  const handleGalleryRemoveBackground = (render: CreativeLedgerCardRender) => {
    if (removeBackgroundInFlight || createRender.isPending) return;

    // Remove Background is a flat 1-credit tool, not a generation: gate it on
    // its own price so a customer who can still afford it is not turned away.
    if (
      !resolveStudioAdminFlag(user, usage) &&
      !hasSufficientStudioCreditsForCost(usage, creditCostForRemoveBackground(), user)
    ) {
      const copy = zeroStudioCreditBlockToast();
      toast({
        title: copy.title,
        description: copy.description,
      });
      return;
    }

    setRemoveBackgroundInFlight(true);

    createRender.mutate(
      { data: buildGalleryRemoveBackgroundRequest(render) },
      {
        onSuccess: (renders) => {
          const childId = (renders as unknown as { id: number }[])?.[0]?.id;
          if (!childId) {
            setRemoveBackgroundInFlight(false);
            toast({
              title: "We couldn't remove the background.",
              description: withErrorContactHelper('Please try again in a few moments.'),
            });
            return;
          }

          removeBackgroundHandledRef.current = null;
          setRemoveBackgroundPending({
            parentRenderId: render.id,
            childRenderId: childId,
          });
        },
        onError: (error: unknown) => {
          setRemoveBackgroundInFlight(false);
          setRemoveBackgroundPending(null);
          toast({
            title: "We couldn't remove the background.",
            description: withErrorContactHelper(renderApiErrorDescription(error)),
          });
        },
      },
    );
  };

  useEffect(() => {
    if (!removeBackgroundPending || !pendingRemoveBackgroundRender) return;

    const { status } = pendingRemoveBackgroundRender;
    if (status !== 'completed' && status !== 'failed') return;

    const { childRenderId, parentRenderId } = removeBackgroundPending;
    if (removeBackgroundHandledRef.current === childRenderId) return;
    removeBackgroundHandledRef.current = childRenderId;

    if (status === 'completed') {
      toast({
        title: 'Background removed',
        description: 'Your transparent image is now in the Gallery.',
      });
      setEditRender(toCreativeLedgerCardRender(pendingRemoveBackgroundRender));
      if (viewRender?.id === parentRenderId) {
        setViewRender(toCreativeLedgerCardRender(pendingRemoveBackgroundRender));
      }
      setCropStateByRenderId((prev) => {
        const next = { ...prev };
        revokeCropObjectUrl(prev[parentRenderId]?.displayUrl);
        delete next[parentRenderId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: getListRendersQueryKey() });
    } else {
      toast({
        title: "We couldn't remove the background.",
        description: withErrorContactHelper('Your original image is unchanged. Please try again.'),
      });
    }

    setRemoveBackgroundPending(null);
    setRemoveBackgroundInFlight(false);
    void queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
  }, [
    removeBackgroundPending,
    pendingRemoveBackgroundRender,
    queryClient,
    toast,
  ]);

  return (
    <AppShell footer>
      <div className={isVisitor ? 'sl-visitor-page-emphasis' : undefined}>
      <EditorialPageHeader
        companion="Gallery"
        supporting="Every Render, Preserved."
        tagline="Your Creative Ledger."
        className="sl-page-header--gallery"
        aside={<GalleryDashboardCard usage={isAuthenticated ? usage : null} />}
      />

      <GalleryLedgerLegend />

      {isAuthenticated && rendersError ? (
        <section
          className="sl-creative-ledger-stage sl-creative-ledger-stage--empty mx-auto max-w-lg text-center"
          aria-live="polite"
        >
          <h2 className="sl-section-label mb-3">Creative Ledger unavailable</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            We couldn&apos;t load your Gallery right now. Your images are safe — please try again
            in a moment.
          </p>
          <StudioWorkspaceButton
            variant="primary"
            onClick={() => void refetchRenders()}
          >
            Try again
          </StudioWorkspaceButton>
        </section>
      ) : isGalleryEmpty ? (
        <section
          className="sl-creative-ledger-stage sl-creative-ledger-stage--empty mx-auto max-w-lg text-center"
          aria-live="polite"
        >
          <h2 className="sl-section-label mb-3">Your Creative Ledger is empty</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            {isVisitor
              ? 'Your personal Creative Ledger appears here after you create Editorial Images in Studio. Sign up or log in when you are ready to begin.'
              : 'Every generation you create in Studio appears here — with Studio Credit usage and post-production activity preserved for each Shoot.'}
          </p>
          <StudioWorkspaceButton
            variant="primary"
            onClick={() => setLocation('/studio')}
          >
            {isVisitor ? 'Explore Studio Workspace' : 'Create your first Shoot'}
          </StudioWorkspaceButton>
        </section>
      ) : (
        <CreativeLedgerGrid
          shoots={gridShoots}
          exitingShootIds={exitingShootIds}
          isInitialLoading={isGalleryLoading}
          isRefreshing={isAuthenticated && rendersFetching && hasCachedShoots}
          onOpenShoot={handleOpenShoot}
        />
      )}

      <section className="sl-gallery-faq-section max-w-3xl mx-auto mt-16">
          <h2 className="sl-section-label sl-gallery-faq-title text-center mb-6">
            Gallery FAQ
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {GALLERY_FAQ.map((item, index) => (
              <AccordionItem key={item.q} value={`gallery-faq-${index}`}>
                <AccordionTrigger className="text-sm text-foreground hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </div>

      <ShootDetailDialog
        shoot={openShoot}
        allRenders={(renders ?? EMPTY_LEDGER_RENDERS) as CreativeLedgerCardRender[]}
        open={openShoot != null}
        onOpenChange={(open) => !open && setOpenShoot(null)}
        onInspect={setViewRender}
        onEdit={(render) => {
          setOpenShoot(null);
          setEditRender(render);
        }}
        onDelete={handleDelete}
        onDownloadError={handleDownloadError}
        getDisplayUrl={getGalleryDisplayUrl}
      />

      <GalleryImageEditDialog
        render={editRender}
        allRenders={(renders ?? EMPTY_LEDGER_RENDERS) as CreativeLedgerCardRender[]}
        open={editRender != null}
        onOpenChange={(open) => !open && setEditRender(null)}
        cropState={editRender ? cropStateByRenderId[editRender.id] : undefined}
        onCropStateChange={handleCropStateChange}
        removeBackgroundInFlight={removeBackgroundInFlight}
        onRemoveBackground={handleGalleryRemoveBackground}
        onRenderChange={setEditRender}
        onDownloadError={handleDownloadError}
      />

      <GalleryImageViewer
        imageUrl={
          viewRender
            ? (getGalleryDisplayUrl(viewRender) ?? viewRender.outputImageUrl)
            : null
        }
        open={viewRender != null}
        onOpenChange={(open) => !open && setViewRender(null)}
      />
    </AppShell>
  );
}
