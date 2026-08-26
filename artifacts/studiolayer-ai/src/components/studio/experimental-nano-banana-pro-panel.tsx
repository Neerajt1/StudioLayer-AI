/**
 * TEMPORARY / LOCAL-ONLY — Experimental Nano Banana Pro test panel.
 *
 * Visible only in Vite DEV builds. Does not replace Create / Generate.
 * Calls POST /api/test/nano-banana-pro-render (no Studio Credits).
 */

import { useState } from 'react';
import { apiUrl } from '@/lib/api-base-url';

const EXPERIMENTAL_POSE_ID = 'Pose50';
const EXPERIMENTAL_OUTPUT_RESOLUTION = '2K' as const;
const EXPERIMENTAL_ASPECT_RATIO = '4:5' as const;

type NanoBananaProTestResponse = {
  ok?: boolean;
  error?: string;
  experimental?: boolean;
  model?: string;
  provider?: string;
  api?: string;
  durationMs?: number;
  creditsDeducted?: number;
  promptUsed?: string;
  referenceOrder?: string[];
  aspectRatioRequested?: string;
  aspectRatioApplied?: string;
  resolutionRequested?: string;
  resolutionApplied?: string;
  outputDimensions?: { width: number; height: number };
  usage?: unknown;
  costUsd?: number | null;
  openRouterRequestId?: string | null;
  httpStatus?: number;
  responseBody?: string | null;
  poseIdUsed?: string;
  modelIdentityId?: string | null;
  images?: Array<{ url: string; index: number; width?: number; height?: number }>;
};

export interface ExperimentalNanoBananaProPanelProps {
  garmentImageUrl: string;
  talentId: string;
  talentImageUrl?: string;
  talentDisplayName?: string;
}

