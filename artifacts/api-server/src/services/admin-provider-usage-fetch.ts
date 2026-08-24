const DEFAULT_TIMEOUT_MS = 15_000;

export async function providerFetch(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readProviderJson<T>(
  response: Response,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const status = response.status;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body != null &&
      "error" in body &&
      typeof (body as { error?: unknown }).error === "object" &&
      (body as { error?: { message?: unknown } }).error?.message != null
        ? String((body as { error?: { message?: unknown } }).error?.message)
        : typeof body === "object" &&
            body != null &&
            "message" in body &&
            typeof (body as { message?: unknown }).message === "string"
          ? String((body as { message?: unknown }).message)
          : `HTTP ${status}`;
    return { ok: false, status, message };
  }

  return { ok: true, data: body as T };
}
