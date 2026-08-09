/** Convert catalog pose name to stable illustration filename slug. */
export function poseNameToSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u2013\u2014]/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function poseSlugToUrl(slug: string): string {
  return `/pose-references/${slug}.png`;
}
