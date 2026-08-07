// ---------------------------------------------------------------------------
// Studio workflow context — one object drives preview, validation, and payload
// ---------------------------------------------------------------------------

import { useGetMe } from '@workspace/api-client-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  EMPTY_STUDIO_WORKFLOW,
  destroyStoredStudioWorkflow,
  normalizeStudioWorkflow,
  type GarmentPlacement,
  type GarmentLengthSelection,
  type ShootType,
  type StudioWorkflow,
} from '@/lib/studio-workflow';

interface StudioWorkflowContextValue {
  workflow: StudioWorkflow;
  patchWorkflow: (patch: Partial<StudioWorkflow>) => void;
  setSourceImageUrl: (url: string) => void;
  setGarmentPlacement: (placement: GarmentPlacement) => void;
  setGarmentLengthSelection: (selection: GarmentLengthSelection) => void;
  setTalentId: (id: string) => void;
  setImageCount: (count: ShootType) => void;
  resetWorkflow: () => void;
}

const StudioWorkflowContext = createContext<StudioWorkflowContextValue | null>(null);

export function StudioWorkflowProvider({ children }: { children: ReactNode }) {
  const { data: user, isSuccess } = useGetMe();
  const userId = isSuccess && user ? user.id : null;

  const [workflow, setWorkflowState] = useState<StudioWorkflow>(EMPTY_STUDIO_WORKFLOW);
  const [hydratedUserId, setHydratedUserId] = useState<number | null | undefined>(undefined);

  // Fresh session on login — always start with an empty workflow.
  useEffect(() => {
    if (userId === hydratedUserId) return;

    setHydratedUserId(userId);
    setWorkflowState(EMPTY_STUDIO_WORKFLOW);
  }, [userId, hydratedUserId]);

  const patchWorkflow = useCallback((patch: Partial<StudioWorkflow>) => {
    setWorkflowState((prev) => normalizeStudioWorkflow({ ...prev, ...patch }));
  }, []);

  const setSourceImageUrl = useCallback((url: string) => {
    patchWorkflow({ sourceImageUrl: url });
  }, [patchWorkflow]);

  const setGarmentPlacement = useCallback((placement: GarmentPlacement) => {
    patchWorkflow({
      garmentPlacement: placement,
      ...(placement !== 'full_body' ? { garmentLengthSelection: 'auto' as const } : {}),
    });
  }, [patchWorkflow]);

  const setGarmentLengthSelection = useCallback((selection: GarmentLengthSelection) => {
    patchWorkflow({ garmentLengthSelection: selection });
  }, [patchWorkflow]);

  const setTalentId = useCallback((id: string) => {
    patchWorkflow({ talentId: id });
  }, [patchWorkflow]);

  const setImageCount = useCallback((count: ShootType) => {
    patchWorkflow({ imageCount: count });
  }, [patchWorkflow]);

  const resetWorkflow = useCallback(() => {
    setWorkflowState(EMPTY_STUDIO_WORKFLOW);
    destroyStoredStudioWorkflow(userId);
  }, [userId]);

  const value = useMemo(
    () => ({
      workflow,
      patchWorkflow,
      setSourceImageUrl,
      setGarmentPlacement,
      setGarmentLengthSelection,
      setTalentId,
      setImageCount,
      resetWorkflow,
    }),
    [
      workflow,
      patchWorkflow,
      setSourceImageUrl,
      setGarmentPlacement,
      setGarmentLengthSelection,
      setTalentId,
      setImageCount,
      resetWorkflow,
    ],
  );

  return (
    <StudioWorkflowContext.Provider value={value}>
      {children}
    </StudioWorkflowContext.Provider>
  );
}

export function useStudioWorkflow(): StudioWorkflowContextValue {
  const ctx = useContext(StudioWorkflowContext);
  if (!ctx) {
    throw new Error('useStudioWorkflow must be used within StudioWorkflowProvider');
  }
  return ctx;
}
