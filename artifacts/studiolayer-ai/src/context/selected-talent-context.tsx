// ---------------------------------------------------------------------------
// Compatibility shim — talent reads/writes the unified Studio workflow object
// ---------------------------------------------------------------------------

export { StudioWorkflowProvider as SelectedTalentProvider } from './studio-workflow-context';
export { useStudioWorkflow } from './studio-workflow-context';
export { clearLegacyStudioWorkflowStorage as removeLegacySelectedTalentStorage } from '@/lib/studio-workflow';

import { useStudioWorkflow } from './studio-workflow-context';

interface SelectedTalentContextValue {
  selectedTalentId: string;
  setSelectedTalentId: (id: string) => void;
}

export function useSelectedTalent(): SelectedTalentContextValue {
  const { workflow, setTalentId } = useStudioWorkflow();
  return {
    selectedTalentId: workflow.talentId,
    setSelectedTalentId: setTalentId,
  };
}
