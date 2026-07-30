// ---------------------------------------------------------------------------
// StudioLayer AI — Studio Page (SL-018 MVP)
//
// Simplified 3-step workflow:
//   1. Upload Outfit  → garment photo + garment type
//   2. Choose Model   → visual gallery (Women / Men / Kids)
//   3. Creative Brief → optional natural-language description
//   ↓  Create Photoshoot
//
// All AI parameters (pose, framing, lighting, scene, persona, dimensions)
// are determined automatically. Users only provide creative intent.
//
// API contract is unchanged — creative brief is interpreted into existing
// locationEnvironment + modelPersona enum values by interpretCreativeBrief().
// ---------------------------------------------------------------------------

import { useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar }        from '@/components/layout/sidebar';
import { Footer }         from '@/components/layout/footer';
import { FileUpload }     from '@/components/ui/file-upload';
import { Button }         from '@/components/ui/button';
import { Textarea }       from '@/components/ui/textarea';
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
  {
    value: 'upper_body',
    label: 'Top',
    sub: 'Shirts · Jackets · Knitwear',
  },
  {
    value: 'lower_body',
    label: 'Bottom',
    sub: 'Jeans · Trousers · Skirts',
  },
  {
    value: 'full_body',
    label: 'Full Outfit',
    sub: 'Dresses · Jumpsuits · Suits',
  },
] as const;

// ---------------------------------------------------------------------------
// Creative brief interpretation
//
// Maps free-text user intent to the existing locationEnvironment and
// modelPersona enum values without changing the API contract.
// ---------------------------------------------------------------------------

function interpretCreativeBrief(brief: string): {
  locationEnvironment: string;
  modelPersona: string;
} {
  const t = brief.toLowerCase();

  let locationEnvironment = 'photo_studio';
  if (
    /hotel|lobby|interior|lounge|penthouse|apartment|mansion|boutique|gallery|museum|restaurant|bar|club|ballroom|corridor/.test(t)
  ) {
    locationEnvironment = 'luxury_interior';
  } else if (
    /street|urban|city|downtown|sidewalk|alley|market|neighborhood|district|block/.test(t)
  ) {
    locationEnvironment = 'urban_street';
  } else if (
    /nature|garden|park|forest|beach|mountain|field|coast|outdoor|countryside|meadow|cliffs|lake/.test(t)
  ) {
    locationEnvironment = 'nature';
  }

  let modelPersona = 'confident_commercial';
  if (
    /editorial|high.?fashion|fierce|avant.?garde|runway|couture|vogue|serious|intense|powerful/.test(t)
  ) {
    modelPersona = 'high_fashion_editorial';
  } else if (
    /natural|casual|friendly|approachable|relaxed|warm|soft|smile|cheerful|candid/.test(t)
  ) {
    modelPersona = 'natural_smile';
  }

  return { locationEnvironment, modelPersona };
}

// ---------------------------------------------------------------------------
// Step label
// ---------------------------------------------------------------------------

