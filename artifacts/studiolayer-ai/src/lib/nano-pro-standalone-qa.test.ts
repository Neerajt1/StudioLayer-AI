import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NANO_PRO_STANDALONE_QA_VITE_FLAG,
  buildNanoProStandaloneQaPoseMasterPath,
  isNanoProStandaloneQaModeEnabled,
} from './nano-pro-standalone-qa-mode';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('nano-pro-standalone-qa mode gate', () => {
  it('is OFF by default (no Vite flag)', () => {
    assert.equal(
      isNanoProStandaloneQaModeEnabled({ DEV: true } as ImportMetaEnv),
      false,
    );
    assert.equal(
      isNanoProStandaloneQaModeEnabled({ DEV: false } as ImportMetaEnv),
      false,
    );
  });

  it('is OFF in production builds even if Vite flag is true', () => {
    assert.equal(
      isNanoProStandaloneQaModeEnabled({
        DEV: false,
        [NANO_PRO_STANDALONE_QA_VITE_FLAG]: 'true',
      } as ImportMetaEnv),
      false,
    );
  });

  it('is ON only in DEV with explicit Vite flag', () => {
    assert.equal(
      isNanoProStandaloneQaModeEnabled({
        DEV: true,
        [NANO_PRO_STANDALONE_QA_VITE_FLAG]: 'true',
      } as ImportMetaEnv),
      true,
    );
  });

  it('maps Pose N → face-neutral backend path without exposing UI assets', () => {
    assert.equal(
      buildNanoProStandaloneQaPoseMasterPath('Pose37'),
      'assets/pose-references-face-neutral/Pose37-face-neutral-backend.png',
    );
  });

  it('client helper never targets POST /api/renders', () => {
    const src = readFileSync(join(__dirname, 'nano-pro-standalone-qa.ts'), 'utf8');
    assert.match(src, /apiUrl\('\/api\/test\/nano-pro-standalone-trial'\)/);
    assert.equal(src.includes("apiUrl('/api/renders')"), false);
    assert.equal(src.includes('useCreateRender'), false);
    assert.match(src, /Never calls POST \/api\/renders/);
  });

  it('Studio Create QA intercept keeps pose library / DirectShoot untouched', () => {
    const studioSrc = readFileSync(join(__dirname, '../pages/studio.tsx'), 'utf8');
    assert.match(studioSrc, /nanoProStandaloneQaMode/);
    assert.match(studioSrc, /runNanoProStandaloneQaCreate/);
    assert.match(studioSrc, /DirectShootDialog/);
    assert.match(studioSrc, /createRender\.mutate/);
    const qaBranch = studioSrc.indexOf('if (nanoProStandaloneQaMode)');
    const mutateCall = studioSrc.indexOf('createRender.mutate');
    assert.ok(qaBranch > 0 && mutateCall > qaBranch);

    const dialogSrc = readFileSync(
      join(__dirname, '../components/studio/direct-shoot-dialog.tsx'),
      'utf8',
    );
    assert.equal(dialogSrc.includes('face-neutral'), false);
    assert.equal(dialogSrc.includes('nano-pro-standalone'), false);
  });
});
