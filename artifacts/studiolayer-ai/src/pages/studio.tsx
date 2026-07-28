import { useState } from 'react';
import {
  useCreateRender,
  useGetRenderUsage,
  useGetRender,
  useCompleteOnboarding,
  useGetMe,
  getGetRenderUsageQueryKey,
  getGetMeQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/sidebar';
import { Footer } from '@/components/layout/footer';
import { FileUpload } from '@/components/ui/file-upload';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { OnboardingWizard } from '@/components/ui/onboarding-wizard';

const FAQ_ITEMS = [
  {
    q: 'Who legally owns the copyright of the final rendered fashion assets?',
    a: 'You do. Every single image layer generated inside your dashboard is 100% commercially owned by your brand, completely royalty-free.',
  },
  {
    q: 'What style of garment photography yields the highest-fidelity AI rendering results?',
    a: 'Clear smartphone photos shot under bright, even lighting against a neutral background (or a mannequin) allow our vision engine to isolate textures flawlessly.',
  },
  {
    q: 'Can I cancel or alter my subscription tier at any time?',
    a: 'Yes. You can upgrade, downgrade, or pause your active studio access instantly inside your billing command tab with zero exit contracts.',
  },
];

export default function StudioPage() {
  const [sourceImages, setSourceImages] = useState<string[]>([]);
  const [modelPersona, setModelPersona] = useState('');
  const [locationEnvironment, setLocationEnvironment] = useState('');
  const [modelDemographics, setModelDemographics] = useState('');
  const [imageDimensions, setImageDimensions] = useState('');
  const [smartLighting, setSmartLighting] = useState(false);
  const [brandWatermark, setBrandWatermark] = useState(false);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [activeRenderId, setActiveRenderId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useGetMe();
  const { data: usage, isLoading: usageLoading } = useGetRenderUsage();
  const createRender = useCreateRender();
  const completeOnboarding = useCompleteOnboarding();

  const isBulkEligible =
    user?.subscriptionTier === 'enterprise';

  const { data: activeRender } = useGetRender(activeRenderId || 0, {
    query: {
      enabled: !!activeRenderId,
      refetchInterval: (query) => {
        const render = query.state.data;
        if (render && (render.status === 'processing' || render.status === 'pending')) {
          return 2000;
        }
        return false;
      },
    },
  });

  const showOnboarding =
    user !== undefined && user.hasCompletedOnboarding === false;

  const handleCompleteOnboarding = () => {
    completeOnboarding.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
    });
  };

  const handleFileSelect = (url: string) => {
    if (bulkMode) {
      setSourceImages((prev) =>
        prev.length < 10 ? [...prev, url] : prev
      );
    } else {
      setSourceImages([url]);
    }
  };

  const handleRender = () => {
    const primary = sourceImages[0];
    if (!primary || !modelPersona || !locationEnvironment) {
      toast({
        title: 'Missing information',
        description: 'Please upload an image and select both model persona and location.',
        variant: 'destructive',
      });
      return;
    }

    if (!usage?.canRender) {
      toast({
        title: 'Render limit reached',
        description: 'Upgrade your plan to render more images.',
        variant: 'destructive',
      });
      return;
    }

    createRender.mutate(
      {
        data: {
          sourceImageUrl: primary,
          modelPersona: modelPersona as any,
          locationEnvironment: locationEnvironment as any,
          modelDemographics: (modelDemographics as any) || undefined,
          imageDimensions: (imageDimensions as any) || undefined,
          smartLighting: smartLighting || undefined,
        },
      },
      {
        onSuccess: (render) => {
          setActiveRenderId(render.id);
          queryClient.invalidateQueries({ queryKey: getGetRenderUsageQueryKey() });
          toast({
            title: 'Render started',
            description: 'Your editorial render is processing...',
          });
        },
        onError: (error: any) => {
          toast({
            title: 'Render failed',
            description: error?.error || 'Could not start render',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleDownload = () => {
    if (activeRender?.outputImageUrl) {
      const link = document.createElement('a');
      link.href = activeRender.outputImageUrl;
      link.download = `studiolayer-render-${activeRender.id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const canRender = !createRender.isPending && usage?.canRender;
  const isProcessing =
    activeRender?.status === 'processing' || activeRender?.status === 'pending';
  const hasOutput =
    activeRender?.status === 'completed' && activeRender?.outputImageUrl;

  return (
    <div className="flex h-screen bg-background">
      {showOnboarding && (
        <OnboardingWizard onComplete={handleCompleteOnboarding} />
      )}

      <Sidebar />

      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex-1 p-8">
          <div className="mb-6">
            <h2
              className="text-foreground mb-1"
              style={{
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: '26px',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              Studio Workspace
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              Transform flat-lay clothing into editorial renders
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* ── LEFT PANEL: Controls ── */}
            <div className="space-y-4">
              {/* Bulk mode toggle */}
              <div className="flex items-center justify-between p-3 border border-border rounded bg-card">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    ⚡ Switch to Bulk Studio Mode
                  </span>
                  {!isBulkEligible && (
                    <span className="text-xs text-muted-foreground font-mono">
                      (Enterprise only)
                    </span>
                  )}
                </div>
                <Switch
                  checked={bulkMode}
                  onCheckedChange={(v) => {
                    if (!isBulkEligible && v) {
                      toast({
                        title: 'Enterprise feature',
                        description: 'Upgrade to Enterprise to unlock Bulk Studio Mode.',
                        variant: 'destructive',
                      });
                      return;
                    }
                    setBulkMode(v);
                    setSourceImages([]);
                  }}
                  disabled={createRender.isPending}
                />
              </div>

              {/* File upload zone */}
              {bulkMode ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Bulk Upload ({sourceImages.length}/10)
                  </Label>
                  <div
                    className="border-2 border-dashed border-border rounded bg-card p-4 min-h-[120px] cursor-pointer"
                    onClick={() => {
                      const inp = document.createElement('input');
                      inp.type = 'file';
                      inp.accept = 'image/*';
                      inp.multiple = true;
                      inp.onchange = (e) => {
                        const files = Array.from(
                          (e.target as HTMLInputElement).files ?? []
                        ).slice(0, 10 - sourceImages.length);
                        files.forEach((file) => {
                          const reader = new FileReader();
                          reader.onloadend = () =>
                            setSourceImages((prev) =>
                              prev.length < 10
                                ? [...prev, reader.result as string]
                                : prev
                            );
                          reader.readAsDataURL(file);
                        });
                      };
                      inp.click();
                    }}
                  >
                    {sourceImages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-4 text-center">
                        <p className="text-sm font-medium text-foreground mb-1">
                          Bulk Upload Up to 10 Images
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          Click to select multiple files
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-5 gap-2">
                        {sourceImages.map((img, i) => (
                          <div
                            key={i}
                            className="relative aspect-square rounded overflow-hidden border border-border"
                          >
                            <img
                              src={img}
                              alt={`Upload ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <button
                              className="absolute top-0.5 right-0.5 bg-black/60 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSourceImages((prev) =>
                                  prev.filter((_, idx) => idx !== i)
                                );
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {sourceImages.length < 10 && (
                          <div className="aspect-square rounded border border-dashed border-border flex items-center justify-center text-muted-foreground text-xl">
                            +
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <FileUpload
                  onFileSelect={handleFileSelect}
                  disabled={createRender.isPending}
                />
              )}

              {/* Dropdowns grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Image Dimensions */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Select Image Dimensions</Label>
                  <Select
                    value={imageDimensions}
                    onValueChange={setImageDimensions}
                    disabled={createRender.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Aspect ratio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait_45">4:5 Portrait (Shopify &amp; Amazon)</SelectItem>
                      <SelectItem value="portrait_916">9:16 Vertical (TikTok Ads)</SelectItem>
                      <SelectItem value="square_11">1:1 Square (Social Media)</SelectItem>
                      <SelectItem value="landscape_169">16:9 Landscape (Banners &amp; Magazines)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Model Demographics */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Model Demographics</Label>
                  <Select
                    value={modelDemographics}
                    onValueChange={setModelDemographics}
                    disabled={createRender.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ethnicity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caucasian">Caucasian</SelectItem>
                      <SelectItem value="east_asian">East Asian</SelectItem>
                      <SelectItem value="south_asian">South Asian / Indian</SelectItem>
                      <SelectItem value="afro_american">Afro-American / Black</SelectItem>
                      <SelectItem value="hispanic">Hispanic / Latino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Model Persona */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Model Persona</Label>
                  <Select
                    value={modelPersona}
                    onValueChange={setModelPersona}
                    disabled={createRender.isPending}
                  >
                    <SelectTrigger data-testid="select-model-persona">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="high_fashion">High-Fashion</SelectItem>
                      <SelectItem value="athletic">Athletic</SelectItem>
                      <SelectItem value="minimalist">Minimalist</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Location Environment</Label>
                  <Select
                    value={locationEnvironment}
                    onValueChange={setLocationEnvironment}
                    disabled={createRender.isPending}
                  >
                    <SelectTrigger data-testid="select-location">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="photo_studio">Photo Studio</SelectItem>
                      <SelectItem value="urban_street">Urban Street</SelectItem>
                      <SelectItem value="luxury_interior">Luxury Interior</SelectItem>
                      <SelectItem value="nature">Nature</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Smart Ambient Lighting toggle */}
              <div className="flex items-center justify-between p-3 border border-border rounded bg-card">
                <div>
                  <p className="text-sm font-medium">Smart Ambient Lighting</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    Match Ambient Studio Lighting
                  </p>
                </div>
                <Switch
                  checked={smartLighting}
                  onCheckedChange={setSmartLighting}
                  disabled={createRender.isPending}
                />
              </div>

              {/* Dynamic Brand Watermark */}
              <div className="p-3 border border-border rounded bg-card space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="watermark"
                    checked={brandWatermark}
                    onCheckedChange={(v) => setBrandWatermark(!!v)}
                    disabled={createRender.isPending}
                  />
                  <Label htmlFor="watermark" className="text-sm font-medium cursor-pointer">
                    Dynamic Brand Watermark
                  </Label>
                </div>
                {brandWatermark && (
                  <div className="ml-6">
                    <p className="text-xs text-muted-foreground font-mono mb-2">
                      Upload transparent logo PNG
                    </p>
                    <FileUpload
                      onFileSelect={setWatermarkUrl}
                      accept="image/png"
                      disabled={createRender.isPending}
                      className="min-h-0"
                    />
                    {watermarkUrl && (
                      <div className="mt-2 w-16 h-16 border border-border rounded overflow-hidden">
                        <img
                          src={watermarkUrl}
                          alt="Watermark"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Render button */}
              <Button
                onClick={handleRender}
                disabled={!canRender}
                className="w-full"
                data-testid="button-render"
              >
                {createRender.isPending ? 'Starting render...' : 'Render Studio Image Layer'}
              </Button>

              {/* Usage */}
              {!usageLoading && usage && (
                <div className="p-3 bg-card border border-border rounded">
                  <p className="text-xs text-muted-foreground font-mono">
                    {usage.limit === null
                      ? `${usage.used} renders used · Unlimited plan`
                      : `${usage.used} of ${usage.limit} renders used · ${usage.tier} tier`}
                  </p>
                </div>
              )}
            </div>

            {/* ── RIGHT PANEL: Output ── */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">AI Studio Output</Label>
                <div
                  className="border-2 border-dashed border-border rounded bg-card flex items-center justify-center overflow-hidden"
                  style={{ aspectRatio: '1 / 1' }}
                >
                  {isProcessing && (
                    <div className="text-center p-8">
                      <div className="w-16 h-16 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4 animate-pulse-shimmer" />
                      <p className="text-sm text-foreground font-medium">
                        Rendering in progress...
                      </p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        This may take a few moments
                      </p>
                    </div>
                  )}
                  {hasOutput && (
                    <div className="relative w-full h-full">
                      <img
                        src={activeRender.outputImageUrl!}
                        alt="Rendered output"
                        className="w-full h-full object-cover"
                        data-testid="img-render-output"
                      />
                      {brandWatermark && watermarkUrl && (
                        <img
                          src={watermarkUrl}
                          alt="Watermark"
                          className="absolute bottom-3 right-3 w-16 h-16 object-contain opacity-80"
                        />
                      )}
                    </div>
                  )}
                  {!isProcessing && !hasOutput && (
                    <div className="text-center p-8">
                      <p className="text-sm text-muted-foreground font-mono">
                        Your rendered output will appear here
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {hasOutput && (
                <Button
                  onClick={handleDownload}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  data-testid="button-download"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download High-Res Studio Asset
                </Button>
              )}
            </div>
          </div>

          {/* Source / output preview strip */}
          <div className="border-t border-border pt-6 mb-8">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-2 block">Source Layer</Label>
                <div className="aspect-video border border-border rounded bg-card flex items-center justify-center overflow-hidden">
                  {sourceImages[0] ? (
                    <img
                      src={sourceImages[0]}
                      alt="Source"
                      className="w-full h-full object-cover"
                      data-testid="img-source"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground font-mono">
                      No source uploaded
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">AI Studio Output</Label>
                <div className="aspect-video border border-border rounded bg-card flex items-center justify-center overflow-hidden">
                  {hasOutput ? (
                    <img
                      src={activeRender.outputImageUrl!}
                      alt="Output preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground font-mono">
                      {isProcessing ? 'Processing...' : 'No output yet'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* FAQ accordion */}
          <div className="border-t border-border pt-6">
            <h3 className="text-sm font-medium text-muted-foreground font-mono mb-4 uppercase tracking-wider">
              Studio FAQ
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
                  <AccordionContent className="text-sm text-muted-foreground pb-4">
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
