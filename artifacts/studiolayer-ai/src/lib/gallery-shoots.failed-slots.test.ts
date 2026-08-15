import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGalleryShoots,
  displayRenderForRoot,
  isFailedGalleryRenderWithoutOutput,
  tipRenderForRoot,
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
    generationType: partial.generationType ?? 'campaign',
    generationSessionId: partial.generationSessionId ?? 'session-1',
    createdAt: partial.createdAt ?? '2026-08-15T10:00:00.000Z',
    studioCreditsUsed: partial.studioCreditsUsed,
    refinementCount: partial.refinementCount,
    modelPersona: partial.modelPersona,
    locationEnvironment: partial.locationEnvironment,
  };
}

describe('isFailedGalleryRenderWithoutOutput', () => {
  it('is true only for failed status without output', () => {
    assert.equal(
      isFailedGalleryRenderWithoutOutput({ status: 'failed', outputImageUrl: null }),
      true,
    );
    assert.equal(
      isFailedGalleryRenderWithoutOutput({
        status: 'failed',
        outputImageUrl: 'https://cdn.example/out.png',
      }),
      false,
    );
    assert.equal(
      isFailedGalleryRenderWithoutOutput({ status: 'completed', outputImageUrl: null }),
      false,
    );
  });
});

describe('displayRenderForRoot / buildGalleryShoots failed slots', () => {
  it('keeps successful tips unchanged when a sibling root failed', () => {
    const renders = [
      render({
        id: 1,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/1.png',
        generationType: 'campaign',
      }),
      render({
        id: 2,
        status: 'failed',
        outputImageUrl: null,
        generationType: 'campaign',
      }),
    ];

    assert.equal(tipRenderForRoot(1, renders)?.id, 1);
    assert.equal(displayRenderForRoot(1, renders)?.id, 1);
    assert.equal(displayRenderForRoot(2, renders)?.id, 2);

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 1);
    assert.deepEqual(
      shoots[0]!.images.map((image) => image.id),
      [1, 2],
    );
    assert.equal(shoots[0]!.studioCreditsUsed, 0);
    assert.equal(shoots[0]!.images[0]!.outputImageUrl, 'https://cdn.example/1.png');
    assert.equal(isFailedGalleryRenderWithoutOutput(shoots[0]!.images[1]!), true);
  });

  it('does not drop an all-failed Shoot', () => {
    const renders = [
      render({
        id: 10,
        status: 'failed',
        outputImageUrl: null,
        generationType: 'hero',
        generationSessionId: 'session-all-failed',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 1);
    assert.equal(shoots[0]!.images.length, 1);
    assert.equal(shoots[0]!.images[0]!.status, 'failed');
    assert.equal(shoots[0]!.studioCreditsUsed, 0);
  });

  it('does not invent slots for unsettled processing roots', () => {
    const renders = [
      render({
        id: 20,
        status: 'processing',
        outputImageUrl: null,
        generationType: 'hero',
        generationSessionId: 'session-processing',
      }),
    ];

    assert.equal(displayRenderForRoot(20, renders), undefined);
    assert.equal(buildGalleryShoots(renders).length, 0);
  });

  it('prefers a completed tip over a failed root with no completed descendants', () => {
    const renders = [
      render({
        id: 40,
        status: 'completed',
        outputImageUrl: 'https://cdn.example/ok.png',
        generationType: 'hero',
        generationSessionId: 'session-ok',
      }),
    ];

    assert.equal(displayRenderForRoot(40, renders)?.id, 40);
    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 1);
    assert.equal(shoots[0]!.images[0]!.status, 'completed');
    assert.ok(shoots[0]!.studioCreditsUsed > 0);
  });
});
