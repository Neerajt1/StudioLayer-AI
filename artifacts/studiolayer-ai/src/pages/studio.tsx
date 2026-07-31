// ---------------------------------------------------------------------------
// StudioLayer AI — Studio Page (SL-020)
//
// 4-step workflow:
//   1. Upload Outfit       → garment photo + garment type
//   2. Choose Model        → visual gallery (Women / Men / Kids)
//   3. Complete the Look   → rule-based outfit completion (Optional)
//   4. Creative Brief      → natural-language description (Optional)
//   ↓  Image Count         → 1 / 2 / 4 output images
//   ↓  Create Photoshoot
//
// SL-020 additions:
//   - Image count selector (1 / 2 / 4) before the CTA button
//   - Multi-image polling: up to 4 render IDs tracked in state
//   - Multi-image output grid replacing the single-image canvas
//   - Each shot is an independently generated OpenRouter call (varied pose)
//   - All shots share the same model identity and garment inputs
// ---------------------------------------------------------------------------

import { useState } from 'react';
import JSZip from 'jszip';
import {
  useCreateRender,
  useGetRenderUsage,
  useGetRender,
  useCompleteOnboarding,
  useGetMe,
  useGetIdentities,
  getGetRenderUsageQueryKey,
  getGetMeQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient }    from '@tanstack/react-query';
import { Sidebar }           from '@/components/layout/sidebar';
import { Footer }            from '@/components/layout/footer';
import { FileUpload }        from '@/components/ui/file-upload';
import { Button }            from '@/components/ui/button';
import { Textarea }          from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Download, Camera, Sparkles } from 'lucide-react';
import { useToast }          from '@/hooks/use-toast';
import { OnboardingWizard }  from '@/components/ui/onboarding-wizard';
import { ModelGallery }      from '@/components/studio/model-gallery';
import { cn }                from '@/lib/utils';
import {
  COMPLETE_THE_LOOK_OPTIONS,
  computeOutfitSpec,
  formatOutfitSpec,
  buildOutfitPromptAddendum,
  getStyleLabel,
  type CompleteTheLookStyle,
} from '@/lib/outfit-completion-engine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  {
    q: 'Who legally owns the copyright of the final rendered fashion assets?',
    a: 'You do. Every single image generated inside your dashboard is 100% commercially owned by your brand, completely royalty-free.',
  },
  {
    q: 'What style of garment photography yields the best results?',
    a: 'Clear photos shot under bright, even lighting against a neutral background — flat-lay, hanger, or mannequin — allow our vision engine to isolate textures flawlessly.',
  },
  {
    q: 'Can I cancel or alter my subscription tier at any time?',
    a: 'Yes. You can upgrade, downgrade, or pause your studio access instantly inside your billing tab with zero exit contracts.',
  },
];

const GARMENT_TYPES = [
  { value: 'upper_body', label: 'Top',         sub: 'Shirts · Jackets · Knitwear'  },
  { value: 'lower_body', label: 'Bottom',      sub: 'Jeans · Trousers · Skirts'    },
  { value: 'full_body',  label: 'Full Outfit', sub: 'Dresses · Jumpsuits · Suits'  },
] as const;

const IMAGE_COUNT_OPTIONS: { value: 1 | 2 | 4; label: string }[] = [
  { value: 1, label: '1 Image'  },
  { value: 2, label: '2 Images' },
  { value: 4, label: '4 Images' },
];

// ---------------------------------------------------------------------------
// Creative brief → API field interpretation
// ---------------------------------------------------------------------------

