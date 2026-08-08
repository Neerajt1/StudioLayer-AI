// ---------------------------------------------------------------------------
// Studio workspace session — transient working state across route navigation
// ---------------------------------------------------------------------------

import type { RefinementType } from '@/lib/refinement-types';
import type { CropAspectMode, NormalizedCropRect } from '@/lib/studio-crop';
import {
  EMPTY_STUDIO_WORKFLOW,
  normalizeStudioWorkflow,
  type StudioWorkflow,
} from '@/lib/studio-workflow';

export interface StudioRefinementPending {
  slot: number;
  parentRenderId: number;
  childRenderId: number;
  refinementType: RefinementType;
}

export interface StudioWorkspaceState {
  activeRenderIds: number[];
  rootRenderIds: number[];
  masterOutputUrls: Record<number, string>;
  customCropRects: Record<number, NormalizedCropRect>;
  customCropAspects: Record<number, CropAspectMode>;
  refinementPending: StudioRefinementPending | null;
  /** True while a generation batch is awaiting display or still processing on the server. */
  generationInFlight: boolean;
}

export interface StudioWorkspaceSession {
  version: 1;
  workflow: StudioWorkflow;
  workspace: StudioWorkspaceState;
}

export const EMPTY_STUDIO_WORKSPACE_STATE: StudioWorkspaceState = {
  activeRenderIds: [],
  rootRenderIds: [],
  masterOutputUrls: {},
  customCropRects: {},
  customCropAspects: {},
  refinementPending: null,
  generationInFlight: false,
};

export const EMPTY_STUDIO_WORKSPACE_SESSION: StudioWorkspaceSession = {
  version: 1,
  workflow: EMPTY_STUDIO_WORKFLOW,
  workspace: EMPTY_STUDIO_WORKSPACE_STATE,
};

const SESSION_KEY_PREFIX = 'studiolayer:studio-workspace';

function sessionKey(userId: number): string {
  return `${SESSION_KEY_PREFIX}:${userId}`;
}

function isCropAspectMode(value: unknown): value is CropAspectMode {
  return value === 'free'
    || value === 'portrait'
    || value === 'square'
    || value === 'landscape'
    || value === 'vertical';
}

function normalizeNormalizedCropRect(raw: unknown): NormalizedCropRect | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const x = record.x;
  const y = record.y;
  const w = record.w;
  const h = record.h;
  if (
    typeof x === 'number'
    && typeof y === 'number'
    && typeof w === 'number'
    && typeof h === 'number'
    && w > 0
    && h > 0
  ) {
    return { x, y, w, h };
  }
  return null;
}

function normalizeCustomCropRectRecord(raw: unknown): Record<number, NormalizedCropRect> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<number, NormalizedCropRect> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(key);
    const rect = normalizeNormalizedCropRect(value);
    if (Number.isInteger(index) && index >= 0 && rect) {
      result[index] = rect;
    }
  }
  return result;
}

function normalizeCustomCropAspectRecord(raw: unknown): Record<number, CropAspectMode> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<number, CropAspectMode> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && isCropAspectMode(value)) {
      result[index] = value;
    }
  }
  return result;
}

function isRefinementType(value: unknown): value is RefinementType {
  return value === 'remove_background'
    || value === 'enhance_model_face'
    || value === 'enhance_garment';
}

function normalizeNumberRecord(raw: unknown): Record<number, string> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<number, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && typeof value === 'string' && value.startsWith('http')) {
      result[index] = value;
    }
  }
  return result;
}

function normalizeRefinementPending(raw: unknown): StudioRefinementPending | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const slot = record.slot;
  const parentRenderId = record.parentRenderId;
  const childRenderId = record.childRenderId;
  const refinementType = record.refinementType;
  if (
    typeof slot === 'number'
    && typeof parentRenderId === 'number'
    && typeof childRenderId === 'number'
    && isRefinementType(refinementType)
  ) {
    return { slot, parentRenderId, childRenderId, refinementType };
  }
  return null;
}

function normalizeNumberArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is number => typeof value === 'number' && value > 0);
}

export function normalizeStudioWorkspaceState(
  raw: Partial<StudioWorkspaceState> | null | undefined,
): StudioWorkspaceState {
  return {
    activeRenderIds: normalizeNumberArray(raw?.activeRenderIds),
    rootRenderIds: normalizeNumberArray(raw?.rootRenderIds),
    masterOutputUrls: normalizeNumberRecord(raw?.masterOutputUrls),
    customCropRects: normalizeCustomCropRectRecord(raw?.customCropRects),
    customCropAspects: normalizeCustomCropAspectRecord(raw?.customCropAspects),
    refinementPending: normalizeRefinementPending(raw?.refinementPending),
    generationInFlight: raw?.generationInFlight === true,
  };
}

export function normalizeStudioWorkspaceSession(
  raw: Partial<StudioWorkspaceSession> | null | undefined,
): StudioWorkspaceSession {
  return {
    version: 1,
    workflow: normalizeStudioWorkflow(raw?.workflow),
    workspace: normalizeStudioWorkspaceState(raw?.workspace),
  };
}

export function loadStudioWorkspaceSession(userId: number): StudioWorkspaceSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(userId));
    if (!raw) return null;
    return normalizeStudioWorkspaceSession(JSON.parse(raw) as Partial<StudioWorkspaceSession>);
  } catch {
    return null;
  }
}

export function saveStudioWorkspaceSession(userId: number, session: StudioWorkspaceSession): void {
  try {
    sessionStorage.setItem(sessionKey(userId), JSON.stringify(normalizeStudioWorkspaceSession(session)));
  } catch {
    /* sessionStorage unavailable or quota exceeded */
  }
}

export function clearStudioWorkspaceSession(userId: number | null): void {
  if (userId == null) return;
  try {
    sessionStorage.removeItem(sessionKey(userId));
  } catch {
    /* sessionStorage unavailable */
  }
}

/** Remove workspace session keys for logout / explicit reset. */
export function destroyStoredStudioWorkspace(userId: number | null): void {
  clearStudioWorkspaceSession(userId);
}
