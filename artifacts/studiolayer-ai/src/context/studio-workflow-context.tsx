// ---------------------------------------------------------------------------
// Studio workflow context — workflow inputs + workspace session (Fix #7)
//
// Provider wraps the router so Studio workspace state survives route changes
// (Studio → Gallery → Studio). Session is mirrored to sessionStorage for the
// active browser tab; cleared on New Image or logout.
// ---------------------------------------------------------------------------

import { useGetMe } from '@workspace/api-client-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  DEFAULT_GARMENT_LENGTH_SELECTION,
  EMPTY_STUDIO_WORKFLOW,
  destroyStoredStudioWorkflow,
  normalizeStudioWorkflow,
  type GarmentPlacement,
  type GarmentLengthSelection,
  type ShootType,
  type StudioWorkflow,
} from '@/lib/studio-workflow';
import {
  EMPTY_STUDIO_WORKSPACE_STATE,
  clearStudioWorkspaceSession,
  loadStudioWorkspaceSession,
  normalizeStudioWorkspaceState,
  saveStudioWorkspaceSession,
  type StudioRefinementPending,
  type StudioWorkspaceState,
} from '@/lib/studio-workspace-session';

interface StudioWorkflowContextValue {
  workflow: StudioWorkflow;
  workspace: StudioWorkspaceState;
  patchWorkflow: (patch: Partial<StudioWorkflow>) => void;
  setSourceImageUrl: (url: string) => void;
  setBackImageUrl: (url: string) => void;
  setDetailImageUrl: (url: string) => void;
  setGarmentPlacement: (placement: GarmentPlacement) => void;
  setGarmentLengthSelection: (selection: GarmentLengthSelection) => void;
  setTalentId: (id: string) => void;
  setImageCount: (count: ShootType) => void;
  setActiveRenderIds: Dispatch<SetStateAction<number[]>>;
  setRootRenderIds: Dispatch<SetStateAction<number[]>>;
  setMasterOutputUrls: Dispatch<SetStateAction<Record<number, string>>>;
  setRefinementPending: Dispatch<SetStateAction<StudioRefinementPending | null>>;
  setGenerationInFlight: (inFlight: boolean) => void;
  patchWorkspace: (patch: Partial<StudioWorkspaceState>) => void;
  resetWorkflow: () => void;
  resetStudioSession: () => void;
}

const StudioWorkflowContext = createContext<StudioWorkflowContextValue | null>(null);

function hasWorkspaceContent(session: { workflow: StudioWorkflow; workspace: StudioWorkspaceState }): boolean {
  const { workflow, workspace } = session;
  return Boolean(
    workflow.sourceImageUrl
    || workflow.backImageUrl
    || workflow.detailImageUrl
    || workflow.talentId
    || workflow.garmentPlacement
    || workspace.activeRenderIds.length > 0,
  );
}

function useWorkspaceFieldSetter<K extends keyof StudioWorkspaceState>(
  setWorkspaceState: Dispatch<SetStateAction<StudioWorkspaceState>>,
  field: K,
): Dispatch<SetStateAction<StudioWorkspaceState[K]>> {
  return useCallback((action) => {
    setWorkspaceState((prev) => {
      const nextValue = typeof action === 'function'
        ? (action as (value: StudioWorkspaceState[K]) => StudioWorkspaceState[K])(prev[field])
        : action;
      return normalizeStudioWorkspaceState({ ...prev, [field]: nextValue });
    });
  }, [setWorkspaceState, field]);
}

