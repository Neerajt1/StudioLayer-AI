/**
 * EXPERIMENTAL ONLY — Nano Pro Identity-First / Pose-Second Trial page.
 *
 * Local/dev QA surface. Not production Create.
 * Route: /experimental/nano-pro-identity-first-trial
 * DEV builds only.
 */

import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useGetIdentities } from '@workspace/api-client-react';
import { apiUrl } from '@/lib/api-base-url';
import { CANONICAL_POSE_ENTRIES } from '@/lib/pose-library-display';
import {
  isProductionModel,
  type ModelIdentity,
} from '@/components/studio/talent/types';

type StagePayload = {
  stageRunId?: string;
  imageDataUri?: string | null;
  outputUrl?: string | null;
  images?: Array<{ url: string }>;
  imageSha256_16?: string;
  model?: string;
  openRouterProvider?: string | null;
  openRouterRequestId?: string | null;
  resolution?: string;
  resolutionValid?: boolean;
  resolutionMismatch?: boolean;
  outputDimensions?: { width: number; height: number } | null;
  durationMs?: number;
  requestContentSha256_16?: string;
  forensics?: { requestContentSha256_16?: string };
};

type TrialResponse = {
  ok?: boolean;
  error?: string;
  dryRun?: boolean;
  experimental?: boolean;
  experiment?: string;
  architecture?: string;
  trialRunId?: string;
  stage1RunId?: string;
  stage2RunId?: string;
  timestamp?: string;
  model?: string;
  cascade?: boolean;
  nanoRegularInvoked?: boolean;
  poseId?: string;
  modelIdentityId?: string | null;
  resolutionRequested?: string;
  resolutionApplied?: string;
  durationMs?: number;
  poseMasterPath?: string;
  faceNeutralFilename?: string;
  creditsDeducted?: number;
  gallery?: boolean;
  createsRenderRow?: boolean;
  packaging?: string;
  stage1?: StagePayload;
  stage2?: StagePayload;
  stageFailed?: number;
};

function stageImageSrc(stage?: StagePayload | null): string | null {
  if (!stage) return null;
  return (
    stage.images?.[0]?.url ??
    stage.outputUrl ??
    stage.imageDataUri ??
    null
  );
}

export default function NanoProIdentityFirstTrialPage() {
  if (!import.meta.env.DEV) {
    return (
      <main className="sl-page-section" style={{ padding: '3rem 1.5rem' }}>
        <p>Nano Pro Identity-First Trial is available in local development builds only.</p>
        <Link href="/studio">Return to Studio</Link>
      </main>
    );
  }

  return <NanoProIdentityFirstTrialPageInner />;
}

