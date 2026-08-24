import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicPoseDir = join(__dirname, '../../public/pose-references');
const registryPath = join(__dirname, '../data/pose-canonical-registry.json');
const manifestPath = join(__dirname, '../data/pose-reference-manifest.json');
const displayTs = join(__dirname, 'pose-library-display.ts');
const appTs = join(__dirname, '../App.tsx');
const navTs = join(__dirname, '../components/layout/editorial-nav.tsx');

describe('frontend pose display assets remain face-bearing', () => {
  it('1. Pose36 display path remains /pose-references/Pose36.png', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      images: Record<string, string>;
    };
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      poses: Array<{ poseId: string; name: string; visualPath: string }>;
    };
    const pose36 = registry.poses.find((p) => p.poseId === 'Pose36');
    assert.ok(pose36);
    assert.equal(pose36!.visualPath, '/pose-references/Pose36.png');
    assert.equal(
      manifest.images[pose36!.name],
      '/pose-references/Pose36.png',
    );
    assert.equal(existsSync(join(publicPoseDir, 'Pose36.png')), true);

    const displaySrc = readFileSync(displayTs, 'utf8');
    assert.match(displaySrc, /getPoseReferenceImageUrl/);
    assert.equal(displaySrc.includes('face-neutral-backend'), false);
  });

  it('2. canonical registry has 75 production pose IDs and no backend-neutral ids', () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      poses: Array<{ poseId: string; visualPath: string }>;
    };
    assert.equal(registry.poses.length, 75);
    for (const pose of registry.poses) {
      assert.match(pose.poseId, /^Pose\d+$/);
      assert.equal(pose.visualPath.includes('face-neutral'), false);
      assert.equal(pose.poseId.includes('face-neutral'), false);
    }
    const registryText = readFileSync(registryPath, 'utf8');
    assert.equal(registryText.includes('face-neutral-backend'), false);
    assert.equal(registryText.includes('Pose36-face-neutral-dev'), false);
    assert.equal(registryText.includes('face-neutral-dev'), false);
  });

  it('3. DEV forensic Pose36-face-neutral-dev asset and Pro→Flash UI are gone', () => {
    assert.equal(
      existsSync(join(publicPoseDir, 'Pose36-face-neutral-dev.png')),
      false,
    );
    const publicNames = readdirSync(publicPoseDir);
    assert.equal(
      publicNames.some((n) => n.includes('face-neutral-dev')),
      false,
    );

    const appSrc = readFileSync(appTs, 'utf8');
    const navSrc = readFileSync(navTs, 'utf8');
    assert.equal(appSrc.includes('pro-pose-flash-identity'), false);
    assert.equal(appSrc.includes('PRO → FLASH'), false);
    assert.equal(navSrc.includes('PRO → FLASH TEST'), false);
    assert.equal(navSrc.includes('pro-pose-flash-identity'), false);
    assert.equal(navSrc.includes('/dev/pro-pose-flash-identity'), false);
  });
});
