import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  httpStatusFromAuthError,
  loginErrorToast,
  registerErrorToast,
} from './auth-error-messages.js';

describe('httpStatusFromAuthError', () => {
  it('reads numeric status from ApiError-shaped objects', () => {
    assert.equal(httpStatusFromAuthError({ status: 401 }), 401);
    assert.equal(httpStatusFromAuthError({ status: 409 }), 409);
  });

  it('parses HTTP status from Error message', () => {
    assert.equal(
      httpStatusFromAuthError(new Error('HTTP 401 Unauthorized: Invalid credentials')),
      401,
    );
  });

  it('returns null for network-style errors without status', () => {
    assert.equal(httpStatusFromAuthError(new TypeError('Failed to fetch')), null);
    assert.equal(httpStatusFromAuthError(null), null);
  });
});

describe('loginErrorToast', () => {
  it('401 / invalid credentials', () => {
    assert.deepEqual(loginErrorToast({ status: 401 }), {
      title: "We couldn't sign you in.",
      description: 'Check your email and password.',
    });
  });

  it('5xx', () => {
    assert.deepEqual(loginErrorToast({ status: 503 }), {
      title: "We couldn't reach StudioLayer.",
      description: 'Please try again in a few moments.',
    });
  });

  it('network / no status', () => {
    assert.deepEqual(loginErrorToast(new TypeError('Failed to fetch')), {
      title: "We couldn't reach StudioLayer.",
      description: 'Please try again in a few moments.',
    });
  });

  it('does not expose raw server error bodies', () => {
    const toast = loginErrorToast({
      status: 401,
      message: 'HTTP 401: Invalid credentials — stack at auth.ts:76',
      data: { error: 'Invalid credentials', stack: 'Error\n    at login' },
    });
    assert.equal(toast.title.includes('stack'), false);
    assert.equal(toast.description.includes('Invalid credentials'), false);
    assert.equal(toast.description, 'Check your email and password.');
  });
});

describe('registerErrorToast', () => {
  it('409 duplicate email', () => {
    assert.deepEqual(registerErrorToast({ status: 409 }), {
      title: 'An account with this email already exists.',
      description: 'Sign in instead.',
    });
  });

  it('5xx / other server failures', () => {
    assert.deepEqual(registerErrorToast({ status: 500 }), {
      title: "We couldn't create your Studio.",
      description: 'Please try again.',
    });
    assert.deepEqual(registerErrorToast({ status: 400 }), {
      title: "We couldn't create your Studio.",
      description: 'Please try again.',
    });
  });

  it('network / no status', () => {
    assert.deepEqual(registerErrorToast(new TypeError('Failed to fetch')), {
      title: "We couldn't create your Studio.",
      description: 'Please try again.',
    });
  });

  it('does not expose raw server error bodies', () => {
    const toast = registerErrorToast({
      status: 409,
      data: { error: 'Email already in use', stack: 'Error\n    at register' },
    });
    assert.equal(toast.description, 'Sign in instead.');
    assert.equal(JSON.stringify(toast).includes('Email already in use'), false);
    assert.equal(JSON.stringify(toast).includes('stack'), false);
  });
});