function interpretCreativeBrief(brief: string): {
  locationEnvironment: string;
  modelPersona: string;
} {
  const t = brief.toLowerCase();

  let locationEnvironment = 'photo_studio';
  if (/hotel|lobby|interior|lounge|penthouse|apartment|mansion|boutique|gallery|museum|restaurant|bar|club|ballroom|corridor/.test(t)) {
    locationEnvironment = 'luxury_interior';
  } else if (/street|urban|city|downtown|sidewalk|alley|market|neighborhood|district|block/.test(t)) {
    locationEnvironment = 'urban_street';
  } else if (/nature|garden|park|forest|beach|mountain|field|coast|outdoor|countryside|meadow|cliffs|lake/.test(t)) {
    locationEnvironment = 'nature';
  }

  let modelPersona = 'confident_commercial';
  if (/editorial|high.?fashion|fierce|avant.?garde|runway|couture|vogue|serious|intense|powerful/.test(t)) {
    modelPersona = 'high_fashion_editorial';
  } else if (/natural|casual|friendly|approachable|relaxed|warm|soft|smile|cheerful|candid/.test(t)) {
    modelPersona = 'natural_smile';
  }

  return { locationEnvironment, modelPersona };
}

// ---------------------------------------------------------------------------
// Step label
// ---------------------------------------------------------------------------

