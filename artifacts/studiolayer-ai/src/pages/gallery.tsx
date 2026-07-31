import { Sidebar } from '@/components/layout/sidebar';
import {
  useListRenders,
  useDeleteRender,
  getListRendersQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Download, Trash2, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';

export default function GalleryPage() {
  const { data: renders, isLoading } = useListRenders();
  const deleteRender = useDeleteRender();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();
  const [, navigate] = useLocation();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':  return 'bg-accent text-accent-foreground';
      case 'processing':
      case 'pending':    return 'bg-muted text-muted-foreground';
      case 'failed':     return 'bg-destructive text-destructive-foreground';
      default:           return 'bg-secondary text-secondary-foreground';
    }
  };

  const handleDelete = (id: number) => {
    deleteRender.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRendersQueryKey() });
          toast({ title: 'Asset deleted', description: 'The image has been removed.' });
        },
        onError: () => {
          toast({ title: 'Delete failed', description: 'Could not delete this image. Please try again.', variant: 'destructive' });
        },
      }
    );
  };

  const handleDownload = async (url: string, id: number) => {
    const filename = `studioLayer_render_${id}.jpg`;
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

  const handleRefineFromGallery = (render: {
    id: number;
    sourceImageUrl: string | null;
    outputImageUrl: string | null;
  }) => {
    if (!render.sourceImageUrl) {
      toast({ title: 'Cannot refine', description: 'This image has no source garment on record.', variant: 'destructive' });
      return;
    }
    // Pass render context to studio via sessionStorage (wouter has no location state).
    sessionStorage.setItem('studioRefineRender', JSON.stringify({
      id:             render.id,
      sourceImageUrl: render.sourceImageUrl,
      outputImageUrl: render.outputImageUrl,
    }));
    navigate('/studio');
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-1">Assets</h2>
            <p className="text-sm text-muted-foreground font-mono">
              Your complete image library
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-muted-foreground font-mono">Loading assets…</p>
              </div>
            </div>
          )}

          {!isLoading && renders && renders.length === 0 && (
            <div className="border-2 border-dashed border-border rounded-lg bg-card p-16 text-center">
              <div className="w-12 h-12 rounded-full border border-dashed border-border flex items-center justify-center mx-auto mb-4">
                <Download className="w-5 h-5 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No assets yet</p>
              <p className="text-xs text-muted-foreground font-mono">
                Create your first Hero, Campaign, or Editorial in the Studio.
              </p>
            </div>
          )}

          {!isLoading && renders && renders.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {renders.map((render) => (
                <div
                  key={render.id}
                  className="border border-border rounded-lg bg-card overflow-hidden hover:border-foreground/20 transition-colors group"
                  data-testid={`card-render-${render.id}`}
                >
                  {/* ── Images ── */}
                  <div className="grid grid-cols-2 gap-0">
                    {/* Source */}
                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden border-r border-border">
                      {render.sourceImageUrl ? (
                        <img src={render.sourceImageUrl} alt="Garment" className="w-full h-full object-cover" />
                      ) : (
                        <p className="text-[10px] text-muted-foreground font-mono p-2 text-center">No garment</p>
                      )}
                    </div>

                    {/* Output */}
                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                      {render.status === 'completed' && render.outputImageUrl ? (
                        <img src={render.outputImageUrl} alt="Generated" className="w-full h-full object-cover" />
                      ) : render.status === 'processing' || render.status === 'pending' ? (
                        <div className="text-center p-4">
                          <div className="w-5 h-5 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-[10px] text-muted-foreground font-mono">Processing…</p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground font-mono p-2 text-center">
                          {render.status === 'failed' ? 'Failed' : 'No output'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ── Metadata ── */}
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <Badge className={getStatusColor(render.status)} data-testid={`badge-status-${render.id}`}>
                        {render.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {format(new Date(render.createdAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>

                  {/* ── Action bar ── */}
                  <div className="flex items-center gap-1.5 px-4 pb-3 border-t border-border/50 pt-2.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-[11px] gap-1.5"
                      disabled={render.status !== 'completed' || !render.outputImageUrl}
                      onClick={() => handleDownload(render.outputImageUrl!, render.id)}
                      data-testid={`btn-download-render-${render.id}`}
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-[11px] gap-1.5"
                      disabled={render.status !== 'completed' || !render.outputImageUrl}
                      onClick={() => handleRefineFromGallery(render as never)}
                      data-testid={`btn-refine-render-${render.id}`}
                    >
                      <Wand2 className="w-3 h-3" />
                      Refine
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:border-destructive"
                      disabled={deleteRender.isPending}
                      onClick={() => handleDelete(render.id)}
                      data-testid={`btn-delete-render-${render.id}`}
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
