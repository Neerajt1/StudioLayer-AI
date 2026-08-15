import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GALLERY_FAILED_CREATE_AGAIN_PATH,
  galleryFailedRenderCopy,
  isUnchargedFailedRenderStatus,
  workspaceGenerationFailedSlotCopy,
  workspaceShootGenerationFailedToast,
} from './generation-failure-copy.js';

describe('isUnchargedFailedRenderStatus', () => {
  it('only failed is treated as confirmed uncharged', () => {
    assert.equal(isUnchargedFailedRenderStatus('failed'), true);
    assert.equal(isUnchargedFailedRenderStatus('completed'), false);
    assert.equal(isUnchargedFailedRenderStatus('processing'), false);
    assert.equal(isUnchargedFailedRenderStatus('pending'), false);
  });
});

describe('workspaceShootGenerationFailedToast', () => {
  it('states shoot failure, no credits, garment unchanged, try again', () => {
    const toast = workspaceShootGenerationFailedToast();
    assert.equal(toast.title, "We couldn't create this Shoot.");
    assert.equal(
      toast.description,
      'No Studio Credits were used. Your garment upload is unchanged. Please try again.',
    );
  });

  it('does not use the generic complete-request or payment wording', () => {
    const text = `${workspaceShootGenerationFailedToast().title} ${workspaceShootGenerationFailedToast().description}`;
    assert.equal(/couldn't complete your request/i.test(text), false);
    assert.equal(/Payment [Ff]ailed/i.test(text), false);
    assert.equal(/Studio Credit used/i.test(text), false);
  });
});

describe('workspaceGenerationFailedSlotCopy', () => {
  it('matches approved slot wording with retry label', () => {
    const copy = workspaceGenerationFailedSlotCopy();
    assert.equal(copy.headline, "We couldn't create this Shoot.");
    assert.equal(copy.creditLine, 'No Studio Credits were used.');
    assert.equal(copy.retryLabel, 'Try again');
  });
});

describe('galleryFailedRenderCopy', () => {
  it('failed status: created + no credits charged + create again', () => {
    assert.deepEqual(galleryFailedRenderCopy('failed'), {
      headline: "This image couldn't be created.",
      creditLine: 'No Studio Credits were charged for this image.',
      retryLabel: 'Create again',
    });
  });

  it('non-failed statuses do not claim credits were free', () => {
    const copy = galleryFailedRenderCopy('processing');
    assert.equal(copy.creditLine, null);
    assert.equal(copy.headline, 'Unavailable');
  });

  it('recovery destination is the existing Workspace path', () => {
    assert.equal(GALLERY_FAILED_CREATE_AGAIN_PATH, '/studio');
  });
});
