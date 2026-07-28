import { useState, useEffect } from 'react';
import { useCreateRender, useGetRenderUsage, useGetRender, getGetRenderUsageQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/sidebar';
import { FileUpload } from '@/components/ui/file-upload';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function StudioPage() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [modelPersona, setModelPersona] = useState<string>('');
  const [locationEnvironment, setLocationEnvironment] = useState<string>('');
  const [activeRenderId, setActiveRenderId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: usage, isLoading: usageLoading } = useGetRenderUsage();
  const createRender = useCreateRender();
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

  const handleRender = () => {
    if (!sourceImage || !modelPersona || !locationEnvironment) {
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
          sourceImageUrl: sourceImage,
          modelPersona: modelPersona as any,
          locationEnvironment: locationEnvironment as any,
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
  const isProcessing = activeRender?.status === 'processing' || activeRender?.status === 'pending';
  const hasOutput = activeRender?.status === 'completed' && activeRender?.outputImageUrl;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Studio Workspace
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              Transform flat-lay clothing into editorial renders
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <FileUpload
                onFileSelect={setSourceImage}
                disabled={createRender.isPending}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
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

                <div className="space-y-2">
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

              <Button
                onClick={handleRender}
                disabled={!canRender}
                className="w-full"
                data-testid="button-render"
              >
                {createRender.isPending ? 'Starting render...' : 'Render Studio Image Layer'}
              </Button>

              {!usageLoading && usage && (
                <div className="p-3 bg-card border border-border rounded">
                  <p className="text-xs text-muted-foreground font-mono">
                    {usage.limit === null
                      ? `${usage.used} renders used • Unlimited plan`
                      : `${usage.used} of ${usage.limit} renders used • ${usage.tier} tier`}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">AI Studio Output</Label>
                <div className="aspect-square border-2 border-dashed border-border rounded bg-card flex items-center justify-center overflow-hidden">
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
                    <img
                      src={activeRender.outputImageUrl!}
                      alt="Rendered output"
                      className="w-full h-full object-cover"
                      data-testid="img-render-output"
                    />
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

          <div className="border-t border-border pt-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-2 block">Source Layer</Label>
                <div className="aspect-video border border-border rounded bg-card flex items-center justify-center overflow-hidden">
                  {sourceImage ? (
                    <img
                      src={sourceImage}
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
        </div>
      </main>
    </div>
  );
}
