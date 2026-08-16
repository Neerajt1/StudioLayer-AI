/**
 * Gallery card image URL — preview when available, otherwise full-resolution original.
 * View / Edit / Download must NOT use this helper.
 */

/**
 * Runtime preview URL from GET /renders (serializeRender).
 * Not on the generated OpenAPI `Render` type — read without widening that type.
 */
export function readPreviewImageUrlFromApiRender(render: object): string | null {
  if (!('previewImageUrl' in render)) return null;
  const value = Reflect.get(render, 'previewImageUrl');
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

export function resolveGalleryCardImageUrl(render: {
  previewImageUrl?: string | null;
  outputImageUrl?: string | null;
}): string | null {
  const preview = render.previewImageUrl;
  if (typeof preview === 'string' && preview.length > 0) {
    return preview;
  }

  const original = render.outputImageUrl;
  if (typeof original === 'string' && original.length > 0) {
    return original;
  }

  return null;
}