function StepLabel({
  number, title, badge,
}: {
  number: number; title: string; badge?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-5 h-5 rounded-full bg-foreground text-background text-[11px] font-semibold flex items-center justify-center shrink-0">
        {number}
      </span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      {badge && (
        <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
          {badge}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refetch interval helper — stop polling once a render reaches terminal state
// ---------------------------------------------------------------------------

function makeRefetchInterval(enabled: boolean) {
  return (query: any) => {
    if (!enabled) return false;
    const render = query.state.data;
    if (render && (render.status === 'processing' || render.status === 'pending')) {
      return 2000;
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Single render output card
// ---------------------------------------------------------------------------

function RenderOutputCard({
  render,
  index,
  onDownload,
}: {
  render: any;
  index: number;
  onDownload: (url: string, index: number) => void;
}) {
  const outputUrl: string | null = (() => {
    if (!render) return null;
    const r = render as Record<string, unknown>;
    const candidates = [
      r['outputImageUrl'], r['outputUrl'], r['url'], r['image_url'],
      Array.isArray(r['images'])
        ? (r['images'] as Array<Record<string, unknown>>)[0]?.['url']
        : (r['images'] as Record<string, unknown> | undefined)?.['url'],
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.startsWith('http')) return c;
    }
    return null;
  })();

  const isProcessing = render?.status === 'processing' || render?.status === 'pending';
  const isCompleted  = render?.status === 'completed' && !!outputUrl;
  const isFailed     = render?.status === 'failed';

  return (
    <div
      className="relative w-full rounded border border-border bg-card overflow-hidden flex items-center justify-center"
      style={{ aspectRatio: '4 / 5' }}
    >
      {isProcessing && (
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 border-2 border-border rounded-full" />
            <div className="absolute inset-0 border-2 border-t-foreground border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
            <Sparkles className="absolute inset-0 m-auto w-4 h-4 text-muted-foreground animate-pulse-shimmer" />
          </div>
          <p className="text-xs text-muted-foreground font-mono">Rendering…</p>
        </div>
      )}

      {isCompleted && (
        <>
          <img
            src={outputUrl!}
            alt={`Photoshoot output ${index + 1}`}
            className="w-full h-full object-cover animate-in fade-in duration-500"
            data-testid={`img-render-output-${index}`}
          />
          <button
            onClick={() => onDownload(outputUrl!, index)}
            className="absolute bottom-2 right-2 bg-background/80 hover:bg-background text-foreground border border-border rounded p-1.5 transition-all opacity-0 group-hover:opacity-100 hover:opacity-100"
            title={`Download image ${index + 1}`}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {isFailed && (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <p className="text-xs text-destructive font-mono">Generation failed</p>
        </div>
      )}

      {!render && (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <div className="w-8 h-8 rounded-full border border-dashed border-border flex items-center justify-center">
            <Camera className="w-4 h-4 text-muted-foreground/50" />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Studio Page
// ---------------------------------------------------------------------------

export default function StudioPage() {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [sourceImages,       setSourceImages]       = useState<string[]>([]);
  const [garmentPlacement,   setGarmentPlacement]   = useState('');
  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [completeTheLook,    setCompleteTheLook]    = useState<CompleteTheLookStyle>('ai_recommended');
  const [creativeBrief,      setCreativeBrief]      = useState('');
  const [imageCount,         setImageCount]         = useState<1 | 2 | 4>(1);
  const [activeRenderIds,    setActiveRenderIds]    = useState<number[]>([]);
  const [showValidation,     setShowValidation]     = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // resetKey forces FileUpload to re-mount on New Photoshoot, clearing
  // its internal preview/filename state that parent state changes cannot reach.
  const [resetKey, setResetKey] = useState(0);

  // ── API hooks ──────────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const { data: user }                            = useGetMe();
  const { data: usage, isLoading: usageLoading }  = useGetRenderUsage();
  const { data: identities = [] }                 = useGetIdentities();
  const createRender                              = useCreateRender();

  // ── Multi-render polling (max 4 slots, hooks called unconditionally) ───────
  // Each hook is enabled only when its slot has an ID assigned.
  const id0 = activeRenderIds[0] ?? 0;
  const id1 = activeRenderIds[1] ?? 0;
  const id2 = activeRenderIds[2] ?? 0;
  const id3 = activeRenderIds[3] ?? 0;

  const { data: render0 } = useGetRender(id0, { query: { enabled: !!activeRenderIds[0], refetchInterval: makeRefetchInterval(!!activeRenderIds[0]) } } as any);
  const { data: render1 } = useGetRender(id1, { query: { enabled: !!activeRenderIds[1], refetchInterval: makeRefetchInterval(!!activeRenderIds[1]) } } as any);
  const { data: render2 } = useGetRender(id2, { query: { enabled: !!activeRenderIds[2], refetchInterval: makeRefetchInterval(!!activeRenderIds[2]) } } as any);
  const { data: render3 } = useGetRender(id3, { query: { enabled: !!activeRenderIds[3], refetchInterval: makeRefetchInterval(!!activeRenderIds[3]) } } as any);

  const allRenderData = [render0, render1, render2, render3].slice(0, activeRenderIds.length);

  // ── Onboarding ─────────────────────────────────────────────────────────────
  const showOnboarding =
    !onboardingDismissed &&
    user !== undefined &&
    user.hasCompletedOnboarding === false;

  const handleCompleteOnboarding = () => {
    setOnboardingDismissed(true);
    completeOnboarding.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    });
  };

  const completeOnboarding = useCompleteOnboarding();

  // ── Derived state ──────────────────────────────────────────────────────────
  const isProcessing = allRenderData.some(
    (r) => r?.status === 'processing' || r?.status === 'pending',
  );

  // resolvedOutputUrl — first completed image URL (for the before/after strip)
  const resolvedOutputUrl: string | null = (() => {
    for (const render of allRenderData) {
      if (!render) continue;
      const r = render as unknown as Record<string, unknown>;
      const candidates = [
        r['outputImageUrl'], r['outputUrl'], r['url'], r['image_url'],
        Array.isArray(r['images'])
          ? (r['images'] as Array<Record<string, unknown>>)[0]?.['url']
          : (r['images'] as Record<string, unknown> | undefined)?.['url'],
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && c.startsWith('http')) return c;
      }
    }
    return null;
  })();

  const hasOutput    = allRenderData.some((r) => r?.status === 'completed') && !!resolvedOutputUrl;
  const hasImage     = sourceImages.length > 0 && !!sourceImages[0];
  const limitBlocked = usage !== undefined && !usage.canRender;
  const canRender    = hasImage && !!garmentPlacement && !!selectedIdentityId
    && !createRender.isPending && !isProcessing && !limitBlocked;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFileSelect = (url: string) => {
    if (!url) { setSourceImages([]); return; }
    setSourceImages([url]);
    setShowValidation(false);
  };

  const handleRender = () => {
    const primary = sourceImages[0];

    if (!primary || !garmentPlacement || !selectedIdentityId) {
      setShowValidation(true);
      const msg = !primary
        ? 'Upload a garment photo to get started.'
        : !selectedIdentityId
          ? 'Choose a model from the gallery.'
          : 'Select what type of garment this is.';
      toast({ title: 'Almost there', description: msg, variant: 'destructive' });
      return;
    }

    if (usage && !usage.canRender) {
      toast({
        title: 'Render limit reached',
        description: 'Upgrade your plan to create more photoshoots.',
        variant: 'destructive',
      });
      return;
    }

    // ── Derive identity metadata ───────────────────────────────────────────
    const selectedIdentity = (identities as any[]).find((i) => i.id === selectedIdentityId);
    const modelGender   = selectedIdentity?.gender   as string | undefined;
    const modelAgeRange = selectedIdentity?.ageGroup as string | undefined;

    // ── Outfit Completion Engine ───────────────────────────────────────────
    // Deterministic rule lookup: (placement, gender, style) → OutfitSpec
    const outfitSpec = computeOutfitSpec(
      garmentPlacement,
      modelGender ?? 'womens',
      completeTheLook,
    );
    const outfitSpecFormatted = outfitSpec ? formatOutfitSpec(outfitSpec) : 'None (server-side determination)';
    const outfitPromptAddendum = outfitSpec ? buildOutfitPromptAddendum(outfitSpec) : '';

    // ── Creative brief interpretation ──────────────────────────────────────
    const { locationEnvironment, modelPersona } = creativeBrief.trim()
      ? interpretCreativeBrief(creativeBrief)
      : { locationEnvironment: 'photo_studio', modelPersona: 'confident_commercial' };

    // ── Build final rendering request ─────────────────────────────────────
    const renderingRequest = {
      sourceImageUrl:      primary,
      modelPersona:        modelPersona        as any,
      locationEnvironment: locationEnvironment as any,
      garmentPlacement:    garmentPlacement    as any,
      modelIdentityId:     selectedIdentityId  || undefined,
      modelGender:         modelGender         as any,
      modelAgeRange:       modelAgeRange       as any,
      smartLighting:       true,
      imageDimensions:     'portrait_45'       as any,
      outfitStyle:         completeTheLook,
      imageCount,
    };

    // ── Submit ─────────────────────────────────────────────────────────────
    createRender.mutate(
      { data: renderingRequest },
      {
        onSuccess: (renders) => {
          // POST /renders now returns Render[] — collect all IDs.
          const ids = (renders as unknown as any[]).map((r: any) => r.id as number);
          setActiveRenderIds(ids);
          queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
          const desc = ids.length === 1
            ? 'Your render is processing…'
            : `${ids.length} images are processing…`;
          toast({ title: 'Photoshoot started', description: desc });
        },
        onError: (error: any) => {
          toast({
            title: 'Could not start photoshoot',
            description: error?.error || 'Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  // ── Workspace Reset ────────────────────────────────────────────────────────
  const handleNewPhotoshoot = () => {
    setSourceImages([]);
    setGarmentPlacement('');
    setSelectedIdentityId('');
    setCompleteTheLook('ai_recommended');
    setCreativeBrief('');
    setImageCount(1);
    setActiveRenderIds([]);
    setShowValidation(false);
    setResetKey((k) => k + 1);
    createRender.reset();
  };

  const handleDownloadSingle = async (url: string, index: number) => {
    const brandSlug = (user?.name ?? 'studio')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const suffix    = activeRenderIds.length > 1 ? `_${index + 1}` : '';
    const filename  = `${brandSlug}_photoshoot${suffix}.jpg`;
    try {
      const response  = await fetch(url);
      const blob      = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link      = document.createElement('a');
      link.href = objectUrl; link.download = filename;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
  };

  const handleDownloadAll = async () => {
    const zip = new JSZip();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const zipName = `StudioLayerAI_Photoshoot_${ts}.zip`;

    await Promise.all(
      allRenderData.map(async (render, i) => {
        if (!render || render.status !== 'completed') return;
        const r = render as unknown as Record<string, unknown>;
        const url = r['outputImageUrl'] as string | null;
        if (!url?.startsWith('http')) return;
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          zip.file(`image_${i + 1}.png`, blob);
        } catch {
          // skip individual fetch failures — other images still zip
        }
      }),
    );

    const content = await zip.generateAsync({ type: 'blob' });
    const objUrl = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = objUrl;
    link.download = zipName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-background">
      {showOnboarding && (
        <OnboardingWizard
          onComplete={handleCompleteOnboarding}
          onSkip={() => setOnboardingDismissed(true)}
        />
      )}

      <Sidebar />

      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex-1 p-6 lg:p-8">

          {/* ── Page header ── */}
          <div className="mb-8">
            <h2
              className="text-foreground mb-1 text-xl font-semibold tracking-tight"
            >
              Create Photoshoot
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              Professional fashion photography in minutes
            </p>
          </div>

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 mb-10">

            {/* ═══════════════════════════════════════════════════════════════
                LEFT PANEL — Steps
            ═══════════════════════════════════════════════════════════════ */}
            <div className="space-y-8">

              {/* ── STEP 1: Upload Outfit ── */}
              <section className="space-y-3">
                <StepLabel number={1} title="Upload Outfit" />

                <div className={cn(
                  showValidation && !hasImage && 'rounded ring-2 ring-destructive ring-offset-1',
                )}>
                  <FileUpload
                    key={resetKey}
                    onFileSelect={handleFileSelect}
                    disabled={createRender.isPending || isProcessing}
                  />
                </div>
                {showValidation && !hasImage && (
                  <p className="text-xs text-destructive font-mono">
                    Please upload a garment photo.
                  </p>
                )}

                {/* Garment type toggle */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    What type of garment is this?
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {GARMENT_TYPES.map((g) => {
                      const isSelected = garmentPlacement === g.value;
                      return (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => { setGarmentPlacement(g.value); setShowValidation(false); }}
                          disabled={createRender.isPending || isProcessing}
                          className={cn(
                            'rounded border px-2 py-2.5 text-center transition-all duration-150 select-none',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isSelected
                              ? 'border-foreground bg-foreground text-background'
                              : 'border-border bg-card text-foreground hover:border-foreground/40',
                            (createRender.isPending || isProcessing) && 'opacity-50 pointer-events-none',
                          )}
                        >
                          <p className="text-xs font-semibold">{g.label}</p>
                          <p className={cn(
                            'text-[10px] font-mono mt-0.5 leading-tight',
                            isSelected ? 'text-background/70' : 'text-muted-foreground',
                          )}>
                            {g.sub}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {showValidation && !garmentPlacement && (
                    <p className="text-xs text-destructive font-mono">
                      Please select a garment type.
                    </p>
                  )}
                </div>
              </section>

              {/* ── STEP 2: Choose Model ── */}
              <section className="space-y-3">
                <StepLabel number={2} title="Choose Model" />

                {showValidation && !selectedIdentityId && (
                  <p className="text-xs text-destructive font-mono -mt-1">
                    Please choose a model.
                  </p>
                )}

                <div className={cn(
                  showValidation && !selectedIdentityId
                    && 'rounded ring-2 ring-destructive ring-offset-1 p-2',
                )}>
                  <ModelGallery
                    identities={identities as any}
                    selectedId={selectedIdentityId}
                    onSelect={(id) => { setSelectedIdentityId(id); setShowValidation(false); }}
                    disabled={createRender.isPending || isProcessing}
                  />
                </div>
              </section>

              {/* ── STEP 3: Complete the Look ── */}
              <section className="space-y-3">
                <StepLabel number={3} title="Complete the Look" badge="Optional" />

                <p className="text-xs text-muted-foreground font-mono">
                  Choose how to complete the outfit around your uploaded garment.
                </p>

                {/* Pill selector — horizontal scroll on narrow screens */}
                <div className="flex flex-wrap gap-2">
                  {COMPLETE_THE_LOOK_OPTIONS.map((option) => {
                    const isSelected = completeTheLook === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (!createRender.isPending && !isProcessing)
                            setCompleteTheLook(option.value);
                        }}
                        disabled={createRender.isPending || isProcessing}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium',
                          'transition-all duration-150 select-none whitespace-nowrap',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-card text-foreground border-border hover:border-foreground/40',
                          (createRender.isPending || isProcessing) && 'opacity-50 pointer-events-none',
                        )}
                      >
                        <span aria-hidden>{option.emoji}</span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {/* Live outfit preview — shows the computed spec inline */}
                {completeTheLook !== 'none' && garmentPlacement && selectedIdentityId && (() => {
                  const selectedIdentity = (identities as any[]).find((i) => i.id === selectedIdentityId);
                  const gender = selectedIdentity?.gender ?? 'womens';
                  const spec = computeOutfitSpec(garmentPlacement, gender, completeTheLook);
                  if (!spec) return null;
                  const specText = formatOutfitSpec(spec);
                  return (
                    <div className="rounded border border-border bg-muted/40 px-3 py-2.5">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                        Outfit Completion Preview
                      </p>
                      <p className="text-xs text-foreground font-medium leading-relaxed">
                        {specText}
                      </p>
                    </div>
                  );
                })()}

                {/* Preview when garment/model not yet selected */}
                {completeTheLook !== 'none' && (!garmentPlacement || !selectedIdentityId) && (
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Select a garment type and model above to preview the outfit completion.
                  </p>
                )}
              </section>

              {/* ── STEP 4: Creative Brief ── */}
              <section className="space-y-3">
                <StepLabel number={4} title="Creative Brief" badge="Optional" />

                <Textarea
                  value={creativeBrief}
                  onChange={(e) => setCreativeBrief(e.target.value)}
                  placeholder="Describe the photoshoot you imagine…"
                  rows={3}
                  disabled={createRender.isPending || isProcessing}
                  className="resize-none text-sm font-mono placeholder:text-muted-foreground/60"
                />
                <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
                  <span className="font-semibold">Example:</span>{' '}
                  Luxury hotel lobby during the evening with warm lighting and a confident executive look.
                </p>
              </section>

              {/* ── Image Count selector ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-foreground">Number of Images</p>
                </div>
                <div className="flex gap-2">
                  {IMAGE_COUNT_OPTIONS.map((opt) => {
                    const isSelected = imageCount === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          if (!createRender.isPending && !isProcessing)
                            setImageCount(opt.value);
                        }}
                        disabled={createRender.isPending || isProcessing}
                        className={cn(
                          'flex-1 rounded border px-3 py-2 text-xs font-semibold text-center',
                          'transition-all duration-150 select-none',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-card text-foreground hover:border-foreground/40',
                          (createRender.isPending || isProcessing) && 'opacity-50 pointer-events-none',
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Each image is a distinct pose using the same model and garment.
                </p>
              </section>

              {/* ── Create Photoshoot CTA ── */}
              <div className="space-y-3 pt-1">
                <Button
                  onClick={handleRender}
                  disabled={!canRender}
                  className="w-full h-12 text-sm font-semibold gap-2"
                  data-testid="button-render"
                >
                  {createRender.isPending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      Starting…
                    </>
                  ) : isProcessing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      Rendering…
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      Create Photoshoot
                    </>
                  )}
                </Button>

                {/* Trial notice */}
                {!usageLoading && usage?.tier === 'free' && (
                  <p className="text-center text-xs text-muted-foreground font-mono">
                    Free trial — {usage.used} of {usage.limit} renders used
                  </p>
                )}

                {/* Limit warning */}
                {limitBlocked && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <p className="text-xs text-destructive font-mono text-center">
                      Render limit reached — upgrade your plan to continue.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                RIGHT PANEL — Output
            ═══════════════════════════════════════════════════════════════ */}
            <div className="space-y-4">

              {/* Output area — single image or grid */}
              {activeRenderIds.length <= 1 ? (
                /* ── Single image canvas (original layout) ── */
                <div
                  className="relative w-full rounded border border-border bg-card overflow-hidden flex items-center justify-center group"
                  style={{ aspectRatio: '4 / 5' }}
                >
                  {isProcessing && (
                    <div className="flex flex-col items-center gap-4 p-8 text-center">
                      <div className="relative w-14 h-14">
                        <div className="absolute inset-0 border-2 border-border rounded-full" />
                        <div className="absolute inset-0 border-2 border-t-foreground border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
                        <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-muted-foreground animate-pulse-shimmer" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Creating your photoshoot…
                        </p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          This usually takes 20–40 seconds
                        </p>
                      </div>
                    </div>
                  )}

                  {hasOutput && (
                    <img
                      src={resolvedOutputUrl!}
                      alt="Photoshoot output"
                      className="w-full h-full object-cover animate-in fade-in duration-500"
                      data-testid="img-render-output"
                    />
                  )}

                  {!isProcessing && !hasOutput && (
                    <div className="flex flex-col items-center gap-3 p-8 text-center">
                      <div className="w-12 h-12 rounded-full border border-dashed border-border flex items-center justify-center">
                        <Camera className="w-5 h-5 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Your photoshoot will appear here
                        </p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          Complete the steps on the left to get started
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Multi-image grid ── */
                <div className={cn(
                  'grid gap-3',
                  activeRenderIds.length === 2 ? 'grid-cols-2' : 'grid-cols-2',
                )}>
                  {activeRenderIds.map((_, i) => (
                    <div key={i} className="group">
                      <RenderOutputCard
                        render={allRenderData[i]}
                        index={i}
                        onDownload={handleDownloadSingle}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Download + New Photoshoot */}
              {hasOutput && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => activeRenderIds.length > 1 ? handleDownloadAll() : handleDownloadSingle(resolvedOutputUrl!, 0)}
                    className="flex-1 gap-2"
                    data-testid="button-download"
                  >
                    <Download className="w-4 h-4" />
                    {activeRenderIds.length > 1 ? 'Download All' : 'Download'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleNewPhotoshoot}
                    className="flex-1"
                    data-testid="button-new-photoshoot"
                  >
                    New Photoshoot
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ── Source / output comparison strip ── */}
          {(hasImage || hasOutput) && (
            <div className="border-t border-border pt-6 mb-8">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
                Before &amp; After
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Garment Photo</p>
                  <div className="aspect-video border border-border rounded bg-card overflow-hidden flex items-center justify-center">
                    {sourceImages[0] ? (
                      <img
                        src={sourceImages[0]}
                        alt="Source garment"
                        className="w-full h-full object-contain"
                        data-testid="img-source"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground font-mono">No image uploaded</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Photoshoot Output</p>
                  <div className="aspect-video border border-border rounded bg-card overflow-hidden flex items-center justify-center">
                    {hasOutput ? (
                      <img
                        src={resolvedOutputUrl!}
                        alt="Photoshoot output"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground font-mono">
                        {isProcessing ? 'Rendering…' : 'Not yet created'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── FAQ ── */}
          <div className="border-t border-border pt-6">
            <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
              Frequently Asked Questions
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
                  <AccordionContent className="text-sm text-muted-foreground pb-4 font-mono text-xs leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

        </div>

        <Footer />
      </main>
    </div>
  );
}
