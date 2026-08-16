// ---------------------------------------------------------------------------
// Editorial download formats — Batch 21: download is always free
// Transparent PNG is produced by Remove Background, not paid download.
// ---------------------------------------------------------------------------

export type EditorialDownloadFormatId = 'original';

export interface EditorialDownloadFormat {
  id: EditorialDownloadFormatId;
  label: string;
  description: string;
  /** Studio Credits consumed; 0 = included. */
  creditCost: number;
  filenameSuffix: string;
}

export const EDITORIAL_DOWNLOAD_FORMATS: readonly EditorialDownloadFormat[] = [
  {
    id: 'original',
    label: 'Original Image',
    description: 'Download the image exactly as displayed. Always free.',
    creditCost: 0,
    filenameSuffix: 'hero',
  },
] as const;

export function editorialDownloadFormat(
  id: EditorialDownloadFormatId,
): EditorialDownloadFormat {
  const format = EDITORIAL_DOWNLOAD_FORMATS.find((entry) => entry.id === id);
  if (!format) {
    throw new Error(`Unknown download format: ${id}`);
  }
  return format;
}
