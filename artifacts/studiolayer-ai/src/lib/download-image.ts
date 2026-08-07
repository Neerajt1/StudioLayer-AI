// ---------------------------------------------------------------------------
// Editorial image download — authenticated API proxy + R2 public URL fallbacks
// ---------------------------------------------------------------------------

const REVOKE_OBJECT_URL_MS = 60_000;
const DOWNLOAD_DEBUG = import.meta.env.DEV;

export class InsufficientStudioCreditsError extends Error {
  readonly code = 'INSUFFICIENT_STUDIO_CREDITS';

  constructor(message = 'Insufficient Studio Credits.') {
    super(message);
    this.name = 'InsufficientStudioCreditsError';
  }
}

export interface ImageDownloadOptions {
  renderId?: number;
  filenameBase?: string;
}

function logDownload(step: string, detail?: unknown): void {
  if (!DOWNLOAD_DEBUG) return;
  console.debug('[download-image]', step, detail);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function extensionFromUrl(url: string): string {
  const path = url.split('?')[0] ?? '';
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'png' || ext === 'webp' || ext === 'jpg' || ext === 'jpeg') {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'png';
}

function extensionForImageBlob(blob: Blob, url: string): string {
  if (blob.type === 'image/png') return 'png';
  if (blob.type === 'image/webp') return 'webp';
  if (blob.type === 'image/jpeg') return 'jpg';
  return extensionFromUrl(url);
}

/** studiolayer-hero-YYYYMMDD-HHMMSS.{ext} */
export function buildHeroDownloadFilename(url: string, blob?: Blob): string {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    '-',
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join('');
  const ext = blob ? extensionForImageBlob(blob, url) : extensionFromUrl(url);
  return `studiolayer-hero-${timestamp}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_OBJECT_URL_MS);
}

export function parseRenderIdFromOutputUrl(url: string): number | null {
  const match = url.match(/\/renders\/(\d+)\//);
  if (!match) return null;
  const id = Number.parseInt(match[1]!, 10);
  return Number.isNaN(id) ? null : id;
}

async function fetchTransparentBlobViaApiProxy(
  renderId: number,
): Promise<{ blob: Blob; creditsUsed: boolean }> {
  logDownload('transparent-api-proxy:start', { renderId });
  const response = await fetch(`/api/renders/${renderId}/download/transparent`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 403) {
    let code: string | undefined;
    try {
      const body = (await response.json()) as { code?: string; error?: string };
      code = body.code;
      if (code === 'INSUFFICIENT_STUDIO_CREDITS') {
        throw new InsufficientStudioCreditsError(body.error);
      }
    } catch (error) {
      if (error instanceof InsufficientStudioCreditsError) throw error;
    }
  }

  if (!response.ok) {
    throw new Error(`Transparent download failed: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const creditsUsed = response.headers.get('X-Studio-Credits-Used') === '1';
  logDownload('transparent-api-proxy:complete', {
    renderId,
    status: response.status,
    contentType: response.headers.get('content-type'),
    size: blob.size,
    creditsUsed,
  });
  return { blob, creditsUsed };
}

async function fetchImageBlobViaApiProxy(renderId: number): Promise<Blob> {
  logDownload('api-proxy:start', { renderId });
  const response = await fetch(`/api/renders/${renderId}/download`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  logDownload('api-proxy:complete', {
    renderId,
    status: response.status,
    contentType: response.headers.get('content-type'),
    size: blob.size,
  });
  return blob;
}

async function fetchImageBlobViaFetch(url: string): Promise<Blob> {
  logDownload('direct-fetch:start', { url });
  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  logDownload('direct-fetch:complete', {
    url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    size: blob.size,
  });
  return blob;
}

async function fetchImageBlobViaXHR(url: string): Promise<Blob> {
  logDownload('xhr:start', { url });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
        logDownload('xhr:complete', { url, status: xhr.status, size: xhr.response.size });
        resolve(xhr.response);
        return;
      }
      reject(new Error(`Download failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Download failed: network error'));
    xhr.send();
  });
}

function mimeTypeForExtension(ext: string): string {
  switch (ext) {
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function loadImageBlobViaCanvas(url: string): Promise<Blob> {
  logDownload('canvas:start', { url });
  const ext = extensionFromUrl(url);
  const mimeType = mimeTypeForExtension(ext);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Image export failed'));
            return;
          }
          logDownload('canvas:complete', { url, size: blob.size });
          resolve(blob);
        },
        mimeType,
        mimeType === 'image/jpeg' ? 0.98 : undefined,
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

async function resolveImageBlob(url: string, renderId?: number): Promise<Blob> {
  const resolvedRenderId = renderId ?? parseRenderIdFromOutputUrl(url);
  const errors: unknown[] = [];

  if (resolvedRenderId != null) {
    try {
      const blob = await fetchImageBlobViaApiProxy(resolvedRenderId);
      if (blob.size > 0) return blob;
      errors.push(new Error('Empty image response from API proxy'));
    } catch (error) {
      errors.push(error);
    }
  }

  for (const attempt of [
    () => fetchImageBlobViaFetch(url),
    () => fetchImageBlobViaXHR(url),
    () => loadImageBlobViaCanvas(url),
  ]) {
    try {
      const blob = await attempt();
      if (blob.size > 0) return blob;
      errors.push(new Error('Empty image response'));
    } catch (error) {
      errors.push(error);
    }
  }

  logDownload('failed', { url, renderId: resolvedRenderId, errors });
  throw errors[errors.length - 1] ?? new Error('Download failed');
}

/** Fetches the editorial image bytes for ZIP bundling or custom save flows. */
export async function fetchEditorialImageBlob(
  url: string,
  renderId?: number,
): Promise<Blob> {
  return resolveImageBlob(url, renderId);
}

/** Triggers the OS save dialog for a remote editorial image URL. */
export async function triggerImageDownload(
  url: string,
  options?: ImageDownloadOptions,
): Promise<void> {
  logDownload('trigger', { url, renderId: options?.renderId });
  const blob = await resolveImageBlob(url, options?.renderId);
  const filename = options?.filenameBase
    ? `${options.filenameBase.replace(/\.(png|jpe?g|webp)$/i, '')}.${extensionForImageBlob(blob, url)}`
    : buildHeroDownloadFilename(url, blob);
  downloadBlob(blob, filename);
}

/** Triggers a transparent-background PNG download (free — no Studio Credits). */
export async function triggerTransparentDownload(
  renderId: number,
  options?: Pick<ImageDownloadOptions, 'filenameBase'>,
): Promise<{ creditsUsed: boolean }> {
  logDownload('trigger-transparent', { renderId });
  const { blob, creditsUsed } = await fetchTransparentBlobViaApiProxy(renderId);
  const filename = options?.filenameBase
    ? `${options.filenameBase.replace(/\.(png|jpe?g|webp)$/i, '')}.png`
    : `studiolayer-transparent-${renderId}.png`;
  downloadBlob(blob, filename);
  return { creditsUsed };
}
