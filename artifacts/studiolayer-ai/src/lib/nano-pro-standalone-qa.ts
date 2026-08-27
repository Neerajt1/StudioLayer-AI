/**
 * LOCAL QA ONLY — Nano Pro Standalone Create intercept.
 *
 * When enabled (Vite DEV + VITE_NANO_PRO_STANDALONE_QA=true), Studio Workspace
 * Create calls POST /api/test/nano-pro-standalone-trial instead of POST /api/renders.
 *
 * Does NOT change production Create, pose library UI, credits, or Gallery.
 * Backend still requires EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED=true.
 */

import { apiUrl } from './api-base-url';
import {
  buildNanoProStandaloneQaPoseMasterPath,
  isNanoProStandaloneQaModeEnabled,
} from './nano-pro-standalone-qa-mode';

export {
  NANO_PRO_STANDALONE_QA_VITE_FLAG,
  buildNanoProStandaloneQaPoseMasterPath,
  isNanoProStandaloneQaModeEnabled,
} from './nano-pro-standalone-qa-mode';

export type NanoProStandaloneQaResolution = '2K' | '4K';

export type NanoProStandaloneQaCreateInput = {
  modelIdentityId: string;
  garmentImageUrl: string;
  poseId: string;
  outputResolution: NanoProStandaloneQaResolution;
  garmentId?: string | null;
  backImageUrl?: string | null;
  detailImageUrl?: string | null;
  persistToR2?: boolean;
};

export type NanoProStandaloneQaCreateResult = {
  ok: boolean;
  experimental: true;
  trialRunId: string;
  timestamp: string | null;
  model: string | null;
  poseId: string | null;
  modelIdentityId: string | null;
  garmentId: string | null;
  poseMasterPath: string | null;
  faceNeutralFilename: string | null;
  resolutionRequested: string | null;
  resolutionApplied: string | null;
  resolutionValid: boolean;
  resolutionMismatch: boolean;
  resolutionValidationError: string | null;
  outputDimensions: { width: number; height: number } | null;
  openRouterRequestId: string | null;
  durationMs: number | null;
  outputUrl: string | null;
  objectKey: string | null;
  imageUrl: string;
  creditsDeducted: number;
  gallery: boolean;
  createsRenderRow: boolean;
  cascade: boolean;
  nanoRegularInvoked: boolean;
  engine: string | null;
  error?: string;
};

/**
 * Run one Nano Pro standalone trial create from Studio Workflow fields.
 * Never calls POST /api/renders.
 */
export async function runNanoProStandaloneQaCreate(
  input: NanoProStandaloneQaCreateInput,
): Promise<NanoProStandaloneQaCreateResult> {
  if (!isNanoProStandaloneQaModeEnabled()) {
    throw new Error(
      'Nano Pro Standalone QA: client mode is disabled (set VITE_NANO_PRO_STANDALONE_QA=true in Vite DEV)',
    );
  }

  const poseId = input.poseId.trim();
  if (!poseId) {
    throw new Error('Nano Pro Standalone QA: poseId is required');
  }
  if (!input.modelIdentityId.trim()) {
    throw new Error('Nano Pro Standalone QA: modelIdentityId is required');
  }
  if (!input.garmentImageUrl.trim()) {
    throw new Error('Nano Pro Standalone QA: garmentImageUrl is required');
  }

  const requestUrl = apiUrl('/api/test/nano-pro-standalone-trial');
  const res = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      modelIdentityId: input.modelIdentityId,
      garmentImageUrl: input.garmentImageUrl,
      garmentId: input.garmentId ?? null,
      poseId,
      outputResolution: input.outputResolution === '4K' ? '4K' : '2K',
      persistToR2: Boolean(input.persistToR2),
    }),
  });

  const rawText = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Nano Pro Standalone QA: non-JSON response HTTP ${res.status}: ${rawText.slice(0, 400)}`,
    );
  }

  if (res.status === 403) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Nano Pro Standalone Trial is disabled on the API. Set EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED=true.',
    );
  }

  const images = Array.isArray(data.images) ? data.images : [];
  const firstImage = images[0] as { url?: string } | undefined;
  const imageUrl =
    (typeof firstImage?.url === 'string' && firstImage.url) ||
    (typeof data.outputUrl === 'string' && data.outputUrl) ||
    (typeof data.imageDataUri === 'string' && data.imageDataUri) ||
    null;

  if (!imageUrl) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : `Nano Pro Standalone QA failed (HTTP ${res.status}) — no image returned`,
    );
  }

  const dims =
    data.outputDimensions &&
    typeof data.outputDimensions === 'object' &&
    typeof (data.outputDimensions as { width?: unknown }).width === 'number' &&
    typeof (data.outputDimensions as { height?: unknown }).height === 'number'
      ? {
          width: (data.outputDimensions as { width: number }).width,
          height: (data.outputDimensions as { height: number }).height,
        }
      : null;

  return {
    ok: data.ok === true,
    experimental: true,
    trialRunId: typeof data.trialRunId === 'string' ? data.trialRunId : '(unknown)',
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : null,
    model: typeof data.model === 'string' ? data.model : null,
    poseId: typeof data.poseId === 'string' ? data.poseId : poseId,
    modelIdentityId:
      typeof data.modelIdentityId === 'string'
        ? data.modelIdentityId
        : input.modelIdentityId,
    garmentId:
      typeof data.garmentId === 'string'
        ? data.garmentId
        : input.garmentId ?? null,
    poseMasterPath:
      typeof data.poseMasterPath === 'string'
        ? data.poseMasterPath
        : buildNanoProStandaloneQaPoseMasterPath(poseId),
    faceNeutralFilename:
      typeof data.faceNeutralFilename === 'string'
        ? data.faceNeutralFilename
        : `${poseId}-face-neutral-backend.png`,
    resolutionRequested:
      typeof data.resolutionRequested === 'string'
        ? data.resolutionRequested
        : input.outputResolution,
    resolutionApplied:
      typeof data.resolutionApplied === 'string'
        ? data.resolutionApplied
        : input.outputResolution,
    resolutionValid: data.resolutionValid === true,
    resolutionMismatch: data.resolutionMismatch === true,
    resolutionValidationError:
      typeof data.resolutionValidationError === 'string'
        ? data.resolutionValidationError
        : null,
    outputDimensions: dims,
    openRouterRequestId:
      typeof data.openRouterRequestId === 'string'
        ? data.openRouterRequestId
        : null,
    durationMs: typeof data.durationMs === 'number' ? data.durationMs : null,
    outputUrl: typeof data.outputUrl === 'string' ? data.outputUrl : null,
    objectKey: typeof data.objectKey === 'string' ? data.objectKey : null,
    imageUrl,
    creditsDeducted:
      typeof data.creditsDeducted === 'number' ? data.creditsDeducted : 0,
    gallery: data.gallery === true,
    createsRenderRow: data.createsRenderRow === true,
    cascade: data.cascade === true,
    nanoRegularInvoked: data.nanoRegularInvoked === true,
    engine: typeof data.engine === 'string' ? data.engine : 'nano_pro',
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}
