import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  STUDIO_WELCOME_SEEN_KEY,
  hasEnteredStudioWelcome,
  isStudioWelcomeRoute,
  markStudioWelcomeEntered,
  shouldShowStudioWelcome,
} from './studio-welcome.ts';

function mockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe('studio welcome session gate', () => {
  let sessionStore: Storage;

  beforeEach(() => {
    sessionStore = mockStorage();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: sessionStore,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mockStorage(),
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { search: '' },
      },
    });
  });

  it('maps Studio entry routes', () => {
    assert.equal(isStudioWelcomeRoute('/'), true);
    assert.equal(isStudioWelcomeRoute('/studio'), true);
    assert.equal(isStudioWelcomeRoute('/gallery'), false);
    assert.equal(isStudioWelcomeRoute('/login'), false);
  });

  it('shows welcome for a new browser session (no sessionStorage flag)', () => {
    assert.equal(hasEnteredStudioWelcome(), false);
    assert.equal(shouldShowStudioWelcome(), true);
  });

  it('sets sessionStorage when Enter Studio is recorded', () => {
    markStudioWelcomeEntered();
    assert.equal(sessionStorage.getItem(STUDIO_WELCOME_SEEN_KEY), '1');
    assert.equal(hasEnteredStudioWelcome(), true);
    assert.equal(shouldShowStudioWelcome(), false);
  });

  it('keeps welcome hidden when sessionStorage flag already exists', () => {
    sessionStorage.setItem(STUDIO_WELCOME_SEEN_KEY, '1');
    assert.equal(shouldShowStudioWelcome(), false);
  });

  it('ignores localStorage for welcome suppression (sessionStorage only)', () => {
    localStorage.setItem(STUDIO_WELCOME_SEEN_KEY, '1');
    assert.equal(sessionStorage.getItem(STUDIO_WELCOME_SEEN_KEY), null);
    assert.equal(shouldShowStudioWelcome(), true);
  });

  it('does not depend on authentication state to decide visibility', () => {
    // Gate helpers accept no auth arguments and do not read auth globals.
    assert.equal(shouldShowStudioWelcome.length, 0);
    assert.equal(hasEnteredStudioWelcome.length, 0);
    assert.equal(markStudioWelcomeEntered.length, 0);

    // Simulate "logged in" leftovers in storage — welcome still follows session flag only.
    localStorage.setItem('auth-token', 'fake');
    assert.equal(shouldShowStudioWelcome(), true);
    markStudioWelcomeEntered();
    assert.equal(shouldShowStudioWelcome(), false);
  });

  it('simulates a new browser session by clearing sessionStorage', () => {
    markStudioWelcomeEntered();
    assert.equal(shouldShowStudioWelcome(), false);
    sessionStorage.clear();
    assert.equal(shouldShowStudioWelcome(), true);
  });
});
