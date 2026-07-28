import { Sidebar } from '@/components/layout/sidebar';
import { useListRenders } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function GalleryPage() {
  const { data: renders, isLoading } = useListRenders();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-accent text-accent-foreground';
      case 'processing':
      case 'pending':
        return 'bg-muted text-muted-foreground';
      case 'failed':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Asset Gallery
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              Your complete render history
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-muted-foreground font-mono">
                  Loading renders...
                </p>
              </div>
            </div>
          )}

          {!isLoading && renders && renders.length === 0 && (
            <div className="border-2 border-dashed border-border rounded bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground font-mono">
                No renders yet. Create your first render in the Studio Workspace.
              </p>
            </div>
          )}

          {!isLoading && renders && renders.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {renders.map((render) => (
                <div
                  key={render.id}
                  className="border border-border rounded bg-card overflow-hidden hover:border-accent/50 transition-colors"
                  data-testid={`card-render-${render.id}`}
                >
                  <div className="grid grid-cols-2 gap-0">
                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden border-r border-border">
                      {render.sourceImageUrl ? (
                        <img
                          src={render.sourceImageUrl}
                          alt="Source"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground font-mono p-2 text-center">
                          No source
                        </p>
                      )}
                    </div>
                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                      {render.status === 'completed' && render.outputImageUrl ? (
                        <img
                          src={render.outputImageUrl}
                          alt="Output"
                          className="w-full h-full object-cover"
                        />
                      ) : render.status === 'processing' || render.status === 'pending' ? (
                        <div className="text-center p-4">
                          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground font-mono">
                            Processing
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground font-mono p-2 text-center">
                          {render.status === 'failed' ? 'Failed' : 'No output'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-4 border-t border-border">
                    <div className="flex items-center justify-between mb-2">
                      <Badge
                        className={getStatusColor(render.status)}
                        data-testid={`badge-status-${render.id}`}
                      >
                        {render.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(new Date(render.createdAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono space-y-1">
                      <p>
                        Model: {render.modelPersona.replace('_', ' ')}
                      </p>
                      <p>
                        Location: {render.locationEnvironment.replace('_', ' ')}
                      </p>
                    </div>
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
