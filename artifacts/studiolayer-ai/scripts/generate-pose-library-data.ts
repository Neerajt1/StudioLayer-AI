/**
 * Generates pose-reference-manifest.json, pose-figure-layouts.json,
 * and updates contact-sheet-artwork-slots.json pose assignment (deterministic shuffle).
 *
 * Run: pnpm --filter @workspace/studiolayer-ai exec tsx scripts/generate-pose-library-data.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import poseSummary from '../../api-server/src/intelligence/pose-library-summary.json';
import artworkSlots from '../src/data/contact-sheet-artwork-slots.json';
import { poseNameToSlug, poseSlugToUrl } from './pose-name-slug';

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

const POSES = poseSummary.poses as PoseMeta[];

/** Seeded PRNG for deterministic shuffle. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function diversityScore(
  pose: PoseMeta,
  prev: PoseMeta | null,
  prev2: PoseMeta | null,
): number {
  let score = 0;
  if (!prev) return 1;
  if (pose.bodyState !== prev.bodyState) score += 4;
  if (pose.category !== prev.category) score += 3;
  if (pose.preferredFraming !== prev.preferredFraming) score += 2;
  if (prev2 && pose.bodyState !== prev2.bodyState) score += 1;
  if (prev2 && pose.category !== prev2.category) score += 1;
  return score;
}

function assignPosesToSlots(): number[] {
  const rng = mulberry32(0x5c0_050); // Phase 5C-O seed
  const remaining = [...POSES];
  const assignment: number[] = [];
  let prev: PoseMeta | null = null;
  let prev2: PoseMeta | null = null;

  for (let slot = 0; slot < 75; slot++) {
    const scored = remaining.map((pose, idx) => ({
      idx,
      pose,
      score: diversityScore(pose, prev, prev2) + rng() * 0.01,
    }));
    scored.sort((a, b) => b.score - a.score);
    const pick = scored[0]!;
    assignment.push(POSES.indexOf(pick.pose));
    remaining.splice(pick.idx, 1);
    prev2 = prev;
    prev = pick.pose;
  }

  return assignment;
}

function computeFigureLayout(pose: PoseMeta, rect: SlotRect): PoseFigureLayout {
  const slotAspect = rect.width / rect.height;
  const name = pose.name.toLowerCase();
  const framing = pose.preferredFraming;
  const body = pose.bodyState;

  if (
    framing === 'portrait' ||
    framing === 'close_up' ||
    framing === 'chest_up' ||
    name.includes('portrait')
  ) {
    return { objectPosition: 'center 42%', canvasAlignContent: 'center' };
  }

  if (framing === 'garment_detail' || name.includes('pocket detail')) {
    return { objectPosition: 'center 55%', canvasAlignContent: 'center' };
  }

  if (
    body === 'floor_seated' ||
    body === 'crouching' ||
    body === 'kneeling' ||
    name.includes('floor') ||
    name.includes('kneel') ||
    name.includes('crouch')
  ) {
    return {
      objectPosition: slotAspect > 0.85 ? 'center 88%' : 'center 90%',
      canvasAlignContent: 'end',
    };
  }

  if (name.includes('profile') && !name.includes('portrait')) {
    return { objectPosition: '66% bottom', canvasAlignContent: 'end' };
  }

  if (name.includes('back') || name.includes('rear') || name.includes('over-shoulder')) {
    return { objectPosition: '34% bottom', canvasAlignContent: 'end' };
  }

  if (body === 'walking' || body === 'transitional' || name.includes('walk') || name.includes('step')) {
    return { objectPosition: 'center bottom', canvasAlignContent: 'end' };
  }

  if (body === 'seated' || body === 'perched' || name.includes('seated') || name.includes('stool') || name.includes('chair')) {
    return {
      objectPosition: slotAspect > 1.1 ? 'center 82%' : '52% bottom',
      canvasAlignContent: 'end',
    };
  }

  if (body === 'leaning' || name.includes('lean')) {
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
  const assignment = assignPosesToSlots();
  const master = artworkSlots.master.map((slot, index) => ({
    ...slot,
    poseIndex: assignment[index]!,
  }));

  const manifest: Record<string, string> = {};
  const layouts: Record<string, PoseFigureLayout> = {};
  const existingFiles = new Set(
    fs.existsSync(PUBLIC_POSES)
      ? fs.readdirSync(PUBLIC_POSES).filter((f) => f.endsWith('.png'))
      : [],
  );

  for (const pose of POSES) {
    const slug = poseNameToSlug(pose.name);
    const file = `${slug}.png`;
    if (existingFiles.has(file)) {
      manifest[pose.name] = poseSlugToUrl(slug);
    }
  }

  for (const slot of master) {
    const pose = POSES[slot.poseIndex]!;
    layouts[pose.name] = computeFigureLayout(pose, slot.rect as SlotRect);
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'contact-sheet-artwork-slots.json'),
    JSON.stringify({ templates: artworkSlots.templates, master }, null, 2),
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'pose-reference-manifest.json'),
    JSON.stringify({ version: '5C-O', generatedAt: new Date().toISOString(), images: manifest }, null, 2),
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'pose-figure-layouts.json'),
    JSON.stringify({ version: '5C-O', generatedAt: new Date().toISOString(), layouts }, null, 2),
  );

  const missing = POSES.filter((p) => !existingFiles.has(`${poseNameToSlug(p.name)}.png`));
  console.log(`Assigned ${master.length} slots with deterministic shuffle.`);
  console.log(`Layouts: ${Object.keys(layouts).length}`);
  console.log(`Manifest: ${Object.keys(manifest).length} poses`);
  console.log(`Missing illustrations: ${missing.length}`);
  if (missing.length > 0) {
    console.log(missing.map((p) => poseNameToSlug(p.name)).join('\n'));
  }
}

main();
