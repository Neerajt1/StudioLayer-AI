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
import { buildGalleryRefinementRequest } from '@/lib/gallery-refinement';
import { galleryQueryOptions } from '@/lib/gallery-queries';
import type { RefinementType } from '@/lib/refinement-types';
import { revokeCropObjectUrl } from '@/lib/studio-crop';
import {
  isStudioCreditLimitBlocked,
  resolveStudioAdminFlag,
} from '@workspace/studio-credit-engine';
import {
  delay,
  GALLERY_EXIT_ANIMATION_MS,
  stabilizeGalleryShoots,
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
    a: 'Yes.\n\nEvery Shoot in your Studio Gallery records exactly how many Studio Credits were used and how many refinements were made to produce the final result.\n\nStudio Gallery acts as your Creative Ledger, giving you complete transparency for every generation session.',
  },
  {
    q: 'What is my Creative Ledger?',
    a: 'Your Creative Ledger is the permanent record of every generation session you create in StudioLayer.\n\nEach Shoot shows Studio Credit usage and refinement history — so you always know where your creative investment went.',
  },
  {
    q: 'What are Studio Credits?',
    a: 'Studio Credits are your allowance for creating Editorial Images. Every credit consumed appears in your Creative Ledger alongside the Shoot it helped produce.',
  },
];

export default function GalleryPage() {
  const {
    data: renders,
    isPending: rendersPending,
    isFetching: rendersFetching,
    isError: rendersError,
    isSuccess: rendersSuccess,
    refetch: refetchRenders,
  } = useListRenders({
    query: galleryQueryOptions as never,
  });
  const { data: usage } = useGetRenderUsage({
    query: galleryQueryOptions as never,
  });
  const { data: user } = useGetMe();
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
  const [refineInFlight, setRefineInFlight] = useState(false);
  const [activeRefinement, setActiveRefinement] = useState<RefinementType | null>(null);
  const [refinementPending, setRefinementPending] = useState<{
    parentRenderId: number;
    childRenderId: number;
    refinementType: RefinementType;
  } | null>(null);
  const refinementHandledRef = useRef<number | null>(null);
  const [exitingShoots, setExitingShoots] = useState<GalleryShoot[]>([]);
  const stableShootsRef = useRef<GalleryShoot[]>([]);
  const exitingShootIdsRef = useRef<Set<string>>(new Set());

  const pendingChildId = refinementPending?.childRenderId ?? 0;
  const { data: pendingRefinementRender } = useGetRender(pendingChildId, {
    query: {
      enabled: pendingChildId > 0,
      refetchInterval: makeRefetchInterval(pendingChildId > 0),
    } as never,
  });

  const rawShoots = useMemo(
    () => buildGalleryShoots((renders ?? EMPTY_LEDGER_RENDERS) as CreativeLedgerCardRender[]),
    [renders],
  );

  const shoots = useMemo(() => {
    const stabilized = stabilizeGalleryShoots(stableShootsRef.current, rawShoots);
    stableShootsRef.current = stabilized;
    return stabilized;
  }, [rawShoots]);

  const hasCachedShoots = shoots.length > 0 || stableShootsRef.current.length > 0;

  /**
   * Initial load only — not errors, not background refetches on an empty ledger.
   * Cached shoots stay visible during background refetch (keepPreviousData).
   */
  const isGalleryLoading = !hasCachedShoots && rendersPending && !rendersError;
  const isGalleryEmpty = rendersSuccess && !hasCachedShoots && !rendersError;

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
            toast({ title: 'Asset deleted', description: 'The image has been removed.' });
            resolve();
          },
          onError: () => {
            toast({
              title: "We couldn't complete your request.",
              description: 'Please try again in a few moments.',
            });
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

  const handleGalleryRefine = (render: CreativeLedgerCardRender, type: RefinementType) => {
    if (refineInFlight || createRender.isPending) return;

    if (isStudioCreditLimitBlocked(usage) && !resolveStudioAdminFlag(user, usage)) {
      toast({
        title: 'Studio Credit used',
        description: 'View Membership to continue refining.',
      });
      return;
    }

    setRefineInFlight(true);
    setActiveRefinement(type);

    createRender.mutate(
      { data: buildGalleryRefinementRequest(render, type) },
      {
        onSuccess: (renders) => {
          const childId = (renders as unknown as { id: number }[])?.[0]?.id;
          if (!childId) {
            setRefineInFlight(false);
            setActiveRefinement(null);
            toast({
              title: "We couldn't complete this refinement.",
              description: withErrorContactHelper('Please try again in a few moments.'),
            });
            return;
          }

          refinementHandledRef.current = null;
          setRefinementPending({
            parentRenderId: render.id,
            childRenderId: childId,
            refinementType: type,
          });
        },
        onError: (error: unknown) => {
          setRefineInFlight(false);
          setActiveRefinement(null);
          setRefinementPending(null);
          toast({
            title: "We couldn't complete this refinement.",
            description: withErrorContactHelper(renderApiErrorDescription(error)),
          });
        },
      },
    );
  };

  useEffect(() => {
    if (!refinementPending || !pendingRefinementRender) return;

    const { status } = pendingRefinementRender;
    if (status !== 'completed' && status !== 'failed') return;

    const { childRenderId, parentRenderId } = refinementPending;
    if (refinementHandledRef.current === childRenderId) return;
    refinementHandledRef.current = childRenderId;

    if (status === 'completed') {
      toast({
        title: 'Refinement complete',
        description: 'Your updated image is now in the Gallery.',
      });
      setEditRender(null);
      setCropStateByRenderId((prev) => {
        const next = { ...prev };
        revokeCropObjectUrl(prev[parentRenderId]?.displayUrl);
        delete next[parentRenderId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: getListRendersQueryKey() });
    } else {
      toast({
        title: "We couldn't complete this refinement.",
        description: withErrorContactHelper('Your original image is unchanged. Please try again.'),
      });
    }

    setRefinementPending(null);
    setRefineInFlight(false);
    setActiveRefinement(null);
    void queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
  }, [
    refinementPending,
    pendingRefinementRender,
    queryClient,
    toast,
  ]);

  return (
    <AppShell footer>
      <EditorialPageHeader
        companion="Gallery"
        supporting="Every Render, Preserved."
        tagline="Your Creative Ledger."
        className="sl-page-header--gallery"
        aside={<GalleryDashboardCard usage={usage} />}
      />

      <GalleryLedgerLegend />

      {rendersError ? (
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
            Every generation you create in Studio appears here — with Studio Credit usage and
            refinement history preserved for each Shoot.
          </p>
          <StudioWorkspaceButton
            variant="primary"
            onClick={() => setLocation('/studio')}
          >
            Create your first Shoot
          </StudioWorkspaceButton>
        </section>
      ) : (
        <CreativeLedgerGrid
          shoots={gridShoots}
          exitingShootIds={exitingShootIds}
          isInitialLoading={isGalleryLoading}
          isRefreshing={rendersFetching && hasCachedShoots}
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

      <ShootDetailDialog
        shoot={openShoot}
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
        open={editRender != null}
        onOpenChange={(open) => !open && setEditRender(null)}
        cropState={editRender ? cropStateByRenderId[editRender.id] : undefined}
        onCropStateChange={handleCropStateChange}
        refineInFlight={refineInFlight}
        activeRefinement={activeRefinement}
        onRefine={handleGalleryRefine}
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
