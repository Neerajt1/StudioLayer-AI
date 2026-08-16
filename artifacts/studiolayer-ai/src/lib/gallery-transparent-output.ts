// ---------------------------------------------------------------------------
// Gallery — detect Remove Background child renders (transparent PNG output)
// ---------------------------------------------------------------------------

/** True when a render row is a completed Remove Background derivative. */
export function isBackgroundRemovedRender(render: {
  refinementType?: string | null;
  assetType?: string | null;
  outputImageUrl?: string | null;
}): boolean {
  if (render.refinementType === 'remove_background') return true;
  if (render.assetType === 'background_removed') return true;

  const path = render.outputImageUrl?.split('?')[0] ?? '';
  return /\/transparent-[a-f0-9-]+\.png$/i.test(path);
}
