/**
 * LOCAL QA ONLY — Nano Pro Identity-First / Pose-Second Create intercept.
 *
 * When enabled (Vite DEV + VITE_NANO_PRO_IDENTITY_FIRST_QA=true), Studio Workspace
 * Create calls POST /api/test/nano-pro-identity-first-trial instead of POST /api/renders.
 *
 * Does NOT change production Create, pose library UI, credits, or Gallery.
 * Does NOT modify the single-shot Nano Pro standalone trial.
 */

import { apiUrl } from './api-base-url';
import {
  buildNanoProIdentityFirstQaPoseMasterPath,
  isNanoProIdentityFirstQaModeEnabled,
} from './nano-pro-identity-first-qa-mode';

export {
  NANO_PRO_IDENTITY_FIRST_QA_VITE_FLAG,
  buildNanoProIdentityFirstQaPoseMasterPath,
  isNanoProIdentityFirstQaModeEnabled,
} from './nano-pro-identity-first-qa-mode';

export type NanoProIdentityFirstQaResolution = '2K' | '4K';

export type NanoProIdentityFirstQaCreateInput = {
  modelIdentityId: string;
  garmentImageUrl: string;
  poseId: string;
  /** Initial experiment: use 2K. */
  outputResolution: NanoProIdentityFirstQaResolution;
  garmentId?: string | null;
  persistToR2?: boolean;
};

export type NanoProIdentityFirstQaStageSummary = {
  stageRunId: string | null;
  imageUrl: string | null;
  imageSha256_16: string | null;
  model: string | null;
  openRouterProvider: string | null;
  openRouterRequestId: string | null;
  resolution: string | null;
  resolutionValid: boolean;
  resolutionMismatch: boolean;
  outputDimensions: { width: number; height: number } | null;
  durationMs: number | null;
  requestContentSha256_16: string | null;
};

export type NanoProIdentityFirstQaCreateResult = {
  ok: boolean;
  experimental: true;
  architecture: 'identity-first-pose-second';
  trialRunId: string;
  stage1RunId: string | null;
  stage2RunId: string | null;
  timestamp: string | null;
  model: string | null;
  poseId: string | null;
  modelIdentityId: string | null;
  garmentId: string | null;
  poseMasterPath: string | null;
  faceNeutralFilename: string | null;
  resolutionRequested: string | null;
  resolutionApplied: string | null;
  durationMs: number | null;
  /** Stage 2 final image (primary). */
  imageUrl: string;
  stage1: NanoProIdentityFirstQaStageSummary;
  stage2: NanoProIdentityFirstQaStageSummary;
  creditsDeducted: number;
  gallery: boolean;
  createsRenderRow: boolean;
  cascade: boolean;
  nanoRegularInvoked: boolean;
  engine: string | null;
  packaging: string | null;
  error?: string;
};

function parseDims(raw: unknown): { width: number; height: number } | null {
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { width?: unknown }).width === 'number' &&
    typeof (raw as { height?: unknown }).height === 'number'
  ) {
    return {
      width: (raw as { width: number }).width,
      height: (raw as { height: number }).height,
    };
  }
  return null;
}

function parseStage(
  raw: unknown,
  fallbackShaKey?: 'imageSha256_16' | 'identityAnchorSha256_16',
): NanoProIdentityFirstQaStageSummary {
  if (!raw || typeof raw !== 'object') {
    return {
      stageRunId: null,
      imageUrl: null,
      imageSha256_16: null,
      model: null,
      openRouterProvider: null,
      openRouterRequestId: null,
      resolution: null,
      resolutionValid: false,
      resolutionMismatch: false,
      outputDimensions: null,
      durationMs: null,
      requestContentSha256_16: null,
    };
  }
  const s = raw as Record<string, unknown>;
  const images = Array.isArray(s.images) ? s.images : [];
  const first = images[0] as { url?: string } | undefined;
  const imageUrl =
    (typeof first?.url === 'string' && first.url) ||
    (typeof s.outputUrl === 'string' && s.outputUrl) ||
    (typeof s.imageDataUri === 'string' && s.imageDataUri) ||
    null;

  const forensics =
    s.forensics && typeof s.forensics === 'object'
      ? (s.forensics as Record<string, unknown>)
      : null;

  return {
    stageRunId: typeof s.stageRunId === 'string' ? s.stageRunId : null,
    imageUrl,
    imageSha256_16:
      typeof s.imageSha256_16 === 'string'
        ? s.imageSha256_16
        : fallbackShaKey && typeof s[fallbackShaKey] === 'string'
          ? (s[fallbackShaKey] as string)
          : null,
    model: typeof s.model === 'string' ? s.model : null,
    openRouterProvider:
      typeof s.openRouterProvider === 'string' ? s.openRouterProvider : null,
    openRouterRequestId:
      typeof s.openRouterRequestId === 'string' ? s.openRouterRequestId : null,
    resolution:
      typeof s.resolution === 'string'
        ? s.resolution
        : typeof s.resolutionApplied === 'string'
          ? s.resolutionApplied
          : null,
    resolutionValid: s.resolutionValid === true,
    resolutionMismatch: s.resolutionMismatch === true,
    outputDimensions: parseDims(s.outputDimensions),
    durationMs: typeof s.durationMs === 'number' ? s.durationMs : null,
    requestContentSha256_16:
      typeof s.requestContentSha256_16 === 'string'
        ? s.requestContentSha256_16
        : typeof forensics?.requestContentSha256_16 === 'string'
          ? forensics.requestContentSha256_16
          : null,
  };
}

