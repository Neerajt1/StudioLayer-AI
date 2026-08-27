import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readPreviewImageUrlFromApiRender,
  resolveGalleryCardImageUrl,
} from './gallery-card-image.js';

describe('resolveGalleryCardImageUrl', () => {
  it('I. uses preview when completed with valid preview and output', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: 'completed',
        previewImageUrl: 'https://cdn.example/renders/1/preview.webp',
        outputImageUrl: 'https://cdn.example/renders/1/original.jpg',
      }),
      'https://cdn.example/renders/1/preview.webp',
    );
  });

  it('I. falls back to original when preview is absent', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: 'completed',
        previewImageUrl: null,
        outputImageUrl: 'https://cdn.example/renders/1/original.jpg',
      }),
      'https://cdn.example/renders/1/original.jpg',
    );
  });

  it('returns null when neither URL is available', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: 'completed',
        previewImageUrl: null,
        outputImageUrl: null,
      }),
      null,
    );
  });

  it('failed + stale previewImageUrl + null outputImageUrl → null', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: 'failed',
        previewImageUrl: 'https://cdn.example/renders/142/preview.webp',
        outputImageUrl: null,
      }),
      null,
    );
  });

  it('failed with outputImageUrl still returns the output (no preview)', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: 'failed',
        previewImageUrl: 'https://cdn.example/renders/9/preview.webp',
        outputImageUrl: 'https://cdn.example/renders/9/original.jpg',
      }),
      'https://cdn.example/renders/9/original.jpg',
    );
  });

  it('completed behavior unchanged when only output is present', () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: 'completed',
        outputImageUrl: 'https://cdn.example/renders/146/original.jpg',
      }),
      'https://cdn.example/renders/146/original.jpg',
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
