import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildGalleryShoots, type GalleryShoot } from './gallery-shoots.js';
import { stabilizeGalleryShoots } from './gallery-shoot-stability.js';

type TestRender = GalleryShoot['images'][number];

function render(
  partial: Partial<TestRender> & Pick<TestRender, 'id' | 'status'>,
): TestRender {
  return {
    id: partial.id,
    status: partial.status,
    sourceImageUrl: partial.sourceImageUrl ?? 'https://cdn.example/garment.jpg',
    outputImageUrl: partial.outputImageUrl ?? `https://cdn.example/${partial.id}.png`,
    parentRenderId: partial.parentRenderId ?? null,
    generationType: partial.generationType ?? 'editorial',
    generationSessionId: partial.generationSessionId,
    createdAt: partial.createdAt ?? '2026-08-26T10:00:00.000Z',
    studioCreditsUsed: partial.studioCreditsUsed,
    refinementCount: partial.refinementCount,
  };
}

describe('Gallery identity — null-session never groups', () => {
  it('1. exact-size null-session Editorial roots stay separate Shoots', () => {
    const renders = [
      render({
        id: 10,
        status: 'completed',
        generationType: 'editorial',
        generationSessionId: null,
        createdAt: '2026-08-26T10:00:00.000Z',
        outputImageUrl: 'https://cdn.example/project-a.png',
      }),
      render({
        id: 11,
        status: 'completed',
        generationType: 'editorial',
        generationSessionId: null,
        createdAt: '2026-08-26T10:00:30.000Z',
        outputImageUrl: 'https://cdn.example/project-b.png',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 2);
    assert.deepEqual(
      shoots.map((shoot) => shoot.images.map((image) => image.id)),
      [[11], [10]],
    );
    for (const shoot of shoots) {
      assert.equal(shoot.images.length, 1);
      assert.match(shoot.id, /^shoot-\d+$/);
    }
  });

  it('2. four null-session Campaign roots that match all old heuristics → four Shoots', () => {
    const renders = [20, 21, 22, 23].map((id, index) =>
      render({
        id,
        status: 'completed',
        generationType: 'campaign',
        generationSessionId: null,
        createdAt: `2026-08-26T10:00:0${index}.000Z`,
        outputImageUrl: `https://cdn.example/camp-${id}.png`,
      }),
    );

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 4);
    assert.deepEqual(
      shoots.map((shoot) => shoot.images.map((image) => image.id)),
      [[23], [22], [21], [20]],
    );
  });

  it('3. null-session distinct generations stay separate', () => {
    const renders = [
      render({
        id: 30,
        status: 'completed',
        generationSessionId: null,
        sourceImageUrl: 'https://cdn.example/garment-a.jpg',
        outputImageUrl: 'https://cdn.example/gen-a.png',
        createdAt: '2026-08-26T12:00:00.000Z',
      }),
      render({
        id: 31,
        status: 'completed',
        generationSessionId: null,
        sourceImageUrl: 'https://cdn.example/garment-b.jpg',
        outputImageUrl: 'https://cdn.example/gen-b.png',
        createdAt: '2026-08-26T11:00:00.000Z',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 2);
    assert.equal(shoots[0]!.id, 'shoot-30');
    assert.equal(shoots[1]!.id, 'shoot-31');
  });

  it('4. session UUID A and B never share images', () => {
    const renders = [
      render({
        id: 40,
        status: 'completed',
        generationSessionId: 'uuid-a',
        outputImageUrl: 'https://cdn.example/a.png',
        createdAt: '2026-08-26T11:00:00.000Z',
      }),
      render({
        id: 41,
        status: 'completed',
        generationSessionId: 'uuid-b',
        outputImageUrl: 'https://cdn.example/b.png',
        createdAt: '2026-08-26T10:00:00.000Z',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 2);
    assert.deepEqual(
      shoots.find((shoot) => shoot.id === 'uuid-a')!.images.map((image) => image.id),
      [40],
    );
    assert.deepEqual(
      shoots.find((shoot) => shoot.id === 'uuid-b')!.images.map((image) => image.id),
      [41],
    );
  });

  it('5. one V1 Create session → one Shoot → one image', () => {
    const shoots = buildGalleryShoots([
      render({
        id: 50,
        status: 'completed',
        generationType: 'hero',
        generationSessionId: 'v1-create-only',
        outputImageUrl: 'https://cdn.example/v1.png',
      }),
    ]);
    assert.equal(shoots.length, 1);
    assert.equal(shoots[0]!.id, 'v1-create-only');
    assert.equal(shoots[0]!.images.length, 1);
    assert.equal(shoots[0]!.images[0]!.id, 50);
  });

  it('6. chronology newest → oldest from fresh API data', () => {
    const shoots = buildGalleryShoots([
      render({
        id: 1,
        status: 'completed',
        generationSessionId: 'aug-24',
        createdAt: '2026-08-24T10:00:00.000Z',
        outputImageUrl: 'https://cdn.example/24.png',
      }),
      render({
        id: 2,
        status: 'completed',
        generationSessionId: 'aug-27',
        createdAt: '2026-08-27T10:00:00.000Z',
        outputImageUrl: 'https://cdn.example/27.png',
      }),
      render({
        id: 3,
        status: 'completed',
        generationSessionId: 'aug-26',
        createdAt: '2026-08-26T10:00:00.000Z',
        outputImageUrl: 'https://cdn.example/26.png',
      }),
    ]);

    assert.deepEqual(
      shoots.map((shoot) => shoot.id),
      ['aug-27', 'aug-26', 'aug-24'],
    );
  });

  it('10. sourceImageUrl + type + timestamp cannot merge null-session roots', () => {
    const renders = [
      render({
        id: 60,
        status: 'completed',
        generationType: 'editorial',
        generationSessionId: null,
        sourceImageUrl: 'https://cdn.example/same-garment.jpg',
        createdAt: '2026-08-26T10:00:00.000Z',
      }),
      render({
        id: 61,
        status: 'completed',
        generationType: 'editorial',
        generationSessionId: null,
        sourceImageUrl: 'https://cdn.example/same-garment.jpg',
        createdAt: '2026-08-26T10:00:10.000Z',
      }),
    ];

    const shoots = buildGalleryShoots(renders);
    assert.equal(shoots.length, 2);
    assert.equal(shoots.every((shoot) => shoot.images.length === 1), true);
  });
});

describe('Gallery chronology — no stale client override', () => {
  function shoot(
    partial: Partial<GalleryShoot> & Pick<GalleryShoot, 'id' | 'createdAt'>,
  ): GalleryShoot {
    return {
      rootId: partial.rootId ?? 1,
      generationType: partial.generationType ?? 'hero',
      images: partial.images ?? [],
      sourceImageUrl: partial.sourceImageUrl ?? null,
      studioCreditsUsed: partial.studioCreditsUsed ?? 0,
      refinementCount: partial.refinementCount ?? 0,
      imageCount: partial.imageCount ?? partial.images?.length ?? 0,
      ...partial,
    };
  }

  it('7. refetch chronology ignores previous stable order', () => {
    const previous = [
      shoot({
        id: 'aug-24',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        images: [{ id: 1, status: 'completed', outputImageUrl: '24' } as never],
        imageCount: 1,
      }),
      shoot({
        id: 'aug-26',
        createdAt: new Date('2026-08-26T10:00:00.000Z'),
        images: [{ id: 2, status: 'completed', outputImageUrl: '26' } as never],
        imageCount: 1,
      }),
    ];
    const next = [
      shoot({
        id: 'aug-27',
        createdAt: new Date('2026-08-27T10:00:00.000Z'),
        images: [{ id: 3, status: 'completed', outputImageUrl: '27' } as never],
        imageCount: 1,
      }),
      shoot({
        id: 'aug-26',
        createdAt: new Date('2026-08-26T10:00:00.000Z'),
        images: [{ id: 2, status: 'completed', outputImageUrl: '26' } as never],
        imageCount: 1,
      }),
      shoot({
        id: 'aug-24',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        images: [{ id: 1, status: 'completed', outputImageUrl: '24' } as never],
        imageCount: 1,
      }),
    ];

    const result = stabilizeGalleryShoots(previous, next);
    assert.deepEqual(
      result.map((item) => item.id),
      ['aug-27', 'aug-26', 'aug-24'],
    );
    assert.equal(result, next);
  });

  it('8. refetch keeps images on their Shoot identities after reorder', () => {
    const previous = [
      shoot({
        id: 'shoot-a',
        rootId: 10,
        createdAt: new Date('2026-08-26T10:00:00.000Z'),
        images: [{ id: 10, status: 'completed', outputImageUrl: 'a' } as never],
        imageCount: 1,
      }),
      shoot({
        id: 'shoot-b',
        rootId: 20,
        createdAt: new Date('2026-08-25T10:00:00.000Z'),
        images: [{ id: 20, status: 'completed', outputImageUrl: 'b' } as never],
        imageCount: 1,
      }),
    ];
    const next = [
      shoot({
        id: 'shoot-b',
        rootId: 20,
        createdAt: new Date('2026-08-27T10:00:00.000Z'),
        images: [{ id: 20, status: 'completed', outputImageUrl: 'b-fresh' } as never],
        imageCount: 1,
      }),
      shoot({
        id: 'shoot-a',
        rootId: 10,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        images: [{ id: 10, status: 'completed', outputImageUrl: 'a-fresh' } as never],
        imageCount: 1,
      }),
    ];

    const result = stabilizeGalleryShoots(previous, next);
    assert.equal(result[0]!.id, 'shoot-b');
    assert.equal(result[0]!.images[0]!.outputImageUrl, 'b-fresh');
    assert.equal(result[1]!.id, 'shoot-a');
    assert.equal(result[1]!.images[0]!.outputImageUrl, 'a-fresh');
  });

  it('9. previous createdAt never overrides next createdAt', () => {
    const previous = [
      shoot({
        id: 'session-x',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        images: [{ id: 1, status: 'completed', outputImageUrl: 'old' } as never],
        imageCount: 1,
      }),
    ];
    const next = [
      shoot({
        id: 'session-x',
        createdAt: new Date('2026-08-27T18:00:00.000Z'),
        images: [{ id: 1, status: 'completed', outputImageUrl: 'new' } as never],
        imageCount: 1,
      }),
    ];

    const result = stabilizeGalleryShoots(previous, next);
    assert.equal(result[0]!.createdAt.toISOString(), '2026-08-27T18:00:00.000Z');
    assert.equal(result[0]!.images[0]!.outputImageUrl, 'new');
  });
});
