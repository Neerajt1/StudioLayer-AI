// ---------------------------------------------------------------------------
// Studio Deletion — Danger Zone, confirmation flow, and farewell handoff
// ---------------------------------------------------------------------------

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeleteStudio } from '@workspace/api-client-react';
import { StudioDeletionFarewell } from '@/components/account/studio-deletion-farewell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestStudioIntroOnLogout } from '@/lib/studio-intro';
import { clearAllStudioLayerStorage } from '@/lib/studio-storage';

const DELETE_CONFIRMATION = 'delete';

function isDeleteConfirmationValid(value: string): boolean {
  return value.trim().toLowerCase() === DELETE_CONFIRMATION;
}

type DeletionPhase = 'idle' | 'step1' | 'step2' | 'farewell';

export function StudioDeletionSection() {
  const [phase, setPhase] = useState<DeletionPhase>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const deleteStudioMutation = useDeleteStudio();

  const resetFlow = useCallback(() => {
    setPhase('idle');
    setConfirmText('');
    setDeleteError(null);
  }, []);

  const handleDeleteStudio = () => {
    setDeleteError(null);
    deleteStudioMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        clearAllStudioLayerStorage();
        setPhase('farewell');
      },
      onError: () => {
        setDeleteError(
          "We couldn't complete your Studio deletion at this time. Please try again in a few moments.",
        );
      },
    });
  };

  const handleFarewellComplete = useCallback(() => {
    requestStudioIntroOnLogout();
    const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
    window.location.assign(`${appBase}/login`);
  }, []);

  const isDeleting = deleteStudioMutation.isPending;
  const canDelete = isDeleteConfirmationValid(confirmText) && !isDeleting;

  return (
    <>
      <section className="mt-6 border border-border rounded bg-card p-6">
        <h3 className="sl-section-label mb-1">Danger Zone</h3>
        <p className="sl-ui-helper mb-6">
          Permanently remove your Studio and all associated data.
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-sm text-muted-foreground border-border hover:text-destructive"
          onClick={() => setPhase('step1')}
        >
          Delete Studio
        </Button>
      </section>

      <Dialog
        open={phase === 'step1'}
        onOpenChange={(open) => {
          if (!open) {
            resetFlow();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete Studio</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2 text-sm leading-relaxed text-muted-foreground">
                <p>Deleting your Studio is permanent.</p>
                <div>
                  <p className="mb-2">This action will permanently remove:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Your Studio profile</li>
                    <li>Studio Talent preferences</li>
                    <li>Editorial Images</li>
                    <li>Upload history</li>
                    <li>Studio settings and preferences</li>
                    <li>Active sessions</li>
                  </ul>
                </div>
                <p>
                  If you have an active subscription, it will be cancelled before your
                  Studio is deleted.
                </p>
                <p>
                  Billing records required for legal and accounting purposes may be
                  retained.
                </p>
                <p>This action cannot be undone.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetFlow}>
              Cancel
            </Button>
            <Button type="button" onClick={() => setPhase('step2')}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={phase === 'step2'}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            resetFlow();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm Studio Deletion</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2 text-sm leading-relaxed text-muted-foreground">
                <p>
                  To permanently delete your Studio, type{' '}
                  <span className="text-foreground">delete</span> below.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="studio-deletion-confirm" className="sr-only">
                    Type delete to confirm
                  </Label>
                  <Input
                    id="studio-deletion-confirm"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="delete"
                    disabled={isDeleting}
                  />
                </div>
                {deleteError && (
                  <p className="text-sm leading-relaxed text-muted-foreground" role="alert">
                    {deleteError}
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetFlow} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-destructive border-destructive/30 hover:text-destructive"
              disabled={!canDelete}
              onClick={handleDeleteStudio}
            >
              {isDeleting ? 'Deleting Studio…' : 'Delete Studio Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {phase === 'farewell' && (
        <StudioDeletionFarewell onComplete={handleFarewellComplete} />
      )}
    </>
  );
}