/**
 * Run identity-first two-stage trial from Studio Workflow fields.
 * Never calls POST /api/renders.
 */
export async function runNanoProIdentityFirstQaCreate(
  input: NanoProIdentityFirstQaCreateInput,
): Promise<NanoProIdentityFirstQaCreateResult> {
  if (!isNanoProIdentityFirstQaModeEnabled()) {
    throw new Error(
      'Nano Pro Identity-First QA: client mode is disabled (set VITE_NANO_PRO_IDENTITY_FIRST_QA=true in Vite DEV)',
    );
  }

  const poseId = input.poseId.trim();
  if (!poseId) {
    throw new Error('Nano Pro Identity-First QA: poseId is required');
  }
  if (!input.modelIdentityId.trim()) {
    throw new Error('Nano Pro Identity-First QA: modelIdentityId is required');
  }
  if (!input.garmentImageUrl.trim()) {
    throw new Error('Nano Pro Identity-First QA: garmentImageUrl is required');
  }

  const requestUrl = apiUrl('/api/test/nano-pro-identity-first-trial');
  const res = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      modelIdentityId: input.modelIdentityId,
      garmentImageUrl: input.garmentImageUrl,
      garmentId: input.garmentId ?? null,
      poseId,
      // Initial experiment: force 2K from client.
      outputResolution: '2K',
      persistToR2: Boolean(input.persistToR2),
    }),
  });

  const rawText = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Nano Pro Identity-First QA: non-JSON response HTTP ${res.status}: ${rawText.slice(0, 400)}`,
    );
  }

  if (res.status === 403) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Nano Pro Identity-First Trial is disabled on the API.',
    );
  }

  const stage1 = parseStage(data.stage1);
  const stage2 = parseStage(data.stage2);

  // Stage 2 failure may still return Stage 1 for inspection.
  if (data.stageFailed === 2 && stage1.imageUrl) {
    return {
      ok: false,
      experimental: true,
      architecture: 'identity-first-pose-second',
      trialRunId: typeof data.trialRunId === 'string' ? data.trialRunId : '(unknown)',
      stage1RunId:
        typeof data.stage1RunId === 'string'
          ? data.stage1RunId
          : stage1.stageRunId,
      stage2RunId:
        typeof data.stage2RunId === 'string' ? data.stage2RunId : null,
      timestamp: typeof data.timestamp === 'string' ? data.timestamp : null,
      model: typeof data.model === 'string' ? data.model : stage1.model,
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
          : buildNanoProIdentityFirstQaPoseMasterPath(poseId),
      faceNeutralFilename:
        typeof data.faceNeutralFilename === 'string'
          ? data.faceNeutralFilename
          : `${poseId}-face-neutral-backend.png`,
      resolutionRequested: '2K',
      resolutionApplied: stage1.resolution,
      durationMs: stage1.durationMs,
      imageUrl: stage1.imageUrl,
      stage1,
      stage2,
      creditsDeducted: 0,
      gallery: false,
      createsRenderRow: false,
      cascade: false,
      nanoRegularInvoked: false,
      engine: 'nano_pro',
      packaging: typeof data.packaging === 'string' ? data.packaging : null,
      error:
        typeof data.error === 'string'
          ? data.error
          : 'Stage 2 failed — Stage 1 identity anchor is shown for inspection',
    };
  }

  const imageUrl =
    stage2.imageUrl ||
    (typeof data.outputUrl === 'string' && data.outputUrl) ||
    (typeof data.imageDataUri === 'string' && data.imageDataUri) ||
    null;

  if (!imageUrl) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : `Nano Pro Identity-First QA failed (HTTP ${res.status}) — no Stage 2 image returned`,
    );
  }

  return {
    ok: data.ok === true,
    experimental: true,
    architecture: 'identity-first-pose-second',
    trialRunId: typeof data.trialRunId === 'string' ? data.trialRunId : '(unknown)',
    stage1RunId:
      typeof data.stage1RunId === 'string'
        ? data.stage1RunId
        : stage1.stageRunId,
    stage2RunId:
      typeof data.stage2RunId === 'string'
        ? data.stage2RunId
        : stage2.stageRunId,
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : null,
    model: typeof data.model === 'string' ? data.model : stage2.model,
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
        : buildNanoProIdentityFirstQaPoseMasterPath(poseId),
    faceNeutralFilename:
      typeof data.faceNeutralFilename === 'string'
        ? data.faceNeutralFilename
        : `${poseId}-face-neutral-backend.png`,
    resolutionRequested:
      typeof data.resolutionRequested === 'string'
        ? data.resolutionRequested
        : '2K',
    resolutionApplied:
      typeof data.resolutionApplied === 'string'
        ? data.resolutionApplied
        : '2K',
    durationMs: typeof data.durationMs === 'number' ? data.durationMs : null,
    imageUrl,
    stage1,
    stage2: {
      ...stage2,
      imageUrl,
      imageSha256_16:
        stage2.imageSha256_16 ??
        (typeof (data.stage2 as { imageSha256_16?: string } | undefined)
          ?.imageSha256_16 === 'string'
          ? (data.stage2 as { imageSha256_16: string }).imageSha256_16
          : null),
    },
    creditsDeducted:
      typeof data.creditsDeducted === 'number' ? data.creditsDeducted : 0,
    gallery: data.gallery === true,
    createsRenderRow: data.createsRenderRow === true,
    cascade: data.cascade === true,
    nanoRegularInvoked: data.nanoRegularInvoked === true,
    engine: typeof data.engine === 'string' ? data.engine : 'nano_pro',
    packaging: typeof data.packaging === 'string' ? data.packaging : null,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}
