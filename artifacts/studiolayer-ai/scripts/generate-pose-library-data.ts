/**
 * Regenerates pose-reference-manifest.json and pose-figure-layouts.json
 * from final PoseN.png illustrations + catalog bridge.
 * Preserves existing contact-sheet-artwork-slots.json poseIndex assignments.
 *
 * Run: pnpm --filter @workspace/studiolayer-ai exec tsx scripts/generate-pose-library-data.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import poseSummary from '../../api-server/src/intelligence/pose-library-summary.json';
import artworkSlots from '../src/data/contact-sheet-artwork-slots.json';
import catalogBridge from '../src/data/pose-catalog-bridge.json';
import poseIllustrationManifest from '../src/data/pose-illustration-manifest.json';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_POSES = path.join(ROOT, 'public/pose-references');
const DATA_DIR = path.join(ROOT, 'src/data');

interface PoseMeta {
  name: string;
  category: string;
  bodyState: string;
  preferredFraming: string;
  description?: string;
}

interface SlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PoseFigureLayout {
  objectPosition: string;
  canvasAlignContent: 'start' | 'center' | 'end';
}

interface IllustrationEntry {
  poseId: string;
  filename: string;
  framing: string;
  primaryFamily: string;
  visualArchetype: string;
}

const POSES = poseSummary.poses as PoseMeta[];
const BRIDGE = catalogBridge.catalogNameToFilename as Record<string, string>;
const ILLUSTRATIONS = new Map(
  (poseIllustrationManifest.poses as IllustrationEntry[]).map((p) => [p.poseId, p]),
);

function computeFigureLayout(pose: PoseMeta, rect: SlotRect, illustration: IllustrationEntry | undefined): PoseFigureLayout {
  const slotAspect = rect.width / rect.height;
  const framing = illustration?.framing ?? pose.preferredFraming;
  const family = illustration?.primaryFamily ?? '';
  const body = pose.bodyState;

  if (
    framing === 'chest_up' ||
    framing === 'waist_up' ||
    pose.preferredFraming === 'portrait' ||
    pose.preferredFraming === 'close_up' ||
    pose.preferredFraming === 'chest_up' ||
    family.includes('Portrait')
  ) {
    return { objectPosition: 'center 42%', canvasAlignContent: 'center' };
  }

  if (framing === 'three_quarter_body') {
    return { objectPosition: 'center 55%', canvasAlignContent: 'center' };
  }

  if (
    body === 'floor_seated' ||
    body === 'crouching' ||
    body === 'kneeling' ||
    family === 'Seated Floor' ||
    family === 'Kneeling'
  ) {
    return {
      objectPosition: slotAspect > 0.85 ? 'center 88%' : 'center 90%',
      canvasAlignContent: 'end',
    };
  }

  if (family === 'Profile' || family.includes('Profile')) {
    return { objectPosition: '66% bottom', canvasAlignContent: 'end' };
  }

  if (family === 'Back' || family === 'Rear Back' || family.includes('Back')) {
    return { objectPosition: '34% bottom', canvasAlignContent: 'end' };
  }

  if (body === 'walking' || body === 'transitional' || family.includes('Walking')) {
    return { objectPosition: 'center bottom', canvasAlignContent: 'end' };
  }

  if (body === 'seated' || body === 'perched' || family.includes('Seated')) {
    return {
      objectPosition: slotAspect > 1.1 ? 'center 82%' : '52% bottom',
      canvasAlignContent: 'end',
    };
  }

  if (body === 'leaning' || family === 'Lean') {
    return { objectPosition: '44% bottom', canvasAlignContent: 'end' };
  }

  if (slotAspect > 1.05) {
    return { objectPosition: 'center 85%', canvasAlignContent: 'end' };
  }

  if (slotAspect < 0.55) {
    return { objectPosition: 'center bottom', canvasAlignContent: 'end' };
  }

  return { objectPosition: '42% bottom', canvasAlignContent: 'end' };
}

function main(): void {
  const master = artworkSlots.master;
  const existingFiles = new Set(
    fs.existsSync(PUBLIC_POSES)
      ? fs.readdirSync(PUBLIC_POSES).filter((f) => f.endsWith('.png'))
      : [],
  );

  const manifest: Record<string, string> = {};
  const layouts: Record<string, PoseFigureLayout> = {};

  for (const pose of POSES) {
    const filename = BRIDGE[pose.name];
    if (filename && existingFiles.has(filename)) {
      manifest[pose.name] = `/pose-references/${filename}`;
    }
  }

  for (const slot of master) {
    const pose = POSES[slot.poseIndex]!;
    const poseId = (catalogBridge.catalogNameToPoseId as Record<string, string>)[pose.name];
    const illustration = poseId ? ILLUSTRATIONS.get(poseId) : undefined;
    layouts[pose.name] = computeFigureLayout(pose, slot.rect as SlotRect, illustration);
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'pose-reference-manifest.json'),
    JSON.stringify({ version: '5C-FINAL', generatedAt: new Date().toISOString(), images: manifest }, null, 2),
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'pose-figure-layouts.json'),
    JSON.stringify({ version: '5C-FINAL', generatedAt: new Date().toISOString(), layouts }, null, 2),
  );

  const missing = POSES.filter((p) => !manifest[p.name]);
  console.log(`Slot assignments preserved: ${master.length}`);
  console.log(`Layouts: ${Object.keys(layouts).length}`);
  console.log(`Manifest: ${Object.keys(manifest).length} poses`);
  console.log(`Missing illustrations: ${missing.length}`);
  if (missing.length > 0) {
    console.log(missing.map((p) => p.name).join('\n'));
  }
}

main();
