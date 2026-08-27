/**
 * EXPERIMENTAL ONLY — Nano Pro Standalone Trial page.
 *
 * Local/dev QA surface. Not production Create.
 * Route: /experimental/nano-pro-standalone-trial
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

type TrialResponse = {
  ok?: boolean;
  error?: string;
  experimental?: boolean;
  experiment?: string;
  trialRunId?: string;
  timestamp?: string;
  model?: string;
  api?: string;
  engine?: string;
  cascade?: boolean;
  nanoRegularInvoked?: boolean;
  poseId?: string;
  modelIdentityId?: string | null;
  garmentId?: string | null;
  resolutionRequested?: string;
  resolutionApplied?: string;
  resolutionValid?: boolean;
  resolutionMismatch?: boolean;
  resolutionValidationError?: string | null;
  outputDimensions?: { width: number; height: number } | null;
  durationMs?: number;
  openRouterRequestId?: string | null;
  outputUrl?: string | null;
  objectKey?: string | null;
  poseMasterPath?: string;
  faceNeutralFilename?: string;
  creditsDeducted?: number;
  gallery?: boolean;
  createsRenderRow?: boolean;
  dryRun?: boolean;
  images?: Array<{ url: string; index: number; width?: number; height?: number }>;
  imageDataUri?: string | null;
  request?: Record<string, unknown>;
};

export default function NanoProStandaloneTrialPage() {
  if (!import.meta.env.DEV) {
    return (
      <main className="sl-page-section" style={{ padding: '3rem 1.5rem' }}>
        <p>Nano Pro Standalone Trial is available in local development builds only.</p>
        <Link href="/studio">Return to Studio</Link>
      </main>
    );
  }

  return <NanoProStandaloneTrialPageInner />;
}

function NanoProStandaloneTrialPageInner() {
  const { data: identities = [] } = useGetIdentities();
  const talents = useMemo(
    () =>
      (identities as ModelIdentity[]).filter((i) => isProductionModel(i.id)),
    [identities],
  );

  const [talentId, setTalentId] = useState('');
  const [garmentImageUrl, setGarmentImageUrl] = useState('');
  const [garmentId, setGarmentId] = useState('trial-garment');
  const [poseId, setPoseId] = useState('Pose50');
  const [outputResolution, setOutputResolution] = useState<'2K' | '4K'>('2K');
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
      const requestUrl = apiUrl('/api/test/nano-pro-standalone-trial');
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          modelIdentityId: talentId,
          garmentImageUrl,
          garmentId: garmentId.trim() || null,
          poseId,
          outputResolution,
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

      if (!res.ok && !data.images?.length && !data.dryRun) {
        setError(data.error ?? `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const outputSrc =
    result?.images?.[0]?.url ??
    result?.outputUrl ??
    result?.imageDataUri ??
    null;

  return (
    <main
      style={{
        maxWidth: 960,
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
        NANO PRO STANDALONE TRIAL · EXPERIMENTAL — NOT PRODUCTION
      </p>
      <h1 style={{ fontWeight: 400, fontSize: '2rem', margin: '0 0 0.5rem' }}>
        Nano Pro Standalone Trial
      </h1>
      <p style={{ marginTop: 0, color: '#555', lineHeight: 1.5 }}>
        Isolated Nano Pro–only generation for Studio Talent identity fidelity
        against face-neutral Pose Masters. Does not use Create, credits, Gallery,
        Nano Regular, or cascade.
      </p>
      <p style={{ fontSize: 13 }}>
        <Link href="/studio">← Studio Workspace (untouched)</Link>
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
          <span>Garment image URL or upload</span>
          <input
            type="url"
            placeholder="https://… or upload below"
            value={garmentImageUrl.startsWith('data:') ? '' : garmentImageUrl}
            onChange={(e) => setGarmentImageUrl(e.target.value)}
            style={{ padding: '0.55rem', fontSize: 15 }}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          {garmentImageUrl ? (
            <img
              src={garmentImageUrl}
              alt="Garment reference"
              style={{ maxWidth: 180, marginTop: 8 }}
            />
          ) : null}
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Garment ID (forensic label)</span>
          <input
            value={garmentId}
            onChange={(e) => setGarmentId(e.target.value)}
            style={{ padding: '0.55rem', fontSize: 15 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Faceless Pose Master (75)</span>
          <select
            value={poseId}
            onChange={(e) => setPoseId(e.target.value)}
            style={{ padding: '0.55rem', fontSize: 15 }}
          >
            {CANONICAL_POSE_ENTRIES.map((p) => (
              <option key={p.poseId} value={p.poseId}>
                {p.poseId} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset style={{ border: '1px solid #ddd', padding: '0.75rem 1rem' }}>
          <legend>Resolution</legend>
          <label style={{ marginRight: 16 }}>
            <input
              type="radio"
              checked={outputResolution === '2K'}
              onChange={() => setOutputResolution('2K')}
            />{' '}
            2K
          </label>
          <label>
            <input
              type="radio"
              checked={outputResolution === '4K'}
              onChange={() => setOutputResolution('4K')}
            />{' '}
            4K
          </label>
        </fieldset>

        <label>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
          />{' '}
          Dry run (build request only — no OpenRouter)
        </label>
        <label>
          <input
            type="checkbox"
            checked={persistToR2}
            onChange={(e) => setPersistToR2(e.target.checked)}
            disabled={dryRun}
          />{' '}
          Persist to R2 prefix trial/nano-pro/… (optional)
        </label>

        <button
          type="button"
          disabled={!canRun || pending}
          onClick={() => void handleGenerate()}
          style={{
            justifySelf: 'start',
            padding: '0.7rem 1.4rem',
            fontSize: 15,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: '#111',
            color: '#fafafa',
            border: 0,
            cursor: canRun && !pending ? 'pointer' : 'not-allowed',
            opacity: canRun && !pending ? 1 : 0.5,
          }}
        >
          {pending ? 'Generating…' : dryRun ? 'Dry run' : 'Generate (Nano Pro only)'}
        </button>
      </section>

      {error ? (
        <p role="alert" style={{ color: '#8a1c1c', marginTop: '1.5rem' }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ fontWeight: 400, fontSize: '1.25rem' }}>
            Forensic metadata
          </h2>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: '0.35rem 1rem',
              fontSize: 14,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            <dt>trialRunId</dt>
            <dd>
              {result.trialRunId ??
                (typeof result.request?.['trialRunId'] === 'string'
                  ? result.request['trialRunId']
                  : '—')}
            </dd>
            <dt>timestamp</dt>
            <dd>{result.timestamp ?? '—'}</dd>
            <dt>model</dt>
            <dd>{result.model ?? '—'}</dd>
            <dt>talent</dt>
            <dd>{result.modelIdentityId ?? talentId}</dd>
            <dt>garmentId</dt>
            <dd>{result.garmentId ?? garmentId}</dd>
            <dt>poseId</dt>
            <dd>{result.poseId ?? poseId}</dd>
            <dt>poseMaster</dt>
            <dd>{result.poseMasterPath ?? result.faceNeutralFilename ?? '—'}</dd>
            <dt>resolution</dt>
            <dd>
              {result.resolutionRequested ?? outputResolution}
              {result.resolutionMismatch ? ' · MISMATCH' : ''}
            </dd>
            <dt>dimensions</dt>
            <dd>
              {result.outputDimensions
                ? `${result.outputDimensions.width}×${result.outputDimensions.height}`
                : '—'}
            </dd>
            <dt>openRouterRequestId</dt>
            <dd>{result.openRouterRequestId ?? '—'}</dd>
            <dt>objectKey</dt>
            <dd>{result.objectKey ?? '—'}</dd>
            <dt>credits</dt>
            <dd>{result.creditsDeducted ?? 0}</dd>
            <dt>gallery / render row</dt>
            <dd>
              {String(result.gallery ?? false)} /{' '}
              {String(result.createsRenderRow ?? false)}
            </dd>
            <dt>cascade / nano regular</dt>
            <dd>
              {String(result.cascade ?? false)} /{' '}
              {String(result.nanoRegularInvoked ?? false)}
            </dd>
          </dl>

          {result.resolutionValidationError ? (
            <p role="alert" style={{ color: '#8a1c1c' }}>
              Resolution validation: {result.resolutionValidationError}
            </p>
          ) : null}

          {outputSrc ? (
            <div style={{ marginTop: '1.25rem' }}>
              <p style={{ marginBottom: 8 }}>Trial output</p>
              <img
                src={outputSrc}
                alt="Nano Pro standalone trial output"
                style={{ maxWidth: '100%', border: '1px solid #e5e5e5' }}
              />
            </div>
          ) : null}

          {result.dryRun && result.request ? (
            <pre
              style={{
                marginTop: '1rem',
                padding: '1rem',
                background: '#f6f6f4',
                overflow: 'auto',
                fontSize: 12,
              }}
            >
              {JSON.stringify(result.request, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