export function StudioWorkflowProvider({ children }: { children: ReactNode }) {
  const { data: user, isSuccess } = useGetMe();
  const userId = isSuccess && user ? user.id : null;

  const [workflow, setWorkflowState] = useState<StudioWorkflow>(EMPTY_STUDIO_WORKFLOW);
  const [workspace, setWorkspaceState] = useState<StudioWorkspaceState>(EMPTY_STUDIO_WORKSPACE_STATE);
  const [hydratedUserId, setHydratedUserId] = useState<number | null | undefined>(undefined);

  // Hydrate from sessionStorage once per authenticated user — not on route changes.
  useEffect(() => {
    if (userId === hydratedUserId) return;

    setHydratedUserId(userId);

    if (userId == null) {
      setWorkflowState(EMPTY_STUDIO_WORKFLOW);
      setWorkspaceState(EMPTY_STUDIO_WORKSPACE_STATE);
      return;
    }

    const stored = loadStudioWorkspaceSession(userId);
    if (stored && hasWorkspaceContent(stored)) {
      setWorkflowState(stored.workflow);
      setWorkspaceState(stored.workspace);
      return;
    }

    setWorkflowState(EMPTY_STUDIO_WORKFLOW);
    setWorkspaceState(EMPTY_STUDIO_WORKSPACE_STATE);
  }, [userId, hydratedUserId]);

  // Mirror working session to sessionStorage while authenticated.
  useEffect(() => {
    if (userId == null || userId !== hydratedUserId) return;

    if (!hasWorkspaceContent({ workflow, workspace })) {
      destroyStoredStudioWorkflow(userId);
      return;
    }

    saveStudioWorkspaceSession(userId, {
      version: 1,
      workflow,
      workspace: normalizeStudioWorkspaceState(workspace),
    });
  }, [userId, hydratedUserId, workflow, workspace]);

  const patchWorkflow = useCallback((patch: Partial<StudioWorkflow>) => {
    setWorkflowState((prev) => normalizeStudioWorkflow({ ...prev, ...patch }));
  }, []);

  const patchWorkspace = useCallback((patch: Partial<StudioWorkspaceState>) => {
    setWorkspaceState((prev) => normalizeStudioWorkspaceState({ ...prev, ...patch }));
  }, []);

  const setSourceImageUrl = useCallback((url: string) => {
    patchWorkflow({ sourceImageUrl: url });
  }, [patchWorkflow]);

  const setBackImageUrl = useCallback((url: string) => {
    patchWorkflow({ backImageUrl: url });
  }, [patchWorkflow]);

  const setDetailImageUrl = useCallback((url: string) => {
    patchWorkflow({ detailImageUrl: url });
  }, [patchWorkflow]);

  const setGarmentPlacement = useCallback((placement: GarmentPlacement) => {
    patchWorkflow({
      garmentPlacement: placement,
      ...(placement !== 'full_body'
        ? { garmentLengthSelection: DEFAULT_GARMENT_LENGTH_SELECTION }
        : {}),
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

  const setActiveRenderIds = useWorkspaceFieldSetter(setWorkspaceState, 'activeRenderIds');
  const setRootRenderIds = useWorkspaceFieldSetter(setWorkspaceState, 'rootRenderIds');
  const setMasterOutputUrls = useWorkspaceFieldSetter(setWorkspaceState, 'masterOutputUrls');
  const setRefinementPending = useWorkspaceFieldSetter(setWorkspaceState, 'refinementPending');

  const setGenerationInFlight = useCallback((inFlight: boolean) => {
    setWorkspaceState((prev) => (
      prev.generationInFlight === inFlight
        ? prev
        : normalizeStudioWorkspaceState({ ...prev, generationInFlight: inFlight })
    ));
  }, []);

  const resetStudioSession = useCallback(() => {
    setWorkflowState(EMPTY_STUDIO_WORKFLOW);
    setWorkspaceState(EMPTY_STUDIO_WORKSPACE_STATE);
    destroyStoredStudioWorkflow(userId);
    clearStudioWorkspaceSession(userId);
  }, [userId]);

  const resetWorkflow = resetStudioSession;

  const value = useMemo(
    () => ({
      workflow,
      workspace,
      patchWorkflow,
      setSourceImageUrl,
      setBackImageUrl,
      setDetailImageUrl,
      setGarmentPlacement,
      setGarmentLengthSelection,
      setTalentId,
      setImageCount,
      setActiveRenderIds,
      setRootRenderIds,
      setMasterOutputUrls,
      setRefinementPending,
      setGenerationInFlight,
      patchWorkspace,
      resetWorkflow,
      resetStudioSession,
    }),
    [
      workflow,
      workspace,
      patchWorkflow,
      setSourceImageUrl,
      setBackImageUrl,
      setDetailImageUrl,
      setGarmentPlacement,
      setGarmentLengthSelection,
      setTalentId,
      setImageCount,
      setActiveRenderIds,
      setRootRenderIds,
      setMasterOutputUrls,
      setRefinementPending,
      setGenerationInFlight,
      patchWorkspace,
      resetStudioSession,
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

export type { StudioRefinementPending };