export function ExperimentalNanoBananaProPanel({
  garmentImageUrl,
  talentId,
  talentImageUrl,
  talentDisplayName,
}: ExperimentalNanoBananaProPanelProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NanoBananaProTestResponse | null>(null);

  if (!import.meta.env.DEV) return null;

  const canRun = Boolean(garmentImageUrl?.trim()) && Boolean(talentId?.trim());

  const handleTest = async () => {
    if (!canRun || pending) return;
    setPending(true);
    setError(null);
    setResult(null);

    try {
      const requestUrl = apiUrl('/api/test/nano-banana-pro-render');
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          garmentImageUrl,
          modelIdentityId: talentId,
          poseId: EXPERIMENTAL_POSE_ID,
          outputResolution: EXPERIMENTAL_OUTPUT_RESOLUTION,
        }),
      });

      const contentType = res.headers.get('content-type') ?? '(none)';
      const responseUrl = res.url || requestUrl;
      const rawText = await res.text();

      let data: NanoBananaProTestResponse;
      try {
        data = JSON.parse(rawText) as NanoBananaProTestResponse;
      } catch {
        const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 400);
        setError(
          [
            'Non-JSON response from Nano Banana Pro test route.',
            `HTTP ${res.status}`,
            `URL: ${responseUrl}`,
            `Content-Type: ${contentType}`,
            `Body: ${snippet || '(empty)'}`,
          ].join(' · '),
        );
        return;
      }

      if (!res.ok || data.ok === false) {
        setError(
          [
            data.error ?? `Request failed (HTTP ${res.status})`,
            `HTTP ${data.httpStatus ?? res.status}`,
            data.openRouterRequestId
              ? `OpenRouter request ID: ${data.openRouterRequestId}`
              : null,
            data.responseBody
              ? `Body: ${String(data.responseBody).slice(0, 400)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
        );
        setResult(data);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const previewUrl = result?.images?.[0]?.url;
  const dims =
    result?.outputDimensions ??
    (result?.images?.[0]?.width && result?.images?.[0]?.height
      ? {
          width: result.images[0].width,
          height: result.images[0].height,
        }
      : null);

  return (
    <div
      className="sl-experimental-nano-panel"
      data-testid="experimental-nano-banana-pro-panel"
    >
      <p className="sl-experimental-nano-eyebrow">EXPERIMENTAL · LOCAL ONLY</p>
      <p className="sl-experimental-nano-copy">
        Nano Banana Pro engine test (<code>google/gemini-3-pro-image</code>).
        Does not use Create / production Gemini. Does not deduct Studio Credits.
        Pose Master fixed to {EXPERIMENTAL_POSE_ID} ·{' '}
        {EXPERIMENTAL_OUTPUT_RESOLUTION} · {EXPERIMENTAL_ASPECT_RATIO}.
      </p>

      <dl className="sl-experimental-nano-meta">
        <div>
          <dt>Garment</dt>
          <dd>{garmentImageUrl ? 'Selected front upload' : 'Missing'}</dd>
        </div>
        <div>
          <dt>Talent</dt>
          <dd>{talentDisplayName || talentId || 'Missing'}</dd>
        </div>
        <div>
          <dt>Pose</dt>
          <dd>{EXPERIMENTAL_POSE_ID}</dd>
        </div>
      </dl>

      {(garmentImageUrl || talentImageUrl) && (
        <div className="sl-experimental-nano-thumbs">
          {garmentImageUrl ? (
            <img src={garmentImageUrl} alt="Selected garment" />
          ) : null}
          {talentImageUrl ? (
            <img src={talentImageUrl} alt="Selected talent" />
          ) : null}
          <img
            src={`/pose-references/${EXPERIMENTAL_POSE_ID}.png`}
            alt={`${EXPERIMENTAL_POSE_ID} Pose Master`}
          />
        </div>
      )}

      <button
        type="button"
        className="sl-experimental-nano-button"
        data-testid="button-test-nano-banana-pro"
        disabled={!canRun || pending}
        onClick={() => {
          void handleTest();
        }}
      >
        {pending ? 'TESTING NANO BANANA PRO…' : 'EXPERIMENTAL · NANO BANANA PRO'}
      </button>

      {!canRun && (
        <p className="sl-experimental-nano-hint">
          Select a garment upload and Studio Talent first.
        </p>
      )}

      {error && (
        <p className="sl-experimental-nano-error" role="alert">
          {error}
        </p>
      )}

      {result && !error && (
        <div className="sl-experimental-nano-result">
          <p className="sl-experimental-nano-result-title">Result</p>
          <ul className="sl-experimental-nano-result-list">
            <li>Model: {result.model ?? 'google/gemini-3-pro-image'}</li>
            <li>Provider: {result.provider ?? '—'}</li>
            <li>API: {result.api ?? '—'}</li>
            <li>
              Aspect: {result.aspectRatioApplied ?? EXPERIMENTAL_ASPECT_RATIO}
            </li>
            <li>
              Resolution requested:{' '}
              {result.resolutionRequested ?? EXPERIMENTAL_OUTPUT_RESOLUTION}
            </li>
            <li>
              Resolution applied:{' '}
              {result.resolutionApplied ?? EXPERIMENTAL_OUTPUT_RESOLUTION}
            </li>
            <li>
              Output dimensions:{' '}
              {dims ? `${dims.width}×${dims.height}` : '—'}
            </li>
            <li>Credits deducted: {result.creditsDeducted ?? 0}</li>
            <li>
              Cost:{' '}
              {result.costUsd != null ? `$${result.costUsd}` : '—'}
            </li>
            <li>
              OpenRouter request ID: {result.openRouterRequestId ?? '—'}
            </li>
            <li>HTTP status: {result.httpStatus ?? 200}</li>
            {result.durationMs != null && <li>Duration: {result.durationMs} ms</li>}
            {result.usage != null && (
              <li>
                Usage: <code>{JSON.stringify(result.usage)}</code>
              </li>
            )}
          </ul>
          {previewUrl && (
            <img
              className="sl-experimental-nano-output"
              src={previewUrl}
              alt="Nano Banana Pro experimental output"
            />
          )}
        </div>
      )}
    </div>
  );
}