function StepLabel({ number, title, badge }: { number: number; title: string; badge?: string }) {
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
// Studio Page
// ---------------------------------------------------------------------------

export default function StudioPage() {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [sourceImages,      setSourceImages]      = useState<string[]>([]);
  const [garmentPlacement,  setGarmentPlacement]  = useState('');
  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [creativeBrief,     setCreativeBrief]     = useState('');
  const [activeRenderId,    setActiveRenderId]     = useState<number | null>(null);
  const [showValidation,    setShowValidation]     = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // ── API hooks ──────────────────────────────────────────────────────────────
  const queryClient  = useQueryClient();
  const { toast }    = useToast();

  const { data: user }                  = useGetMe();
  const { data: usage, isLoading: usageLoading } = useGetRenderUsage();
  const { data: identities = [] }       = useGetIdentities();
  const createRender                    = useCreateRender();
  const completeOnboarding              = useCompleteOnboarding();

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

  // ── Active render polling ──────────────────────────────────────────────────
  const { data: activeRender } = useGetRender(activeRenderId || 0, {
    query: {
      enabled: !!activeRenderId,
      refetchInterval: (query: any) => {
        const render = query.state.data;
        if (render && (render.status === 'processing' || render.status === 'pending')) {
          return 2000;
        }
        return false;
      },
    } as any,
  });

  // ── Derived state ──────────────────────────────────────────────────────────
  const isProcessing =
    activeRender?.status === 'processing' || activeRender?.status === 'pending';

  const resolvedOutputUrl: string | null = (() => {
    if (!activeRender) return null;
    const r = activeRender as unknown as Record<string, unknown>;
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

  const hasOutput    = activeRender?.status === 'completed' && !!resolvedOutputUrl;
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

    // Interpret creative brief (or use smart defaults)
    const { locationEnvironment, modelPersona } = creativeBrief.trim()
      ? interpretCreativeBrief(creativeBrief)
      : { locationEnvironment: 'photo_studio', modelPersona: 'confident_commercial' };

    // Derive gender + age from the selected identity
    const selectedIdentity = (identities as any[]).find((i) => i.id === selectedIdentityId);
    const modelGender    = selectedIdentity?.gender    as string | undefined;
    const modelAgeRange  = selectedIdentity?.ageGroup  as string | undefined;

    createRender.mutate(
      {
        data: {
          sourceImageUrl:      primary,
          modelPersona:        modelPersona    as any,
          locationEnvironment: locationEnvironment as any,
          garmentPlacement:    garmentPlacement as any,
          modelIdentityId:     selectedIdentityId || undefined,
          modelGender:         modelGender      as any,
          modelAgeRange:       modelAgeRange    as any,
          smartLighting:       true,
          imageDimensions:     'portrait_45'   as any,
        },
      },
      {
        onSuccess: (render) => {
          setActiveRenderId(render.id);
          queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
          toast({ title: 'Photoshoot started', description: 'Your render is processing…' });
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

  const handleDownload = async () => {
    if (!resolvedOutputUrl) return;
    const brandSlug = (user?.name ?? 'studio')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const filename = `${brandSlug}_photoshoot.jpg`;
    try {
      const response  = await fetch(resolvedOutputUrl);
      const blob      = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl; link.download = filename;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      const link = document.createElement('a');
      link.href = resolvedOutputUrl; link.download = filename;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
  };

  const handleNewPhotoshoot = () => {
    setSourceImages([]);
    setGarmentPlacement('');
    setSelectedIdentityId('');
    setCreativeBrief('');
    setActiveRenderId(null);
    setShowValidation(false);
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
              className="text-foreground mb-1"
              style={{
                fontFamily:    "'EB Garamond', Georgia, serif",
                fontSize:      '28px',
                fontWeight:    600,
                letterSpacing: '0.01em',
                lineHeight:    1.2,
              }}
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

                <div className={cn(showValidation && !hasImage && 'rounded ring-2 ring-destructive ring-offset-1')}>
                  <FileUpload
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

                <div className={cn(showValidation && !selectedIdentityId && 'rounded ring-2 ring-destructive ring-offset-1 p-2')}>
                  <ModelGallery
                    identities={identities as any}
                    selectedId={selectedIdentityId}
                    onSelect={(id) => { setSelectedIdentityId(id); setShowValidation(false); }}
                    disabled={createRender.isPending || isProcessing}
                  />
                </div>
              </section>

              {/* ── STEP 3: Creative Brief ── */}
              <section className="space-y-3">
                <StepLabel number={3} title="Creative Brief" badge="Optional" />

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
                {!usageLoading && limitBlocked && (
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
              {/* Output canvas */}
              <div
                className="relative w-full rounded border border-border bg-card overflow-hidden flex items-center justify-center"
                style={{ aspectRatio: '4 / 5' }}
              >
                {/* ── Processing state ── */}
                {isProcessing && (
                  <div className="flex flex-col items-center gap-4 p-8 text-center">
                    <div className="relative w-14 h-14">
                      <div className="absolute inset-0 border-2 border-border rounded-full" />
                      <div className="absolute inset-0 border-2 border-t-foreground border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
                      <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-muted-foreground animate-pulse-shimmer" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Creating your photoshoot…</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        This usually takes 20–40 seconds
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Output image ── */}
                {hasOutput && (
                  <img
                    src={resolvedOutputUrl!}
                    alt="Photoshoot output"
                    className="w-full h-full object-cover animate-in fade-in duration-500"
                    data-testid="img-render-output"
                  />
                )}

                {/* ── Empty state ── */}
                {!isProcessing && !hasOutput && (
                  <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <div className="w-12 h-12 rounded-full border border-dashed border-border flex items-center justify-center">
                      <Camera className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Your photoshoot will appear here</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        Complete the steps on the left to get started
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Download + New photoshoot */}
              {hasOutput && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleDownload}
                    className="flex-1 gap-2"
                    data-testid="button-download"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleNewPhotoshoot}
                    className="flex-1"
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
