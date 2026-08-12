// ---------------------------------------------------------------------------
// StudioLayer AI — Studio Page
//
// Simplified AI-first workflow:
//   1. Upload garment photo
//   2. Choose model
//   → Create → Refine (Batch 21)
//
// V1 AI Refinements: Remove Background, Enhance Model Face, Enhance Garment (1 credit each).
// Free Studio Tools: Crop, Revert, Zoom, Download.
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import JSZip from 'jszip';
import {
  useCreateRender,
  useGetRenderUsage,
  useGetRender,
  useGetMe,
  useGetIdentities,
  getGetRenderUsageQueryKey,
  getListRendersQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveRenders } from '@/hooks/use-active-renders';
import { withErrorContactHelper } from '@/lib/studio-contact';
import { formatDownloadPreparingLabel } from '@/lib/download-preparing-label';
import { useDownloadInFlight } from '@/hooks/use-download-in-flight';
import { AppShell } from '@/components/layout/app-shell';
import { FileUpload } from '@/components/ui/file-upload';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SelectedTalentSummary } from '@/components/studio/selected-talent-summary';
import { StudioBrandWatermark } from '@/components/studio/studio-brand-watermark';
import {
  EditorialImageActions,
  StudioEditorialCanvas,
  StudioEditorialFailedState,
  StudioEditorialImage,
  StudioEditorialPlaceholder,
  StudioEditorialProgressOverlay,
  StudioResultToolbar,
} from '@/components/studio/studio-editorial-stage';
import {
  StudioImageInspector,
  type StudioImageInspectionTarget,
} from '@/components/studio/studio-image-inspector';
import { ShootTypeSelector } from '@/components/studio/shoot-type-selector';
import { CustomCampaignControl } from '@/components/studio/custom-campaign-control';
import { ResolutionSelector } from '@/components/studio/resolution-selector';
import { DirectShootDialog } from '@/components/studio/direct-shoot-dialog';
import {
  FixedBatchViewport,
} from '@/components/shared/fixed-batch-viewport';
import {
  StudioToggleOption,
  StudioWorkspaceButton,
} from '@/components/studio/studio-workspace-controls';
import { EditorialPageHeader } from '@/components/design-system/editorial-page-header';
import { AccountStatementDownloadLink } from '@/components/account/account-statement-download-link';
import type { ModelIdentity } from '@/components/studio/talent/types';
import { cn } from '@/lib/utils';
import { fetchEditorialImageBlob } from '@/lib/download-image';
import {
  formatStudioCredits,
  isComplimentaryCreditExhaustedForUser,
  isComplimentaryMembershipTier,
  isPremiumShootTypeLocked,
  isStudioCreditLimitBlocked,
  membershipCreditsRemaining,
  resolveGenerationCreditCost,
  resolveStudioAdminFlag,
} from '@workspace/studio-credit-engine';
import { useStudioWorkflow } from '@/context/studio-workflow-context';
import type { GarmentPlacement } from '@/lib/studio-workflow';
import {
  buildGenerationRequest,
  buildRefinementRequest,
  canGenerateStudioWorkflow,
  GARMENT_LENGTH_OPTIONS,
  resolveWorkflowImageCount,
  trimUsedPosesToShotCount,
  validateStudioWorkflow,
} from '@/lib/studio-workflow';
import { StudioRefinePanel } from '@/components/studio/studio-refine-panel';
import type { RefinementType } from '@/lib/refinement-types';
import {
  cropImageBlobToRect,
  revokeCropObjectUrl,
  type CropAspectMode,
  type NormalizedCropRect,
} from '@/lib/studio-crop';
import { StudioCustomCropDialog } from '@/components/studio/studio-custom-crop-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GARMENT_TYPES = [
  { value: 'upper_body', label: 'Topwear',     sub: 'Shirts · T-Shirts · Jackets · Knitwear' },
  { value: 'lower_body', label: 'Bottomwear',  sub: 'Jeans · Trousers · Shorts · Skirts' },
  { value: 'full_body',  label: 'Full Outfit', sub: 'Dresses · Jumpsuits · Co-ords · Suits' },
] as const;

/** Surface API error detail in development instead of a generic toast only. */
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

const IMAGE_COUNT_OPTIONS = [
  { value: 1 as const, label: 'Hero Shot',             sub: '1 Editorial Image' },
  { value: 2 as const, label: 'Campaign Collections',  sub: '2 Editorial Images' },
  { value: 4 as const, label: 'Editorial Portraits',   sub: '4 Editorial Images' },
];

const SHOOT_TYPE_LABEL: Record<1 | 2 | 4, string> = {
  1: 'Hero Shot',
  2: 'Campaign Collections',
  4: 'Editorial Portraits',
};

