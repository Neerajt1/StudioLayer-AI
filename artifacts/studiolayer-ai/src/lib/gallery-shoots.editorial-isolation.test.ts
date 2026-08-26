import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGalleryShoots,
  displayRenderForRoot,
  isFailedGalleryRenderWithoutOutput,
  type GalleryShoot,
} from './gallery-shoots.js';

type TestRender = GalleryShoot['images'][number];

function render(
  partial: Partial<TestRender> & Pick<TestRender, 'id' | 'status'>,
): TestRender {
  return {
    id: partial.id,
    status: partial.status,
    sourceImageUrl: partial.sourceImageUrl ?? 'https://cdn.example/garment.jpg',
    outputImageUrl: partial.outputImageUrl ?? null,
    parentRenderId: partial.parentRenderId ?? null,
    generationType: partial.generationType ?? 'editorial',
    generationSessionId: partial.generationSessionId ?? 'session-editorial',
    createdAt: partial.createdAt ?? '2026-08-26T10:00:00.000Z',
    studioCreditsUsed: partial.studioCreditsUsed,
    refinementCount: partial.refinementCount,
    refinementType: partial.refinementType,
    assetType: partial.assetType,
    modelPersona: partial.modelPersona,
    locationEnvironment: partial.locationEnvironment,
  };
}

describe('Editorial Gallery isolation', () => {
  it('12. same user + same generationSessionId groups into one shoot', () => {
    const renders = [
      render({
        id: 1,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/1.png',
        generationSessionId: 'session-1',
      }),
      render({
        id: 2,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/2.png',
        generationSessionId: 'session-1',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 1);
    assert.equal(shoots[0]!.id, 'session-1');
    assert.deepEqual(
      shoots[0]!.images.map((image) => image.id),
      [1, 2],
    );
  });

  it('13. different generationSessionId values never merge into one shoot', () => {
    const renders = [
      render({
        id: 1,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/1.png',
        generationSessionId: 'session-a',
        createdAt: '2026-08-26T10:00:00.000Z',
      }),
      render({
        id: 2,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/2.png',
        generationSessionId: 'session-b',
        createdAt: '2026-08-26T09:00:00.000Z',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 2);
    assert.deepEqual(
      shoots.map((shoot) => shoot.id),
      ['session-a', 'session-b'],
    );
  });

  it('14. newest session shoots sort first by createdAt', () => {
    const renders = [
      render({
        id: 1,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/1.png',
        generationSessionId: 'older',
        createdAt: '2026-08-20T10:00:00.000Z',
      }),
      render({
        id: 2,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/2.png',
        generationSessionId: 'newer',
        createdAt: '2026-08-26T10:00:00.000Z',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.deepEqual(
      shoots.map((shoot) => shoot.id),
      ['newer', 'older'],
    );
  });

  it('15. failed renders are not shown as completed gallery images', () => {
    const failed = render({
      id: 2,
      status: 'failed',
      outputImageUrl: null,
      generationSessionId: 'session-partial',
    });
    assert.equal(isFailedGalleryRenderWithoutOutput(failed), true);
    assert.equal(displayRenderForRoot(2, [failed])?.status, 'failed');
    assert.equal(displayRenderForRoot(2, [failed])?.outputImageUrl, null);
  });

  it('16. processing roots never appear in Gallery shoots', () => {
    const renders = [
      render({
        id: 1,
        status: 'processing',
        outputImageUrl: null,
        generationSessionId: 'session-processing',
      }),
    ];
    assert.equal(buildGalleryShoots(renders).length, 0);
  });

  it('17. retry-generated rows stay in their own session shoot', () => {
    const renders = [
      render({
        id: 1,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/1.png',
        generationSessionId: 'attempt-1',
        createdAt: '2026-08-26T10:00:00.000Z',
      }),
      render({
        id: 2,
        status: 'failed',
        outputImageUrl: null,
        generationSessionId: 'attempt-1',
        createdAt: '2026-08-26T10:00:01.000Z',
      }),
      render({
        id: 3,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/3.png',
        generationSessionId: 'attempt-2-retry',
        createdAt: '2026-08-26T10:05:00.000Z',
      }),
      render({
        id: 4,
        status: 'failed',
        outputImageUrl: null,
        generationSessionId: 'attempt-2-retry',
        createdAt: '2026-08-26T10:05:01.000Z',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 2);
    assert.deepEqual(
      shoots.map((shoot) => shoot.id),
      ['attempt-2-retry', 'attempt-1'],
    );
    assert.deepEqual(
      shoots.find((shoot) => shoot.id === 'attempt-1')!.images.map((image) => image.id),
      [1, 2],
    );
    assert.deepEqual(
      shoots.find((shoot) => shoot.id === 'attempt-2-retry')!.images.map((image) => image.id),
      [3, 4],
    );
  });

  it('18. partial editorial does not merge unrelated sessions', () => {
    const renders = [
      render({
        id: 1,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/1.png',
        generationSessionId: 'session-partial',
      }),
      render({
        id: 2,
        status: 'failed',
        outputImageUrl: null,
        generationSessionId: 'session-partial',
      }),
      render({
        id: 3,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/3.png',
        generationSessionId: 'session-other',
        sourceImageUrl: 'https://cdn.example/other-garment.jpg',
      }),
      render({
        id: 4,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/4.png',
        generationSessionId: 'session-other',
        sourceImageUrl: 'https://cdn.example/other-garment.jpg',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 2);
    const partial = shoots.find((shoot) => shoot.id === 'session-partial');
    const other = shoots.find((shoot) => shoot.id === 'session-other');
    assert.deepEqual(partial!.images.map((image) => image.id), [1, 2]);
    assert.deepEqual(other!.images.map((image) => image.id), [3, 4]);
  });
});
