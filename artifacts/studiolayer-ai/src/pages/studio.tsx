// ---------------------------------------------------------------------------
// StudioLayer AI — Studio Page
//
// Simplified AI-first workflow:
//   1. Upload garment photo
//   2. Choose model
//   → Create
//
// After generation, a "Refine Image" panel lets users request targeted
// changes via free-text + suggestion chips. Each refinement creates a new
// render row linked to the original via parentRenderId (version history).
//
// Preset / outfitStyle / completeTheLook / imageCount code is preserved in
// the codebase but disconnected from this UI — available for enterprise.
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
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/sidebar';
import { Footer } from '@/components/layout/footer';
import { FileUpload } from '@/components/ui/file-upload';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Camera, Download, Sparkles, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { OnboardingWizard } from '@/components/ui/onboarding-wizard';
import { ModelGallery } from '@/components/studio/model-gallery';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GARMENT_TYPES = [
  { value: 'upper_body', label: 'Top',         sub: 'Shirts · Jackets · Knitwear' },
  { value: 'lower_body', label: 'Bottom',       sub: 'Jeans · Trousers · Skirts' },
  { value: 'full_body',  label: 'Full Outfit',  sub: 'Dresses · Jumpsuits · Suits' },
] as const;

const REFINEMENT_CHIPS = [
  'Change Background',
  'Replace Shirt',
  'Replace Trousers',
  'Replace Shoes',
  'Change Pose',
  'Change Lighting',
  'Change Camera Angle',
  'Add Accessories',
];

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

// ---------------------------------------------------------------------------
// StudioPage
// ---------------------------------------------------------------------------

