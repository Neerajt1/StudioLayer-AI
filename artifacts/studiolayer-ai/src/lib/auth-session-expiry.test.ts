import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import {
  SESSION_ENDED_LOGIN_REASON,
  buildLoginPathAfterSessionEnded,
  consumeSessionEndedNoticePending,
  loginPathHasSessionEndedReason,
  markSessionEndedNoticePending,
  sessionEndedToastCopy,
} from './auth-session-expiry.js';

function installMemorySessionStorage() {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
}

describe('auth-session-expiry', () => {
  before(() => {
    installMemorySessionStorage();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('builds login path with session reason', () => {
    assert.equal(
      buildLoginPathAfterSessionEnded(),
      `/login?reason=${SESSION_ENDED_LOGIN_REASON}`,
    );
  });

  it('detects session reason in search', () => {
    assert.equal(loginPathHasSessionEndedReason('?reason=session'), true);
    assert.equal(loginPathHasSessionEndedReason('reason=session&x=1'), true);
    assert.equal(loginPathHasSessionEndedReason('?reason=other'), false);
    assert.equal(loginPathHasSessionEndedReason(''), false);
  });

  it('pending flag is consumed once (no repeat toast)', () => {
    assert.equal(consumeSessionEndedNoticePending(), false);
    markSessionEndedNoticePending();
    assert.equal(consumeSessionEndedNoticePending(), true);
    assert.equal(consumeSessionEndedNoticePending(), false);
  });

  it('session-ended copy matches approved plan', () => {
    assert.equal(sessionEndedToastCopy.title, 'Your session ended.');
    assert.equal(
      sessionEndedToastCopy.description,
      'Sign in again to continue. Your Studio and Gallery were not deleted.',
    );
  });
});
