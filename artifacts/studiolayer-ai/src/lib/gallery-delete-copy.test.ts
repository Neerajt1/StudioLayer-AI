import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  galleryDeleteFailedToast,
  galleryDeleteSucceededToast,
} from './gallery-delete-copy.js';

describe('galleryDeleteSucceededToast', () => {
  it('preserves existing successful delete wording', () => {
    assert.deepEqual(galleryDeleteSucceededToast(), {
      title: 'Asset deleted',
      description: 'The image has been removed.',
    });
  });
});

describe('galleryDeleteFailedToast', () => {
  it('states image still present, credits unaffected, and try again', () => {
    const toast = galleryDeleteFailedToast();
    assert.equal(toast.title, "We couldn't delete this image.");
    assert.equal(
      toast.description,
      "It's still in your Creative Ledger. No Studio Credits were affected. Try again.",
    );
  });

  it('does not use the generic complete-request toast', () => {
    const text = `${galleryDeleteFailedToast().title} ${galleryDeleteFailedToast().description}`;
    assert.equal(/couldn't complete your request/i.test(text), false);
  });

  it('does not imply deletion, refund, or credit change', () => {
    const text = `${galleryDeleteFailedToast().title} ${galleryDeleteFailedToast().description}`;
    assert.equal(/has been removed/i.test(text), false);
    assert.equal(/refund/i.test(text), false);
    assert.equal(/credited back/i.test(text), false);
    assert.equal(/Payment [Ff]ailed/i.test(text), false);
    assert.match(text, /still in your Creative Ledger/i);
    assert.match(text, /No Studio Credits were affected/i);
    assert.match(text, /Try again/);
  });
});
