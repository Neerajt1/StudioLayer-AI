import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SHOOT_TYPE_LABEL, buildGalleryShoots, type GalleryShoot } from './gallery-shoots.js';

type TestRender = GalleryShoot['images'][number];

function render(
  partial: Partial<TestRender> & Pick<TestRender, 'id' | 'status' | 'generationType'>,
): TestRender {
  return {
    id: partial.id,
    status: partial.status,
    sourceImageUrl: partial.sourceImageUrl ?? 'https://cdn.example/garment.jpg',
    outputImageUrl: partial.outputImageUrl ?? `https://cdn.example/${partial.id}.png`,
    parentRenderId: partial.parentRenderId ?? null,
    generationType: partial.generationType,
    generationSessionId: partial.generationSessionId ?? 'session-1',
    createdAt: partial.createdAt ?? '2026-08-01T10:00:00.000Z',
    studioCreditsUsed: partial.studioCreditsUsed,
    refinementCount: partial.refinementCount ?? 0,
    modelPersona: partial.modelPersona,
    locationEnvironment: partial.locationEnvironment,
  };
}

function completedRoots(input: {
  sessionId: string;
  generationType: TestRender['generationType'];
  count: number;
  studioCreditsUsed: number;
  urlPrefix: string;
}): TestRender[] {
  return Array.from({ length: input.count }, (_, index) =>
    render({
      id: index + 1,
      status: 'completed',
      generationType: input.generationType,
      generationSessionId: input.sessionId,
      studioCreditsUsed: input.studioCreditsUsed,
      outputImageUrl: `${input.urlPrefix}/${index + 1}.png`,
    }),
  );
}

describe('historical Gallery shoot-type labels', () => {
  it('relabels inverted 2-image Campaign sessions as Editorial without touching credits or URLs', () => {
    const urls = [
      'https://cdn.example/legacy-campaign/1.png',
      'https://cdn.example/legacy-campaign/2.png',
    ];
    const renders = completedRoots({
      sessionId: 'legacy-2-campaign',
      generationType: 'campaign',
      count: 2,
      studioCreditsUsed: 2,
      urlPrefix: 'https://cdn.example/legacy-campaign',
    });

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 1);
    assert.equal(shoots[0]!.generationType, 'editorial');
    assert.equal(SHOOT_TYPE_LABEL[shoots[0]!.generationType], 'Editorial');
    assert.equal(shoots[0]!.imageCount, 2);
    assert.equal(shoots[0]!.studioCreditsUsed, 2);
    assert.deepEqual(
      shoots[0]!.images.map((image) => image.outputImageUrl),
      urls,
    );
  });

  it('relabels inverted 4-image Editorial sessions as Campaign without touching credits or URLs', () => {
    const urls = [
      'https://cdn.example/legacy-editorial/1.png',
      'https://cdn.example/legacy-editorial/2.png',
      'https://cdn.example/legacy-editorial/3.png',
      'https://cdn.example/legacy-editorial/4.png',
    ];
    const renders = completedRoots({
      sessionId: 'legacy-4-editorial',
      generationType: 'editorial',
      count: 4,
      studioCreditsUsed: 4,
      urlPrefix: 'https://cdn.example/legacy-editorial',
    });

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 1);
    assert.equal(shoots[0]!.generationType, 'campaign');
    assert.equal(SHOOT_TYPE_LABEL[shoots[0]!.generationType], 'Campaign');
    assert.equal(shoots[0]!.imageCount, 4);
    assert.equal(shoots[0]!.studioCreditsUsed, 4);
    assert.deepEqual(
      shoots[0]!.images.map((image) => image.outputImageUrl),
      urls,
    );
  });

  it('leaves already-consistent Editorial, Campaign, Custom Campaign, and Hero sessions unchanged', () => {
    const editorial = buildGalleryShoots(
      completedRoots({
        sessionId: 'new-editorial',
        generationType: 'editorial',
        count: 2,
        studioCreditsUsed: 2,
        urlPrefix: 'https://cdn.example/new-editorial',
      }),
    );
    assert.equal(editorial[0]!.generationType, 'editorial');
    assert.equal(editorial[0]!.studioCreditsUsed, 2);

    const campaign = buildGalleryShoots(
      completedRoots({
        sessionId: 'new-campaign',
        generationType: 'campaign',
        count: 4,
        studioCreditsUsed: 4,
        urlPrefix: 'https://cdn.example/new-campaign',
      }),
    );
    assert.equal(campaign[0]!.generationType, 'campaign');
    assert.equal(campaign[0]!.studioCreditsUsed, 4);

    const custom = buildGalleryShoots(
      completedRoots({
        sessionId: 'custom-campaign',
        generationType: 'campaign',
        count: 6,
        studioCreditsUsed: 6,
        urlPrefix: 'https://cdn.example/custom-campaign',
      }),
    );
    assert.equal(custom[0]!.generationType, 'campaign');
    assert.equal(custom[0]!.imageCount, 6);
    assert.equal(custom[0]!.studioCreditsUsed, 6);

    const hero = buildGalleryShoots(
      completedRoots({
        sessionId: 'hero',
        generationType: 'hero',
        count: 1,
        studioCreditsUsed: 1,
        urlPrefix: 'https://cdn.example/hero',
      }),
    );
    assert.equal(hero[0]!.generationType, 'hero');
    assert.equal(hero[0]!.studioCreditsUsed, 1);
  });

  it('does not reclassify mixed-type sessions', () => {
    const shoots = buildGalleryShoots([
      render({
        id: 1,
        status: 'completed',
        generationType: 'campaign',
        generationSessionId: 'mixed',
        studioCreditsUsed: 2,
      }),
      render({
        id: 2,
        status: 'completed',
        generationType: 'editorial',
        generationSessionId: 'mixed',
        studioCreditsUsed: 2,
      }),
    ]);

    assert.equal(shoots.length, 1);
    assert.equal(shoots[0]!.generationType, 'campaign');
    assert.equal(shoots[0]!.studioCreditsUsed, 2);
  });
});
