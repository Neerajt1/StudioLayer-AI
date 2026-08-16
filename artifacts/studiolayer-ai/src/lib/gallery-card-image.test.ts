import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readPreviewImageUrlFromApiRender,
  resolveGalleryCardImageUrl,
} from './gallery-card-image.js';

describe('resolveGalleryCardImageUrl', () => {
  it('I. uses preview when present', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        previewImageUrl: 'https://cdn.example/renders/1/preview.webp',
        outputImageUrl: 'https://cdn.example/renders/1/original.jpg',
      }),
      'https://cdn.example/renders/1/preview.webp',
    );
  });

  it('I. falls back to original when preview is absent', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        previewImageUrl: null,
        outputImageUrl: 'https://cdn.example/renders/1/original.jpg',
      }),
      'https://cdn.example/renders/1/original.jpg',
    );
  });

  it('returns null when neither URL is available', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        previewImageUrl: null,
        outputImageUrl: null,
      }),
      null,
    );
  });
});

describe('readPreviewImageUrlFromApiRender', () => {
  it('reads runtime previewImageUrl without requiring it on Render', () => {
    assert.equal(
      readPreviewImageUrlFromApiRender({
        id: 1,
        previewImageUrl: 'https://cdn.example/renders/1/preview.webp',
      }),
      'https://cdn.example/renders/1/preview.webp',
    );
    assert.equal(readPreviewImageUrlFromApiRender({ id: 1 }), null);
    assert.equal(
      readPreviewImageUrlFromApiRender({ id: 1, previewImageUrl: null }),
      null,
    );
  });
});
