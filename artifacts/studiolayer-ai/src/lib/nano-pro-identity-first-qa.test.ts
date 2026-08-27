import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NANO_PRO_IDENTITY_FIRST_QA_VITE_FLAG,
  isNanoProIdentityFirstQaModeEnabled,
} from './nano-pro-identity-first-qa-mode';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('nano-pro-identity-first-qa mode gate', () => {
  it('disabled outside DEV', () => {
    assert.equal(
      isNanoProIdentityFirstQaModeEnabled({
        DEV: false,
        [NANO_PRO_IDENTITY_FIRST_QA_VITE_FLAG]: 'true',
      }),
      false,
    );
  });

  it('disabled when flag unset in DEV', () => {
    assert.equal(
      isNanoProIdentityFirstQaModeEnabled({
        DEV: true,
      }),
      false,
    );
  });

  it('enabled only when DEV + flag true', () => {
    assert.equal(
      isNanoProIdentityFirstQaModeEnabled({
        DEV: true,
        [NANO_PRO_IDENTITY_FIRST_QA_VITE_FLAG]: 'true',
      }),
      true,
    );
  });

  it('client calls identity-first trial endpoint, never /api/renders', () => {
    const src = readFileSync(join(__dirname, 'nano-pro-identity-first-qa.ts'), 'utf8');
    assert.match(src, /apiUrl\('\/api\/test\/nano-pro-identity-first-trial'\)/);
    assert.equal(src.includes("apiUrl('/api/renders')"), false);
    assert.equal(src.includes('useCreateRender'), false);
    assert.match(src, /Never calls POST \/api\/renders/);
  });

  it('studio Create precedence: identity-first before standalone', () => {
    const studioSrc = readFileSync(
      join(__dirname, '../pages/studio.tsx'),
      'utf8',
    );
    const identityIdx = studioSrc.indexOf('if (nanoProIdentityFirstQaMode)');
    const standaloneIdx = studioSrc.indexOf('if (nanoProStandaloneQaMode)');
    assert.ok(identityIdx > 0 && standaloneIdx > identityIdx);
    assert.match(studioSrc, /runNanoProIdentityFirstQaCreate/);
    assert.match(studioSrc, /STAGE 1 — IDENTITY ANCHOR/);
    assert.match(studioSrc, /STAGE 2 — FINAL POSE RESULT/);
  });
});