const FAQ_ITEMS = [
  {
    q: 'What is StudioLayer AI?',
    a: 'StudioLayer AI creates professional fashion campaign imagery from a single garment photograph. Simply upload your garment, choose a Studio Talent, and generate premium editorial visuals in minutes—without organizing a traditional photoshoot.',
  },
  {
    q: 'What kind of garment photos work best?',
    a: 'For the best results, upload a clear photograph of your garment on a plain background. Hanger photographs work best, provided the garment is fully visible, evenly lit, and free from heavy wrinkles or obstructions.',
  },
  {
    q: 'Can I choose my Studio Talent?',
    a: 'Yes.\n\nStudioLayer AI includes a curated Talent Library featuring multiple ethnicities, age groups, and body types. Once selected, the same Studio Talent remains visually consistent throughout your campaign.',
  },
  {
    q: 'Do I own the images I create?',
    a: 'Yes.\n\nImages generated for your Studio are yours to download and use in accordance with our Terms of Service across ecommerce, websites, marketplaces, advertising, social media, and marketing campaigns.',
  },
  {
    q: 'Will my garment colour, texture, and details remain accurate?',
    a: "StudioLayer AI is crafted to faithfully preserve your garment's colour, texture, silhouette, and key construction details while placing it naturally on your selected Studio Talent. Each editorial image is produced with the care and precision expected of premium fashion imagery.",
  },
  {
    q: 'How long does it take to create editorial images?',
    a: 'Most editorial images are ready within a few minutes. Timing may vary depending on image complexity and current studio demand.',
  },
  {
    q: 'What happens after my complimentary Studio Credit is used?',
    a: 'Every new Studio receives one complimentary Studio Credit for a Hero Shot.\n\nOnce your complimentary Studio Credit has been used, continue creating with a Studio Membership.',
  },
  {
    q: 'Is my uploaded data secure?',
    a: 'Yes.\n\nYour uploaded garments and editorial images remain associated with your Studio. We take reasonable measures to protect your content and account information.',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepLabel({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-5 h-5 rounded-full bg-foreground text-background text-[11px] font-semibold flex items-center justify-center shrink-0">
        {number}
      </span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

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


function extractRenderOutputUrl(render: unknown): string | null {
  if (!render || typeof render !== 'object') return null;
  const record = render as Record<string, unknown>;
  for (const key of ['outputImageUrl', 'outputUrl', 'url', 'image_url']) {
    const value = record[key];
    if (typeof value === 'string' && value.startsWith('http')) return value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// StudioPage
// ---------------------------------------------------------------------------

export default function StudioPage() {
  const {
    workflow,
    workspace,
    setSourceImageUrl,
    setGarmentPlacement,
    setGarmentLengthSelection,
    setImageCount,
    resetStudioSession,
    patchWorkflow,
    setActiveRenderIds,
    setRootRenderIds,
    setMasterOutputUrls,
    setRefinementPending,
    setGenerationInFlight,
    patchWorkspace,
  } = useStudioWorkflow();

  const {
    activeRenderIds,
    rootRenderIds,
    masterOutputUrls,
    customCropRects,
    customCropAspects,
    refinementPending,
    generationInFlight,
  } = workspace;

  const [refinePanelSlot, setRefinePanelSlot] = useState<number | null>(null);
  const [displayUrlOverrides, setDisplayUrlOverrides] = useState<Record<number, string>>({});
  const [customCropDialogOpen, setCustomCropDialogOpen] = useState(false);
  const [refineInFlight, setRefineInFlight] = useState(() => refinementPending != null);
  const [activeRefinement, setActiveRefinement] = useState<RefinementType | null>(
    () => refinementPending?.refinementType ?? null,
  );
  const [showValidation, setShowValidation]     = useState(false);

  const [showProRequiredDialog, setShowProRequiredDialog] = useState(false);
  const [directShootOpen, setDirectShootOpen] = useState(false);
  const [imageInspection, setImageInspection] = useState<StudioImageInspectionTarget | null>(null);
  const [awaitingResultDisplay, setAwaitingResultDisplay] = useState(false);
  const [loadedResultUrls, setLoadedResultUrls] = useState<Set<string>>(() => new Set());
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const completionHandledRef = useRef('');
  const creditSyncBatchRef = useRef('');
  const refinementHandledRef = useRef<number | null>(null);

  const workflowValidation = validateStudioWorkflow(workflow);

  // ── Gallery → Workspace handoff (sessionStorage) ───────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem('studioRefineRender');
    if (!stored) return;
    try {
      const rr = JSON.parse(stored) as { id: number; sourceImageUrl: string; outputImageUrl?: string | null };
      if (rr?.id && rr?.sourceImageUrl) {
        patchWorkflow({ sourceImageUrl: rr.sourceImageUrl });
        setActiveRenderIds([rr.id]);
        sessionStorage.removeItem('studioRefineRender');
      }
    } catch { /* ignore malformed data */ }
  }, [patchWorkflow]);

  // ── API hooks ──────────────────────────────────────────────────────────────
  const queryClient  = useQueryClient();
  const { toast }    = useToast();
  const { data: user }                            = useGetMe();
  const { data: usage }  = useGetRenderUsage();
  const { data: identities = [] }                 = useGetIdentities();
  const createRender = useCreateRender();
  const {
    inFlight: downloadAllInFlight,
    elapsedSec: downloadAllElapsedSec,
    run: runDownloadAll,
  } = useDownloadInFlight();

  // ── Multi-render polling — dynamic batch (up to 20 Custom Campaign) ───────
  const allRenderData = useActiveRenders(activeRenderIds);

  const pendingChildId = refinementPending?.childRenderId ?? 0;
  const { data: pendingRefinementRender } = useGetRender(pendingChildId, {
    query: {
      enabled: pendingChildId > 0,
      refetchInterval: makeRefetchInterval(pendingChildId > 0),
    },
  } as never);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isProcessing = allRenderData.some(
    (r) => r?.status === 'processing' || r?.status === 'pending',
  );

  const allOutputUrls: (string | null)[] = allRenderData.map((render) => {
    if (!render) return null;
    const r = render as unknown as Record<string, unknown>;
    for (const key of ['outputImageUrl', 'outputUrl', 'url', 'image_url']) {
      const v = r[key];
      if (typeof v === 'string' && v.startsWith('http')) return v;
    }
    return null;
  });

  const getSlotDisplayUrl = (slotIndex: number): string | null =>
    displayUrlOverrides[slotIndex] ?? allOutputUrls[slotIndex] ?? null;

  const activeRefineSlot = refinePanelSlot ?? 0;

  const resolvedOutputUrl: string | null = getSlotDisplayUrl(activeRefineSlot)
    ?? getSlotDisplayUrl(0);

  const hasOutput    = allRenderData.some((r) => r?.status === 'completed') && !!resolvedOutputUrl;

  const completedOutputSlots = activeRenderIds
    .map((id, index) => ({
      id,
      url: allOutputUrls[index],
      status: allRenderData[index]?.status,
    }))
    .filter((slot) => slot.status === 'completed' && typeof slot.url === 'string');

  const allResultsDisplayed =
    completedOutputSlots.length > 0 &&
    completedOutputSlots.every((slot) => loadedResultUrls.has(slot.url!));

  const showGenerationProgress = awaitingResultDisplay && !allResultsDisplayed;

  const isRefinementProcessing =
    refinementPending != null &&
    (!pendingRefinementRender ||
      pendingRefinementRender.status === 'processing' ||
      pendingRefinementRender.status === 'pending');

  const showRefinementProgress = isRefinementProcessing;

  const isGenerationBusy =
    awaitingResultDisplay ||
    createRender.isPending ||
    isProcessing ||
    refineInFlight ||
    refinementPending != null;

  const isComplimentaryTier = isComplimentaryMembershipTier(usage);
  const complimentaryExhausted = isComplimentaryCreditExhaustedForUser(user, usage);
  const limitBlocked = isStudioCreditLimitBlocked(usage) && !resolveStudioAdminFlag(user, usage);
  const canCreate    = canGenerateStudioWorkflow(workflow, {
    limitBlocked,
    isPending: createRender.isPending,
    isProcessing: isGenerationBusy,
  });

  const generationCreditCost = resolveGenerationCreditCost({
    imageCount: resolveWorkflowImageCount(workflow),
    customCampaign: workflow.customCampaign,
    outputResolution: workflow.outputResolution,
  });

  const shootImageCount = resolveWorkflowImageCount(workflow);

  const createButtonLabel = workflow.customCampaign
    ? 'Custom Campaign'
    : SHOOT_TYPE_LABEL[workflow.imageCount];

  const beginGenerationFeedback = (preloadedUrls: string[] = []) => {
    setAwaitingResultDisplay(true);
    setGenerationInFlight(true);
    setLoadedResultUrls(new Set(preloadedUrls));
    setGenerationStartedAt(Date.now());
    setElapsedSec(0);
  };

  const resetGenerationFeedback = () => {
    setAwaitingResultDisplay(false);
    setGenerationInFlight(false);
    setLoadedResultUrls(new Set());
    setGenerationStartedAt(null);
    setElapsedSec(0);
  };

  const markResultImageLoaded = (url: string) => {
    setLoadedResultUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  const bindResultImageRef = (url: string) => (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) {
      markResultImageLoaded(url);
    }
  };

  useEffect(() => {
    if (isComplimentaryTier && (workflow.imageCount !== 1 || workflow.customCampaign)) {
      patchWorkflow({ imageCount: 1, customCampaign: false });
    }
  }, [isComplimentaryTier, workflow.imageCount, workflow.customCampaign, patchWorkflow]);

  useEffect(() => {
    if (!awaitingResultDisplay || generationStartedAt == null) return;
    const tick = () => {
      setElapsedSec(Math.floor((Date.now() - generationStartedAt) / 1000));
    };
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [awaitingResultDisplay, generationStartedAt]);

  useEffect(() => {
    if (!awaitingResultDisplay || activeRenderIds.length === 0) return;

    const statuses = activeRenderIds.map((_, index) => allRenderData[index]?.status);
    const allSettled = statuses.every(
      (status) => status === 'completed' || status === 'failed',
    );
    if (!allSettled) return;

    const anyCompleted = statuses.some((status) => status === 'completed');
    if (!anyCompleted) {
      resetGenerationFeedback();
    }
  }, [awaitingResultDisplay, activeRenderIds, allRenderData]);

  // Refresh confirmed balance once a render batch settles (credits completed or restored).
  useEffect(() => {
    if (activeRenderIds.length === 0) return;

    const batchKey = activeRenderIds.join(',');
    const statuses = activeRenderIds.map((_, index) => allRenderData[index]?.status);
    const allSettled = statuses.every(
      (status) => status === 'completed' || status === 'failed',
    );
    if (!allSettled || creditSyncBatchRef.current === batchKey) return;

    creditSyncBatchRef.current = batchKey;
    void queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
  }, [activeRenderIds, allRenderData, queryClient]);

  // Finalize refinement only after the child render settles — keep parent visible until then.
  useEffect(() => {
    if (!refinementPending || !pendingRefinementRender) return;

    const { status } = pendingRefinementRender;
    if (status !== 'completed' && status !== 'failed') return;

    const { childRenderId, slot, parentRenderId } = refinementPending;
    if (refinementHandledRef.current === childRenderId) return;
    refinementHandledRef.current = childRenderId;

    const outputUrl = extractRenderOutputUrl(pendingRefinementRender);
    const refinementSucceeded = status === 'completed' && outputUrl != null;

    if (refinementSucceeded) {
      setActiveRenderIds((prev) => {
        const next = [...prev];
        next[slot] = childRenderId;
        return next;
      });
      revokeCropObjectUrl(displayUrlOverrides[slot]);
      setDisplayUrlOverrides((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
      patchWorkspace({
        customCropRects: Object.fromEntries(
          Object.entries(customCropRects).filter(([key]) => Number(key) !== slot),
        ),
        customCropAspects: Object.fromEntries(
          Object.entries(customCropAspects).filter(([key]) => Number(key) !== slot),
        ),
      });
    } else {
      if (activeRenderIds[slot] !== parentRenderId) {
        setActiveRenderIds((prev) => {
          const next = [...prev];
          next[slot] = parentRenderId;
          return next;
        });
      }
      toast({
        title: "We couldn't complete this refinement.",
        description: withErrorContactHelper('Your original image is unchanged. Please try again.'),
      });
    }

    setRefinementPending(null);
    setRefineInFlight(false);
    setActiveRefinement(null);
    void queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListRendersQueryKey() });
  }, [
    refinementPending,
    pendingRefinementRender,
    activeRenderIds,
    displayUrlOverrides,
    queryClient,
    toast,
  ]);

  useEffect(() => {
    if (!awaitingResultDisplay || !allResultsDisplayed || !resolvedOutputUrl) return;
    if (!workflow.sourceImageUrl) return;

    const completionKey = `${activeRenderIds.join(',')}:${resolvedOutputUrl}`;
    if (completionHandledRef.current === completionKey) return;
    completionHandledRef.current = completionKey;

    // Generation lifecycle complete — reset progress UI only.
    // Presentation is intentionally silent; completionHandledRef is reserved
    // for a future subtle completion experience.
    resetGenerationFeedback();
  }, [
    awaitingResultDisplay,
    allResultsDisplayed,
    resolvedOutputUrl,
    workflow.sourceImageUrl,
    activeRenderIds,
  ]);

  const handleShootTypeSelect = (value: 1 | 2 | 4) => {
    if (isGenerationBusy) return;
    if (isPremiumShootTypeLocked(usage, value)) {
      setShowProRequiredDialog(true);
      return;
    }
    patchWorkflow({
      imageCount: value,
      customCampaign: false,
      usedPoses: trimUsedPosesToShotCount(workflow.usedPoses, value),
    });
  };

  const handleCustomCampaignSelect = () => {
    if (isGenerationBusy) return;
    if (isPremiumShootTypeLocked(usage, 2)) {
      setShowProRequiredDialog(true);
      return;
    }
    patchWorkflow({
      customCampaign: true,
      usedPoses: trimUsedPosesToShotCount(workflow.usedPoses, workflow.customImageCount),
    });
  };

  const handleCustomImageCountChange = (count: number) => {
    patchWorkflow({
      customCampaign: true,
      customImageCount: count,
      usedPoses: trimUsedPosesToShotCount(workflow.usedPoses, count),
    });
  };

  const handleDirectShootConfirm = (selectedPoseIds: string[]) => {
    patchWorkflow({
      usedPoses: selectedPoseIds.length > 0 ? selectedPoseIds : undefined,
    });
  };

  const handleDirectShootDismiss = () => {
    patchWorkflow({ usedPoses: undefined });
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFileSelect = (url: string) => {
    setSourceImageUrl(url);
    setShowValidation(false);
  };


  const handleRender = () => {
    if (isGenerationBusy) return;
    if (!workflowValidation.isComplete) {
      setShowValidation(true);
      toast({ title: 'Almost there', description: workflowValidation.message ?? undefined });
      return;
    }
    if (isStudioCreditLimitBlocked(usage)) {
      toast({
        title: 'Studio Credit used',
        description: 'View Membership to continue creating.',
      });
      return;
    }

    if (!resolveStudioAdminFlag(user, usage)) {
      const remaining =
        usage?.remaining
        ?? membershipCreditsRemaining(usage?.tier ?? 'free', usage?.used ?? 0, usage?.limit ?? null);
      if (remaining < generationCreditCost) {
        toast({
          title: 'Insufficient Studio Credits',
          description: `This shoot requires ${formatStudioCredits(generationCreditCost)}.`,
        });
        return;
      }
    }

    const selectedIdentity = (identities as { id: string; gender?: string; ageGroup?: string }[])
      .find((i) => i.id === workflow.talentId);

    const renderingRequest = buildGenerationRequest(workflow, selectedIdentity);

    beginGenerationFeedback();
    setActiveRenderIds([]);
    setRootRenderIds([]);
    setMasterOutputUrls({});
    completionHandledRef.current = '';
    creditSyncBatchRef.current = '';

    createRender.mutate(
      { data: renderingRequest },
      {
        onSuccess: (renders) => {
          const ids = (renders as unknown as { id: number }[]).map((r) => r.id);
          setActiveRenderIds(ids);
        },
        onError: (error: unknown) => {
          resetGenerationFeedback();
          if (process.env.NODE_ENV === 'development') {
            console.error('[Studio] generate failed', error);
          }
          toast({
            title: "We couldn't complete your request.",
            description: withErrorContactHelper(renderApiErrorDescription(error)),
          });
        },
      },
    );
  };


  const handleNewPhotoshoot = () => {
    Object.values(displayUrlOverrides).forEach((url) => revokeCropObjectUrl(url));
    resetStudioSession();
    setRefinePanelSlot(null);
    setDisplayUrlOverrides({});
    setRefineInFlight(false);
    setActiveRefinement(null);
    refinementHandledRef.current = null;
    setShowValidation(false);
    resetGenerationFeedback();
    completionHandledRef.current = '';
    createRender.reset();
  };

  const openImageInspection = (target: StudioImageInspectionTarget) => {
    setImageInspection(target);
  };

  const handleDownloadError = (message: string) => {
    toast({
      title: message,
      description: withErrorContactHelper('Please try again in a few moments.'),
    });
  };

  const handleOpenRefine = (slot: number) => {
    if (refinementPending != null && refinementPending.slot === slot && isRefinementProcessing) return;
    setRefinePanelSlot(slot);
  };

  const handleRefine = (type: RefinementType, slot: number) => {
    if (refineInFlight || awaitingResultDisplay || createRender.isPending || isProcessing) return;
    if (refinementPending != null && refinementPending.slot === slot && isRefinementProcessing) return;

    if (isStudioCreditLimitBlocked(usage) && !resolveStudioAdminFlag(user, usage)) {
      toast({
        title: 'Studio Credit used',
        description: 'View Membership to continue refining.',
      });
      return;
    }

    const parentRenderId = activeRenderIds[slot];
    if (!parentRenderId) return;

    const selectedIdentity = (identities as { id: string; gender?: string; ageGroup?: string }[])
      .find((i) => i.id === workflow.talentId);

    setRefinePanelSlot(slot);
    setRefineInFlight(true);
    setActiveRefinement(type);

    createRender.mutate(
      {
        data: buildRefinementRequest(workflow, selectedIdentity, {
          parentRenderId,
          refinementType: type,
        }),
      },
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
            slot,
            parentRenderId,
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

  const handleOpenCrop = () => {
    const slot = refinePanelSlot ?? 0;
    const sourceUrl = masterOutputUrls[slot] ?? allOutputUrls[slot];
    const renderId = activeRenderIds[slot];
    if (!sourceUrl || !renderId) {
      toast({
        title: "Master asset unavailable.",
        description: 'Please wait for the image to finish loading.',
      });
      return;
    }
    setCustomCropDialogOpen(true);
  };

  const handleCustomCropApply = async (
    rect: NormalizedCropRect,
    aspect: CropAspectMode,
  ) => {
    const slot = refinePanelSlot ?? 0;
    const sourceUrl = masterOutputUrls[slot] ?? allOutputUrls[slot];
    const renderId = activeRenderIds[slot];
    if (!sourceUrl || !renderId) return;

    const previousRect = customCropRects[slot];
    const previousAspect = customCropAspects[slot];
    const previousDisplayUrl = displayUrlOverrides[slot];

    patchWorkspace({
      customCropRects: { ...customCropRects, [slot]: rect },
      customCropAspects: { ...customCropAspects, [slot]: aspect },
    });

    try {
      const sourceBlob = await fetchEditorialImageBlob(sourceUrl, renderId);
      const croppedUrl = await cropImageBlobToRect(sourceBlob, rect);
      revokeCropObjectUrl(displayUrlOverrides[slot]);
      setDisplayUrlOverrides((prev) => ({ ...prev, [slot]: croppedUrl }));
    } catch {
      patchWorkspace({
        customCropRects: previousRect
          ? { ...customCropRects, [slot]: previousRect }
          : Object.fromEntries(
            Object.entries(customCropRects).filter(([key]) => Number(key) !== slot),
          ),
        customCropAspects: previousAspect
          ? { ...customCropAspects, [slot]: previousAspect }
          : Object.fromEntries(
            Object.entries(customCropAspects).filter(([key]) => Number(key) !== slot),
          ),
      });
      if (previousDisplayUrl) {
        setDisplayUrlOverrides((prev) => ({ ...prev, [slot]: previousDisplayUrl }));
      } else {
        setDisplayUrlOverrides((prev) => {
          const next = { ...prev };
          delete next[slot];
          return next;
        });
      }
      toast({
        title: "Couldn't apply crop.",
        description: 'Please try again.',
      });
    }
  };

  const handleRevertToOriginal = () => {
    const slot = refinePanelSlot ?? 0;
    const rootId = rootRenderIds[slot];
    if (!rootId) return;

    revokeCropObjectUrl(displayUrlOverrides[slot]);
    setActiveRenderIds((prev) => {
      const next = [...prev];
      next[slot] = rootId;
      return next;
    });
    setDisplayUrlOverrides((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    patchWorkspace({
      customCropRects: Object.fromEntries(
        Object.entries(customCropRects).filter(([key]) => Number(key) !== slot),
      ),
      customCropAspects: Object.fromEntries(
        Object.entries(customCropAspects).filter(([key]) => Number(key) !== slot),
      ),
    });
  };

  const handleRefineZoom = () => {
    const slot = refinePanelSlot ?? 0;
    const url = getSlotDisplayUrl(slot);
    if (!url) return;
    openImageInspection({
      imageUrl: url,
      alt: 'Editorial fashion image',
      renderId: activeRenderIds[slot],
    });
  };

  const handleDownloadAll = () => {
    void runDownloadAll(async () => {
      const zip = new JSZip();
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      await Promise.all(
        allRenderData.map(async (render, i) => {
          if (!render || render.status !== 'completed') return;
          const url = (render as unknown as Record<string, unknown>)['outputImageUrl'] as string | undefined;
          const renderId = activeRenderIds[i];
          if (!url?.startsWith('http')) return;
          try {
            const blob = await fetchEditorialImageBlob(url, renderId);
            if (blob.size === 0) return;
            zip.file(`image_${i + 1}.png`, blob);
          } catch { /* skip failed images */ }
        }),
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const obj = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: obj,
        download: `StudioLayerAI_Photoshoot_${ts}.zip`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(obj), 10_000);
    });
  };

  const showResultToolbar = hasOutput && allResultsDisplayed && !showGenerationProgress && !showRefinementProgress;

  const refinePanelImageLabel =
    activeRenderIds.length > 1 && refinePanelSlot != null
      ? `Image ${refinePanelSlot + 1}`
      : undefined;

  const isSlotRefining = (slotIndex: number) =>
    refinementPending != null
    && refinementPending.slot === slotIndex
    && isRefinementProcessing;

  const showRefinePanel = refinePanelSlot != null && showResultToolbar;

  useEffect(() => {
    if (!showResultToolbar || rootRenderIds.length > 0 || activeRenderIds.length === 0) return;

    const hasAllMasterUrls = activeRenderIds.every((_, i) => typeof allOutputUrls[i] === 'string');
    if (!hasAllMasterUrls) return;

    setRootRenderIds([...activeRenderIds]);
    setMasterOutputUrls(
      Object.fromEntries(
        activeRenderIds.map((_, i) => [i, allOutputUrls[i] as string]),
      ),
    );
  }, [showResultToolbar, activeRenderIds, rootRenderIds.length, allOutputUrls, setRootRenderIds, setMasterOutputUrls]);

  // Restore crop display overrides after route return or sessionStorage hydration.
  useEffect(() => {
    let cancelled = false;

    async function restoreCropOverrides() {
      for (const [slotKey, rect] of Object.entries(customCropRects)) {
        const slot = Number(slotKey);
        if (!Number.isInteger(slot)) continue;
        if (displayUrlOverrides[slot]) continue;

        const sourceUrl = masterOutputUrls[slot] ?? allOutputUrls[slot];
        const renderId = activeRenderIds[slot];
        if (!sourceUrl || !renderId) continue;

        try {
          const sourceBlob = await fetchEditorialImageBlob(sourceUrl, renderId);
          const croppedUrl = await cropImageBlobToRect(sourceBlob, rect);
          if (!cancelled) {
            setDisplayUrlOverrides((prev) => ({ ...prev, [slot]: croppedUrl }));
          }
        } catch {
          /* crop restore is best-effort */
        }
      }
    }

    void restoreCropOverrides();
    return () => {
      cancelled = true;
    };
  }, [activeRenderIds, allOutputUrls, customCropRects, displayUrlOverrides, masterOutputUrls]);

  // Resume in-progress generation UI after route return — never restart generation.
  useEffect(() => {
    if (!generationInFlight || activeRenderIds.length === 0) return;

    const statuses = activeRenderIds.map((_, index) => allRenderData[index]?.status);
    const stillProcessing = statuses.some(
      (status) => status === 'processing' || status === 'pending' || status === undefined,
    );
    const allSettled = statuses.every(
      (status) => status === 'completed' || status === 'failed',
    );

    if (stillProcessing) {
      setAwaitingResultDisplay(true);
      setGenerationStartedAt((prev) => prev ?? Date.now());
      return;
    }

    if (allSettled) {
      setGenerationInFlight(false);
      setAwaitingResultDisplay(false);
    }
  }, [generationInFlight, activeRenderIds, allRenderData, setGenerationInFlight]);

  const renderEditorialCell = (slotIndex: number) => {
    const id = activeRenderIds[slotIndex];
    if (!id) return null;

    const render = allRenderData[slotIndex];
    const url = getSlotDisplayUrl(slotIndex);
    const status = render?.status ?? 'pending';
    const imageVisible =
      status === 'completed' && !!url && !showGenerationProgress && !showRefinementProgress;
    const isRefineTarget = refinePanelSlot === slotIndex;

    return (
      <div
        key={id}
        className={cn(
          'sl-studio-editorial-cell',
          isRefineTarget && showResultToolbar && 'ring-2 ring-foreground/20 rounded',
        )}
      >
        <div className="sl-studio-editorial-cell-inner">
          {!url && !showGenerationProgress && !showRefinementProgress && status !== 'failed' && (
            <StudioEditorialPlaceholder visible compact />
          )}
          {status === 'completed' && url && (
            <StudioEditorialImage
              src={url}
              alt={`Fashion image ${slotIndex + 1}`}
              visible={imageVisible}
              maxHeightClass="max-h-[min(calc(50vh-2rem),480px)]"
              onLoad={() => markResultImageLoaded(url)}
              imageRef={bindResultImageRef(url)}
              onInspect={() => openImageInspection({
                imageUrl: url,
                alt: `Fashion image ${slotIndex + 1}`,
                renderId: id,
              })}
            />
          )}
          {status === 'failed' && <StudioEditorialFailedState />}
        </div>
        {status === 'completed' && url && !showGenerationProgress && !showRefinementProgress && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-end bg-gradient-to-t from-black/25 to-transparent p-2">
            <EditorialImageActions
              renderId={id}
              outputImageUrl={url}
              refineDisabled={isSlotRefining(slotIndex)}
              refineActive={isRefineTarget}
              onRefine={() => handleOpenRefine(slotIndex)}
              onDownloadError={handleDownloadError}
            />
          </div>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
      <AppShell footer>
          <EditorialPageHeader
            companion="Workspace"
            supporting="Garment to Campaign"
            tagline="Professional fashion photography in minutes"
            className="sl-page-header--workspace"
            aside={<AccountStatementDownloadLink variant="header" />}
          />

          <div className="relative">
            <StudioBrandWatermark />

            <div className={cn('relative z-[1]', complimentaryExhausted && 'pointer-events-none select-none')}>
          {/* Workspace grid — hero result first on mobile */}
          <div className="sl-studio-workspace-grid mb-10">

            {/* ── LEFT PANEL — Controls ───────────────────────────────── */}
            <div className={cn('order-2 lg:order-1 space-y-8 transition-opacity duration-300', (showGenerationProgress || showRefinementProgress) && 'opacity-[0.68]')}>
              {/* Step 1: Upload Outfit */}
              <section className="space-y-3">
                <StepLabel number={1} title="Upload Outfit" />

                <div className={cn(showValidation && !workflowValidation.hasGarment && 'rounded ring-2 ring-destructive ring-offset-1')}>
                  <FileUpload
                    previewUrl={workflow.sourceImageUrl || null}
                    onFileSelect={handleFileSelect}
                    disabled={isGenerationBusy}
                  />
                </div>
                {showValidation && !workflowValidation.hasGarment && (
                  <p className="text-xs text-destructive font-mono">Please upload a garment photo.</p>
                )}

                {/* Garment type selector */}
                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">Garment Category</p>
                    <p className="sl-ui-helper">
                      Helps StudioLayer AI understand your garment more accurately.
                    </p>
                  </div>
                  <div className="sl-garment-category-grid">
                    {GARMENT_TYPES.map((g) => {
                      const isSelected = workflow.garmentPlacement === g.value;
                      return (
                        <StudioToggleOption
                          key={g.value}
                          selected={isSelected}
                          disabled={isGenerationBusy}
                          onClick={() => {
                            setGarmentPlacement(g.value as GarmentPlacement);
                            setShowValidation(false);
                          }}
                          className="sl-garment-category-option rounded px-2.5 py-3 sm:px-2 sm:py-2.5"
                        >
                          <p className="sl-garment-category-label font-semibold">{g.label}</p>
                          <p className={cn(
                            'sl-garment-category-sub font-mono mt-0.5',
                            isSelected ? 'opacity-75' : 'text-muted-foreground',
                          )}>
                            {g.sub}
                          </p>
                        </StudioToggleOption>
                      );
                    })}
                  </div>
                  {showValidation && !workflowValidation.hasCategory && (
                    <p className="text-xs text-destructive font-mono">Please select a garment type.</p>
                  )}
                </div>

                {workflow.garmentPlacement === 'full_body' && (
                  <div
                    className={cn(
                      'space-y-2 overflow-hidden transition-all duration-200 ease-out',
                      'animate-in fade-in slide-in-from-top-1',
                    )}
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-foreground">Length</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {GARMENT_LENGTH_OPTIONS.map((option) => {
                        const isSelected = workflow.garmentLengthSelection === option.value;
                        return (
                          <StudioToggleOption
                            key={option.value}
                            selected={isSelected}
                            disabled={isGenerationBusy}
                            onClick={() => {
                              setGarmentLengthSelection(option.value);
                              setShowValidation(false);
                            }}
                            className="rounded px-2 py-2"
                          >
                            <p className="text-xs font-semibold">{option.label}</p>
                          </StudioToggleOption>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Step 2: Select Your Model */}
              <section className="space-y-3">
                <StepLabel number={2} title="Select Your Model" />
                {showValidation && !workflowValidation.hasTalent && (
                  <p className="text-xs text-destructive font-mono">Please select your model.</p>
                )}
                <div className={cn(showValidation && !workflowValidation.hasTalent && 'rounded ring-2 ring-destructive ring-offset-1')}>
                  <SelectedTalentSummary
                    talent={(identities as ModelIdentity[]).find((i) => i.id === workflow.talentId) ?? null}
                    disabled={isGenerationBusy}
                  />
                </div>
              </section>

              {/* Step 3: Shoot Type */}
              <section className="sl-shoot-type-section space-y-3 pt-1">
                <StepLabel number={3} title="Shoot Type" />
                <div className="sl-shoot-type-panel">
                  <ShootTypeSelector
                    options={IMAGE_COUNT_OPTIONS}
                    imageCount={workflow.imageCount}
                    customCampaignActive={workflow.customCampaign}
                    isPremiumLocked={(value) => isPremiumShootTypeLocked(usage, value)}
                    disabled={isGenerationBusy}
                    onSelect={handleShootTypeSelect}
                  />
                  <CustomCampaignControl
                    selected={workflow.customCampaign}
                    imageCount={workflow.customImageCount}
                    premiumLocked={isPremiumShootTypeLocked(usage, 2)}
                    disabled={isGenerationBusy}
                    onSelect={handleCustomCampaignSelect}
                    onImageCountChange={handleCustomImageCountChange}
                  />
                  <ResolutionSelector
                    value={workflow.outputResolution}
                    disabled={isGenerationBusy}
                    onChange={(outputResolution) => patchWorkflow({ outputResolution })}
                  />
                  <p className="sl-shoot-type-credit-total">
                    {formatStudioCredits(generationCreditCost)}
                  </p>
                  <button
                    type="button"
                    className="sl-direct-shoot-trigger"
                    disabled={isGenerationBusy}
                    onClick={() => setDirectShootOpen(true)}
                  >
                    CHOOSE POSE
                  </button>
                </div>
              </section>

              {/* Create CTA */}
              <div className="space-y-3 pt-1">
                <StudioWorkspaceButton
                  fullWidth
                  loading={isGenerationBusy}
                  onClick={handleRender}
                  disabled={!canCreate}
                  className="h-12 text-sm font-semibold"
                  data-testid="button-render"
                >
                  <Camera className="w-4 h-4" />
                  {isGenerationBusy ? 'Creating…' : `Create ${createButtonLabel}`}
                </StudioWorkspaceButton>

                <p className="mx-auto mt-[18px] mb-[15px] max-w-[390px] text-center text-[11px] font-normal leading-relaxed text-muted-foreground/80">
                  <span className="font-semibold">Editorial Note:</span>
                  {' '}
                  StudioLayer AI creates premium fashion imagery using advanced AI technology. Every render is carefully produced to preserve your garment&apos;s colour, texture, and character. Minor variations are a natural part of the creative rendering process.
                </p>
              </div>
            </div>

            {/* ── RIGHT PANEL — Editorial hero ─────────────────────────── */}
            <div className="order-1 lg:order-2 sl-studio-result-stage">
              {activeRenderIds.length <= 1 ? (
                <>
                  <StudioEditorialCanvas className="relative">
                    <StudioEditorialProgressOverlay
                      visible={showGenerationProgress || showRefinementProgress}
                      label={showRefinementProgress ? 'Applying refinement…' : 'Creating your image…'}
                      elapsedSec={elapsedSec}
                    />
                    <StudioEditorialPlaceholder
                      visible={!resolvedOutputUrl && !showGenerationProgress && !showRefinementProgress}
                    />
                    {resolvedOutputUrl ? (
                      <StudioEditorialImage
                        src={resolvedOutputUrl}
                        alt="Editorial fashion image"
                        visible={!showGenerationProgress && !showRefinementProgress}
                        onLoad={() => markResultImageLoaded(resolvedOutputUrl)}
                        imageRef={bindResultImageRef(resolvedOutputUrl)}
                        testId="img-render-output"
                        onInspect={() => openImageInspection({
                          imageUrl: resolvedOutputUrl,
                          alt: 'Editorial fashion image',
                          renderId: activeRenderIds[0],
                        })}
                      />
                    ) : null}
                    {resolvedOutputUrl && showResultToolbar && (
                      <div className="absolute bottom-0 left-0 right-0 flex justify-end bg-gradient-to-t from-black/25 to-transparent p-3">
                        <EditorialImageActions
                          renderId={activeRenderIds[0]!}
                          outputImageUrl={resolvedOutputUrl}
                          refineDisabled={isSlotRefining(0)}
                          refineActive={refinePanelSlot === 0}
                          onRefine={() => handleOpenRefine(0)}
                          onDownloadError={handleDownloadError}
                        />
                      </div>
                    )}
                  </StudioEditorialCanvas>

                  {showResultToolbar && (
                    <div className="space-y-3">
                      <StudioResultToolbar
                        onNewImage={handleNewPhotoshoot}
                      />
                      {showRefinePanel && refinePanelSlot != null && (
                        <StudioRefinePanel
                          disabled={isGenerationBusy}
                          refineInFlight={refineInFlight}
                          activeRefinement={activeRefinement}
                          imageLabel={refinePanelImageLabel}
                          hasCropApplied={displayUrlOverrides[refinePanelSlot] != null}
                          canRevert={
                            rootRenderIds[refinePanelSlot] != null
                            && activeRenderIds[refinePanelSlot] !== rootRenderIds[refinePanelSlot]
                          }
                          onRefine={(type) => handleRefine(type, refinePanelSlot)}
                          onOpenCrop={handleOpenCrop}
                          onRevert={handleRevertToOriginal}
                          onZoom={handleRefineZoom}
                        />
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <StudioEditorialCanvas
                    className="sl-studio-editorial-canvas--multi"
                    minHeightClass="min-h-0"
                    maxHeightClass="max-h-none"
                  >
                    <StudioEditorialProgressOverlay
                      visible={showGenerationProgress || showRefinementProgress}
                      label={showRefinementProgress ? 'Applying refinement…' : 'Creating your images…'}
                      elapsedSec={elapsedSec}
                    />
                    {activeRenderIds.length > 0 && (
                      <FixedBatchViewport
                        totalCount={activeRenderIds.length}
                        gridClassName={cn(
                          (showGenerationProgress || showRefinementProgress) && 'opacity-35',
                        )}
                        renderCell={(index) => renderEditorialCell(index)}
                      />
                    )}
                  </StudioEditorialCanvas>

                  {showResultToolbar && (
                    <div className="space-y-3">
                      <StudioResultToolbar
                        downloadLabel="Download All"
                        onDownloadAll={handleDownloadAll}
                        downloadAllLoading={downloadAllInFlight}
                        downloadAllPreparingLabel={formatDownloadPreparingLabel(downloadAllElapsedSec)}
                        onNewImage={handleNewPhotoshoot}
                      />
                      {showRefinePanel && refinePanelSlot != null && (
                        <StudioRefinePanel
                          disabled={isGenerationBusy}
                          refineInFlight={refineInFlight}
                          activeRefinement={activeRefinement}
                          imageLabel={refinePanelImageLabel}
                          hasCropApplied={displayUrlOverrides[refinePanelSlot] != null}
                          canRevert={
                            rootRenderIds[refinePanelSlot] != null
                            && activeRenderIds[refinePanelSlot] !== rootRenderIds[refinePanelSlot]
                          }
                          onRefine={(type) => handleRefine(type, refinePanelSlot)}
                          onOpenCrop={handleOpenCrop}
                          onRevert={handleRevertToOriginal}
                          onZoom={handleRefineZoom}
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── FAQ ────────────────────────────────────────────────────────── */}
          <div className="border-t border-border pt-6">
            <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
              Questions
            </h3>
            <Accordion type="single" collapsible className="space-y-2">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border border-border rounded bg-card px-4"
                >
                  <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline py-4">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="whitespace-pre-line text-xs text-muted-foreground pb-4 font-mono leading-[1.65]">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
            </div>
          </div>

      <Dialog open={complimentaryExhausted} onOpenChange={() => undefined}>
        <DialogContent
          className="sl-complimentary-credit-dialog gap-8 border-0 px-10 py-10 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:max-w-[36rem] [&>button]:hidden"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="space-y-4 text-left">
            <DialogTitle className="text-base font-medium leading-relaxed tracking-normal text-foreground md:whitespace-nowrap">
              Your complimentary Studio Credit has been used.
            </DialogTitle>
            <DialogDescription className="max-w-[30rem] text-sm leading-relaxed">
              Continue creating with a Studio Membership.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-stretch sm:space-x-0">
            <Link href="/billing" className="sl-studio-btn sl-studio-btn--primary flex-1 no-underline">
              View Membership
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudioImageInspector
        target={imageInspection}
        open={imageInspection != null}
        onOpenChange={(open) => {
          if (!open) setImageInspection(null);
        }}
      />

      <Dialog open={showProRequiredDialog} onOpenChange={setShowProRequiredDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Studio Membership Required</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm leading-relaxed text-muted-foreground">
                <p>Your complimentary Studio includes one Hero Shot.</p>
                <p>
                  Editorial Portraits and Campaign Collections are available with
                  Studio Basic or Studio Pro.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Link href="/billing" className="sl-studio-btn sl-studio-btn--primary no-underline">
              View Membership
            </Link>
            <StudioWorkspaceButton
              onClick={() => {
                patchWorkflow({
                  imageCount: 1,
                  customCampaign: false,
                  usedPoses: trimUsedPosesToShotCount(workflow.usedPoses, 1),
                });
                setShowProRequiredDialog(false);
              }}
            >
              Continue with Hero Shot
            </StudioWorkspaceButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DirectShootDialog
        open={directShootOpen}
        onOpenChange={setDirectShootOpen}
        shootImageCount={shootImageCount}
        onConfirm={handleDirectShootConfirm}
        onDismiss={handleDirectShootDismiss}
      />

      <StudioCustomCropDialog
        open={customCropDialogOpen}
        onOpenChange={setCustomCropDialogOpen}
        imageUrl={
          refinePanelSlot != null
            ? (masterOutputUrls[refinePanelSlot]
              ?? allOutputUrls[refinePanelSlot]
              ?? null)
            : null
        }
        initialRect={
          refinePanelSlot != null ? customCropRects[refinePanelSlot] : undefined
        }
        initialAspect={
          refinePanelSlot != null ? customCropAspects[refinePanelSlot] : undefined
        }
        onApply={(rect, aspect) => void handleCustomCropApply(rect, aspect)}
      />

      </AppShell>
  );
}