export default function StudioPage() {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [sourceImages, setSourceImages]         = useState<string[]>([]);
  const [garmentPlacement, setGarmentPlacement] = useState('');
  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [activeRenderIds, setActiveRenderIds]   = useState<number[]>([]);
  const [showValidation, setShowValidation]     = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [resetKey, setResetKey]                 = useState(0);

  // ── Refinement state ───────────────────────────────────────────────────────
  const [refinementText, setRefinementText] = useState('');
  const [isRefining, setIsRefining]         = useState(false);

  // ── API hooks ──────────────────────────────────────────────────────────────
  const queryClient  = useQueryClient();
  const { toast }    = useToast();
  const { data: user }                            = useGetMe();
  const { data: usage, isLoading: usageLoading }  = useGetRenderUsage();
  const { data: identities = [] }                 = useGetIdentities();
  const createRender = useCreateRender();

  // ── Onboarding ─────────────────────────────────────────────────────────────
  const completeOnboarding = useCompleteOnboarding();
  const showOnboarding     = !onboardingDismissed && user !== undefined && user.hasCompletedOnboarding === false;

  const handleCompleteOnboarding = () => {
    setOnboardingDismissed(true);
    completeOnboarding.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    });
  };

  // ── Multi-render polling — 4 unconditional hooks (Rule of Hooks) ───────────
  const id0 = activeRenderIds[0] ?? 0;
  const id1 = activeRenderIds[1] ?? 0;
  const id2 = activeRenderIds[2] ?? 0;
  const id3 = activeRenderIds[3] ?? 0;

  const { data: render0 } = useGetRender(id0, { query: { enabled: !!activeRenderIds[0], refetchInterval: makeRefetchInterval(!!activeRenderIds[0]) } } as never);
  const { data: render1 } = useGetRender(id1, { query: { enabled: !!activeRenderIds[1], refetchInterval: makeRefetchInterval(!!activeRenderIds[1]) } } as never);
  const { data: render2 } = useGetRender(id2, { query: { enabled: !!activeRenderIds[2], refetchInterval: makeRefetchInterval(!!activeRenderIds[2]) } } as never);
  const { data: render3 } = useGetRender(id3, { query: { enabled: !!activeRenderIds[3], refetchInterval: makeRefetchInterval(!!activeRenderIds[3]) } } as never);

  const allRenderData = [render0, render1, render2, render3].slice(0, Math.max(activeRenderIds.length, 1));

  // ── Derived state ──────────────────────────────────────────────────────────
  const isProcessing = allRenderData.some(
    (r) => r?.status === 'processing' || r?.status === 'pending',
  );

  const resolvedOutputUrl: string | null = (() => {
    for (const render of allRenderData) {
      if (!render) continue;
      const r = render as unknown as Record<string, unknown>;
      for (const key of ['outputImageUrl', 'outputUrl', 'url', 'image_url']) {
        const v = r[key];
        if (typeof v === 'string' && v.startsWith('http')) return v;
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
      toast({ title: 'Render limit reached', description: 'Upgrade your plan to create more images.', variant: 'destructive' });
      return;
    }

    const selectedIdentity = (identities as { id: string; gender?: string; ageGroup?: string }[])
      .find((i) => i.id === selectedIdentityId);

    const renderingRequest = {
      sourceImageUrl:      primary,
      modelPersona:        'confident_commercial' as never,
      locationEnvironment: 'photo_studio'          as never,
      garmentPlacement:    garmentPlacement         as never,
      modelIdentityId:     selectedIdentityId       || undefined,
      modelGender:         selectedIdentity?.gender as never,
      modelAgeRange:       selectedIdentity?.ageGroup as never,
      smartLighting:       true,
      imageDimensions:     'portrait_45'            as never,
    };

    createRender.mutate(
      { data: renderingRequest },
      {
        onSuccess: (renders) => {
          const ids = (renders as unknown as { id: number }[]).map((r) => r.id);
          setActiveRenderIds(ids);
          setRefinementText('');
          setIsRefining(false);
          queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
          toast({ title: 'Creating your image…', description: 'The AI is styling your garment.' });
        },
        onError: (error: unknown) => {
          const msg = (error as { error?: string })?.error ?? 'Please try again.';
          toast({ title: 'Could not create image', description: msg, variant: 'destructive' });
        },
      },
    );
  };

  const handleRefine = () => {
    const primary         = sourceImages[0];
    const currentRenderId = activeRenderIds[0];
    if (!refinementText.trim() || !currentRenderId || !primary) return;
    if (isRefining || isProcessing) return;

    const selectedIdentity = (identities as { id: string; gender?: string; ageGroup?: string }[])
      .find((i) => i.id === selectedIdentityId);

    const refineRequest = {
      sourceImageUrl:      primary,
      modelPersona:        'confident_commercial' as never,
      locationEnvironment: 'photo_studio'          as never,
      garmentPlacement:    garmentPlacement         as never,
      modelIdentityId:     selectedIdentityId       || undefined,
      modelGender:         selectedIdentity?.gender as never,
      modelAgeRange:       selectedIdentity?.ageGroup as never,
      smartLighting:       true,
      imageDimensions:     'portrait_45'            as never,
      parentRenderId:      currentRenderId,
      refinementPrompt:    refinementText.trim(),
    };

    setIsRefining(true);
    createRender.mutate(
      { data: refineRequest },
      {
        onSuccess: (renders) => {
          const ids = (renders as unknown as { id: number }[]).map((r) => r.id);
          setActiveRenderIds(ids);
          setRefinementText('');
          setIsRefining(false);
          queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
          toast({ title: 'Refining…', description: 'Applying your changes.' });
        },
        onError: (error: unknown) => {
          setIsRefining(false);
          const msg = (error as { error?: string })?.error ?? 'Please try again.';
          toast({ title: 'Refinement failed', description: msg, variant: 'destructive' });
        },
      },
    );
  };

  const handleNewPhotoshoot = () => {
    setSourceImages([]);
    setGarmentPlacement('');
    setSelectedIdentityId('');
    setActiveRenderIds([]);
    setShowValidation(false);
    setRefinementText('');
    setIsRefining(false);
    setResetKey((k) => k + 1);
    createRender.reset();
  };

  const handleDownloadSingle = async (url: string, index: number) => {
    const brandSlug = (user?.name ?? 'studio')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const suffix   = activeRenderIds.length > 1 ? `_${index + 1}` : '';
    const filename = `${brandSlug}_photoshoot${suffix}.jpg`;
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const obj  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: obj, download: filename });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(obj), 10_000);
    } catch {
      const a = Object.assign(document.createElement('a'), { href: url, download: filename, target: '_blank', rel: 'noopener noreferrer' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  };

  const handleDownloadAll = async () => {
    const zip = new JSZip();
    const now  = new Date();
    const pad  = (n: number) => String(n).padStart(2, '0');
    const ts   = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    await Promise.all(
      allRenderData.map(async (render, i) => {
        if (!render || render.status !== 'completed') return;
        const url = (render as unknown as Record<string, unknown>)['outputImageUrl'] as string | undefined;
        if (!url?.startsWith('http')) return;
        try {
          const blob = await (await fetch(url)).blob();
          zip.file(`image_${i + 1}.png`, blob);
        } catch { /* skip failed images */ }
      }),
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    const obj  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: obj, download: `StudioLayerAI_Photoshoot_${ts}.zip` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(obj), 10_000);
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

          {/* Page header */}
          <div className="mb-8">
            <h2 className="text-foreground mb-1 text-xl font-semibold tracking-tight">
              Create
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              Professional fashion photography in minutes
            </p>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 mb-10">

            {/* ── LEFT PANEL ─────────────────────────────────────────── */}
            <div className="space-y-8">

              {/* Step 1: Upload Outfit */}
              <section className="space-y-3">
                <StepLabel number={1} title="Upload Outfit" />

                <div className={cn(showValidation && !hasImage && 'rounded ring-2 ring-destructive ring-offset-1')}>
                  <FileUpload
                    key={resetKey}
                    onFileSelect={handleFileSelect}
                    disabled={createRender.isPending || isProcessing}
                  />
                </div>
                {showValidation && !hasImage && (
                  <p className="text-xs text-destructive font-mono">Please upload a garment photo.</p>
                )}

                {/* Garment type selector */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">What type of garment is this?</p>
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
                    <p className="text-xs text-destructive font-mono">Please select a garment type.</p>
                  )}
                </div>
              </section>

              {/* Step 2: Choose Model */}
              <section className="space-y-3">
                <StepLabel number={2} title="Choose Model" />
                {showValidation && !selectedIdentityId && (
                  <p className="text-xs text-destructive font-mono">Please choose a model.</p>
                )}
                <div className={cn(showValidation && !selectedIdentityId && 'rounded ring-2 ring-destructive ring-offset-1 p-2')}>
                  <ModelGallery
                    identities={identities as never}
                    selectedId={selectedIdentityId}
                    onSelect={(id: string) => { setSelectedIdentityId(id); setShowValidation(false); }}
                    disabled={createRender.isPending || isProcessing}
                  />
                </div>
              </section>

              {/* Create CTA */}
              <div className="space-y-3 pt-1">
                <Button
                  onClick={handleRender}
                  disabled={!canRender}
                  className="w-full h-12 text-sm font-semibold gap-2"
                  data-testid="button-render"
                >
                  {createRender.isPending ? (
                    <><span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />Starting…</>
                  ) : isProcessing ? (
                    <><span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />Creating…</>
                  ) : (
                    <><Camera className="w-4 h-4" />Create</>
                  )}
                </Button>

                {!usageLoading && usage?.tier === 'free' && (
                  <p className="text-center text-xs text-muted-foreground font-mono">
                    Free trial — {usage.used} of {usage.limit} renders used
                  </p>
                )}

                {limitBlocked && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <p className="text-xs text-destructive font-mono text-center">
                      Render limit reached — upgrade your plan to continue.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL — Output ────────────────────────────────── */}
            <div className="space-y-4">

              {/* Image canvas */}
              <div
                className="relative w-full rounded border border-border bg-card overflow-hidden flex items-center justify-center"
                style={{ aspectRatio: '4 / 5' }}
              >
                {/* Processing state */}
                {isProcessing && (
                  <div className="flex flex-col items-center gap-4 p-8 text-center">
                    <div className="relative w-14 h-14">
                      <div className="absolute inset-0 border-2 border-border rounded-full" />
                      <div className="absolute inset-0 border-2 border-t-foreground border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
                      <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-muted-foreground animate-pulse" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {isRefining ? 'Applying your changes…' : 'Creating your image…'}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">This usually takes 20–40 seconds</p>
                    </div>
                  </div>
                )}

                {/* Generated image */}
                {hasOutput && !isProcessing && (
                  <img
                    src={resolvedOutputUrl!}
                    alt="Generated fashion image"
                    className="w-full h-full object-cover animate-in fade-in duration-500"
                    data-testid="img-render-output"
                  />
                )}

                {/* Empty state */}
                {!isProcessing && !hasOutput && (
                  <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <div className="w-12 h-12 rounded-full border border-dashed border-border flex items-center justify-center">
                      <Camera className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Your image will appear here</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        Complete the steps on the left to get started
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Download + New — shown after generation */}
              {hasOutput && !isProcessing && (
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      activeRenderIds.length > 1
                        ? handleDownloadAll()
                        : handleDownloadSingle(resolvedOutputUrl!, 0)
                    }
                    variant="outline"
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
                    New
                  </Button>
                </div>
              )}

              {/* ✨ Refine Image panel — shown after generation */}
              {hasOutput && !isProcessing && (
                <div className="border border-border rounded bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">Refine Image</p>
                  </div>

                  <Textarea
                    value={refinementText}
                    onChange={(e) => setRefinementText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && refinementText.trim()) {
                        e.preventDefault();
                        handleRefine();
                      }
                    }}
                    placeholder="Describe what you'd like to change…"
                    rows={2}
                    disabled={isRefining || isProcessing}
                    className="resize-none text-sm placeholder:text-muted-foreground/50"
                  />

                  {/* Suggestion chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {REFINEMENT_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setRefinementText(chip)}
                        disabled={isRefining || isProcessing}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40 select-none"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <Button
                    onClick={handleRefine}
                    disabled={!refinementText.trim() || isRefining || isProcessing}
                    className="w-full gap-2"
                    size="sm"
                  >
                    {isRefining ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                        Refining…
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5" />
                        Refine
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ── Before & After ─────────────────────────────────────────────── */}
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
                  <p className="text-xs font-medium text-foreground mb-2">Generated Image</p>
                  <div className="aspect-video border border-border rounded bg-card overflow-hidden flex items-center justify-center">
                    {hasOutput ? (
                      <img
                        src={resolvedOutputUrl!}
                        alt="Generated output"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground font-mono">
                        {isProcessing ? 'Creating…' : 'Not yet created'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── FAQ ────────────────────────────────────────────────────────── */}
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
                  <AccordionContent className="text-xs text-muted-foreground pb-4 font-mono leading-relaxed">
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
