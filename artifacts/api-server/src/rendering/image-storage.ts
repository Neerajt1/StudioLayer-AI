// ---------------------------------------------------------------------------
// StudioLayer AI — Image Storage Utility
//
// Uploads a base64 data-URI (e.g. from OpenRouter image-generation) to
// fal.ai's CDN and returns a persistent, publicly-accessible HTTPS URL.
//
// Why fal.ai storage:
//   The fal client is already authenticated via FAL_KEY (used for BirefNet
//   and FASHN).  Uploading through the same client avoids setting up a
//   separate GCS presigned-URL flow for server-side uploads and returns a
//   stable HTTPS URL suitable for storing in the renders table.
//
// Usage:
//   const url = await uploadBase64Image("data:image/png;base64,iVBOR...");
//   // → "https://fal.media/files/..."
// ---------------------------------------------------------------------------

import { fal } from "@fal-ai/client";
import { logger } from "../lib/logger";

fal.config({ credentials: process.env["FAL_KEY"] });

/**
 * Uploads a base64 data-URI to fal.ai storage.
 *
 * @param dataUri  A string of the form "data:<mime>;base64,<data>".
 *                 If the string is already an https:// URL (e.g. the provider
 *                 already returned a hosted URL) it is returned unchanged.
 * @param renderId Optional render ID for log correlation.
 * @returns        A persistent HTTPS URL pointing to the stored image.
 */
export async function uploadBase64Image(
  dataUri: string,
  renderId?: number,
): Promise<string> {
  // Already a hosted URL — nothing to do.
  if (dataUri.startsWith("http")) {
    return dataUri;
  }

  const t0 = Date.now();

  // Parse data URI: "data:<mime>;base64,<data>"
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx === -1) {
    throw new Error("image-storage: malformed data-URI — missing comma separator");
  }

  const header   = dataUri.slice(0, commaIdx);     // "data:image/png;base64"
  const b64data  = dataUri.slice(commaIdx + 1);    // "<base64 data>"

  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType  = mimeMatch?.[1] ?? "image/png";

  const buffer = Buffer.from(b64data, "base64");
  const blob   = new Blob([buffer], { type: mimeType });

  logger.info(
    { renderId, mimeType, sizeBytes: buffer.length },
    "image-storage: uploading generated image to fal CDN",
  );

  const url = await fal.storage.upload(blob);

  logger.info(
    { renderId, url, durationMs: Date.now() - t0 },
    "image-storage: upload complete",
  );

  return url;
}