function NanoProIdentityFirstTrialPageInner() {
  const { data: identities = [] } = useGetIdentities();
  const talents = useMemo(
    () =>
      (identities as ModelIdentity[]).filter((i) => isProductionModel(i.id)),
    [identities],
  );

  const [talentId, setTalentId] = useState('');
  const [garmentImageUrl, setGarmentImageUrl] = useState('');
  const [garmentId, setGarmentId] = useState('trial-garment');
  const [poseId, setPoseId] = useState('Pose37');
  const [dryRun, setDryRun] = useState(false);
  const [persistToR2, setPersistToR2] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrialResponse | null>(null);

  const canRun = Boolean(talentId.trim()) && Boolean(garmentImageUrl.trim());

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setGarmentImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!canRun || pending) return;
    setPending(true);
    setError(null);
    setResult(null);

    try {
      const requestUrl = apiUrl('/api/test/nano-pro-identity-first-trial');
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          modelIdentityId: talentId,
          garmentImageUrl,
          garmentId: garmentId.trim() || null,
          poseId,
          outputResolution: '2K',
          dryRun,
          persistToR2,
        }),
      });

      const rawText = await res.text();
      let data: TrialResponse;
      try {
        data = JSON.parse(rawText) as TrialResponse;
      } catch {
        setError(
          `Non-JSON response HTTP ${res.status}: ${rawText.slice(0, 400)}`,
        );
        return;
      }

      if (!res.ok && !data.stage1 && !data.dryRun) {
        setError(data.error ?? `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const stage1Src = stageImageSrc(result?.stage1);
  const stage2Src = stageImageSrc(result?.stage2);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '2.5rem 1.25rem 4rem',
        fontFamily: 'Georgia, "Times New Roman", serif',
        color: '#1a1a1a',
      }}
    >
      <p
        style={{
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontSize: 11,
          color: '#8a1c1c',
          marginBottom: 8,
        }}
      >
        NANO PRO IDENTITY-FIRST TRIAL · EXPERIMENTAL — NOT PRODUCTION
      </p>
      <h1 style={{ fontWeight: 400, fontSize: '2rem', margin: '0 0 0.5rem' }}>
        Identity-First / Pose-Second
      </h1>
      <p style={{ marginTop: 0, color: '#555', lineHeight: 1.5 }}>
        Stage 1 establishes Studio Talent as a full-body identity anchor (no
        pose, no garment). Stage 2 applies garment + face-neutral Pose Master.
        Nano Pro only — no Nano Regular, cascade, credits, or Gallery.
      </p>
      <p style={{ fontSize: 13 }}>
        <Link href="/studio">← Studio Workspace</Link>
        {' · '}
        <Link href="/experimental/nano-pro-standalone-trial">
          Single-shot standalone trial
        </Link>
      </p>

      <section style={{ marginTop: '2rem', display: 'grid', gap: '1rem' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Studio Talent</span>
          <select
            value={talentId}
            onChange={(e) => setTalentId(e.target.value)}
            style={{ padding: '0.55rem', fontSize: 15 }}
          >
            <option value="">Select talent…</option>
            {talents.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}
                {t.displayName ? ` — ${t.displayName}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Garment Front (Stage 2 only)</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>garmentId (forensics)</span>
          <input
            value={garmentId}
            onChange={(e) => setGarmentId(e.target.value)}
            style={{ padding: '0.55rem', fontSize: 15 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Pose (UI library — backend maps to face-neutral)</span>
          <select
            value={poseId}
            onChange={(e) => setPoseId(e.target.value)}
            style={{ padding: '0.55rem', fontSize: 15 }}
          >
            {CANONICAL_POSE_ENTRIES.map((p) => (
              <option key={p.poseId} value={p.poseId}>
                {p.poseId}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
          />
          Dry run (no OpenRouter call)
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={persistToR2}
            onChange={(e) => setPersistToR2(e.target.checked)}
          />
          Persist to trial/nano-pro/ R2 (optional)
        </label>

        <button
          type="button"
          disabled={!canRun || pending}
          onClick={() => void handleGenerate()}
          style={{
            padding: '0.75rem 1.25rem',
            fontSize: 15,
            cursor: canRun && !pending ? 'pointer' : 'not-allowed',
            opacity: canRun && !pending ? 1 : 0.5,
          }}
        >
          {pending ? 'Running Stage 1 → Stage 2…' : 'Run Identity-First Trial (2K)'}
        </button>
      </section>

      {error ? (
        <p style={{ color: '#8a1c1c', marginTop: '1.5rem' }}>{error}</p>
      ) : null}

      {result ? (
        <section style={{ marginTop: '2.5rem' }}>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr',
              gap: '0.35rem 1rem',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
            }}
          >
            <dt>trialRunId</dt>
            <dd>{result.trialRunId ?? '—'}</dd>
            <dt>stage1RunId / stage2RunId</dt>
            <dd>
              {result.stage1RunId ?? result.stage1?.stageRunId ?? '—'} /{' '}
              {result.stage2RunId ?? result.stage2?.stageRunId ?? '—'}
            </dd>
            <dt>pose / pose master</dt>
            <dd>
              {result.poseId ?? poseId} / {result.poseMasterPath ?? '—'}
            </dd>
            <dt>model / packaging</dt>
            <dd>
              {result.model ?? '—'} / {result.packaging ?? '—'}
            </dd>
            <dt>cascade / nano regular</dt>
            <dd>
              {String(result.cascade)} / {String(result.nanoRegularInvoked)}
            </dd>
            <dt>credits / gallery / render row</dt>
            <dd>
              {result.creditsDeducted ?? 0} / {String(result.gallery)} /{' '}
              {String(result.createsRenderRow)}
            </dd>
            {result.error ? (
              <>
                <dt>error</dt>
                <dd style={{ color: '#8a1c1c' }}>{result.error}</dd>
              </>
            ) : null}
          </dl>

          {result.dryRun ? (
            <pre
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: '#f6f6f6',
                fontSize: 11,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(
                { stage1: result.stage1, stage2: result.stage2 },
                null,
                2,
              )}
            </pre>
          ) : (
            <div
              style={{
                marginTop: '1.75rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1.5rem',
              }}
            >
              <figure style={{ margin: 0 }}>
                <figcaption
                  style={{
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontSize: 11,
                    marginBottom: 8,
                    color: '#555',
                  }}
                >
                  STAGE 1 — IDENTITY ANCHOR
                </figcaption>
                {stage1Src ? (
                  <img
                    src={stage1Src}
                    alt="Stage 1 identity anchor"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                ) : (
                  <p style={{ color: '#888' }}>No Stage 1 image</p>
                )}
                <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                  hash: {result.stage1?.imageSha256_16 ?? '—'}
                  <br />
                  provider: {result.stage1?.openRouterProvider ?? '—'}
                </p>
              </figure>

              <figure style={{ margin: 0 }}>
                <figcaption
                  style={{
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontSize: 11,
                    marginBottom: 8,
                    color: '#555',
                  }}
                >
                  STAGE 2 — FINAL POSE RESULT
                </figcaption>
                {stage2Src ? (
                  <img
                    src={stage2Src}
                    alt="Stage 2 final pose result"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                ) : (
                  <p style={{ color: '#888' }}>
                    No Stage 2 image
                    {result.stageFailed === 2 ? ' (Stage 2 failed)' : ''}
                  </p>
                )}
                <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                  request hash:{' '}
                  {result.stage2?.requestContentSha256_16 ??
                    result.stage2?.forensics?.requestContentSha256_16 ??
                    '—'}
                  <br />
                  provider: {result.stage2?.openRouterProvider ?? '—'}
                </p>
              </figure>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
