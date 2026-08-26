import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GalleryShoot } from './gallery-shoots.js';
import { stabilizeGalleryShoots } from './gallery-shoot-stability.js';

function shoot(
  partial: Partial<GalleryShoot> & Pick<GalleryShoot, 'id' | 'createdAt'>,
): GalleryShoot {
  return {
    rootId: partial.rootId ?? 1,
    generationType: partial.generationType ?? 'editorial',
    images: partial.images ?? [],
    sourceImageUrl: partial.sourceImageUrl ?? 'https://cdn.example/garment.jpg',
    studioCreditsUsed: partial.studioCreditsUsed ?? 0,
    refinementCount: partial.refinementCount ?? 0,
    imageCount: partial.imageCount ?? partial.images?.length ?? 0,
    ...partial,
  };
}

describe('stabilizeGalleryShoots — date ordering', () => {
  it('14. newest renders appear first after stabilization', () => {
    const older = shoot({
      id: 'session-old',
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      images: [{ id: 1, status: 'completed', outputImageUrl: 'a' } as never],
      imageCount: 1,
    });
    const newer = shoot({
      id: 'session-new',
      createdAt: new Date('2026-08-26T10:00:00.000Z'),
      images: [{ id: 2, status: 'completed', outputImageUrl: 'b' } as never],
      imageCount: 1,
    });

    const previous = [older, newer];
    const next = [newer, older];

    const stabilized = stabilizeGalleryShoots(previous, next);
    assert.deepEqual(
      stabilized.map((item) => item.id),
      ['session-new', 'session-old'],
    );
  });

  it('18. partial editorial retry session does not reorder unrelated shoots by stale grid order', () => {
    const projectA = shoot({
      id: 'session-a',
      createdAt: new Date('2026-08-25T12:00:00.000Z'),
      images: [{ id: 10, status: 'completed', outputImageUrl: 'a' } as never],
      imageCount: 1,
    });
    const projectB = shoot({
      id: 'session-b',
      createdAt: new Date('2026-08-24T12:00:00.000Z'),
      images: [{ id: 20, status: 'completed', outputImageUrl: 'b' } as never],
      imageCount: 1,
    });
    const retryB = shoot({
      id: 'session-b-retry',
      createdAt: new Date('2026-08-26T09:00:00.000Z'),
      images: [{ id: 21, status: 'completed', outputImageUrl: 'b2' } as never],
      imageCount: 1,
    });

    const previous = [projectA, projectB];
    const next = [retryB, projectA, projectB];

    const stabilized = stabilizeGalleryShoots(previous, next);
    assert.deepEqual(
      stabilized.map((item) => item.id),
      ['session-b-retry', 'session-a', 'session-b'],
    );
  });
});
