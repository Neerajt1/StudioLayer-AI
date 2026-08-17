import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GENERATION_BUSY_ERROR_CODE,
  activeGenerationRenderIds,
  isGenerationCoordinationBusyError,
  selectActiveRootGenerationBatch,
} from './recover-active-generation.js';

describe('selectActiveRootGenerationBatch', () => {
  it('recovers the latest in-flight session after a lost POST', () => {
    const renders = [
      {
        id: 10,
        status: 'completed',
        parentRenderId: null,
        generationSessionId: 'old',
        createdAt: '2026-08-17T10:00:00.000Z',
      },
      {
        id: 21,
        status: 'processing',
        parentRenderId: null,
        generationSessionId: 'live',
        createdAt: '2026-08-17T12:00:00.000Z',
      },
      {
        id: 22,
        status: 'pending',
        parentRenderId: null,
        generationSessionId: 'live',
        createdAt: '2026-08-17T12:00:01.000Z',
      },
      {
        id: 23,
        status: 'processing',
        parentRenderId: 21,
        generationSessionId: 'live',
        createdAt: '2026-08-17T12:01:00.000Z',
      },
    ];

    assert.deepEqual(activeGenerationRenderIds(renders), [21, 22]);
  });

  it('returns empty when nothing is in-flight so a true rejection can surface', () => {
    const renders = [
      {
        id: 1,
        status: 'failed',
        parentRenderId: null,
        generationSessionId: 'done',
        createdAt: '2026-08-17T12:00:00.000Z',
      },
      {
        id: 2,
        status: 'completed',
        parentRenderId: null,
        generationSessionId: 'done-2',
        createdAt: '2026-08-17T12:05:00.000Z',
      },
    ];

    assert.deepEqual(selectActiveRootGenerationBatch(renders), []);
  });

  it('treats 409 generation_busy as coordination, not a failed Create', () => {
    assert.equal(
      isGenerationCoordinationBusyError({
        status: 409,
        data: { code: GENERATION_BUSY_ERROR_CODE },
      }),
      true,
    );
    assert.equal(isGenerationCoordinationBusyError({ status: 500 }), false);
    assert.equal(isGenerationCoordinationBusyError({ status: 400 }), false);
  });

  it('does not mix two active sessions — only the latest batch is recovered', () => {
    const renders = [
      {
        id: 1,
        status: 'processing',
        parentRenderId: null,
        generationSessionId: 'first',
        createdAt: '2026-08-17T12:00:00.000Z',
      },
      {
        id: 2,
        status: 'processing',
        parentRenderId: null,
        generationSessionId: 'second',
        createdAt: '2026-08-17T12:01:00.000Z',
      },
    ];

    assert.deepEqual(activeGenerationRenderIds(renders), [2]);
  });
});
