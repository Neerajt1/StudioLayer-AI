/**
 * Batch-generates monochrome pose illustration PNGs via fal.ai FLUX Kontext.
 * Uses classic-three-quarter.png as the locked style reference.
 *
 * Run from repo root:
 *   pnpm --filter @workspace/api-server exec tsx scripts/generate-pose-references.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fal } from '@fal-ai/client';
import poseSummary from '../src/intelligence/pose-library-summary.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../studiolayer-ai/public/pose-references');
const STYLE_REFERENCE = path.join(OUT_DIR, 'classic-three-quarter.png');

interface PoseMeta {
  name: string;
  description: string;
  category: string;
  bodyState: string;
  bodyGeometry: string[];
  cameraRelationship: string;
  preferredFraming: string;
  energy: string;
  expression: string;
  movement: string;
  interaction: string;
  prop: string;
  editorialIntensity: number;
}

const POSES = poseSummary.poses as PoseMeta[];

fal.config({ credentials: process.env.FAL_KEY });

let styleReferenceUrl: string | null = null;

function poseNameToSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u2013\u2014]/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseArgs(): { force: Set<string>; only: Set<string> | null; limit: number | null } {
  const force = new Set<string>();
  let only: Set<string> | null = null;
  let limit: number | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--force=')) {
      arg.slice('--force='.length).split(',').forEach((s) => force.add(s.trim()));
    } else if (arg.startsWith('--only=')) {
      only = new Set(arg.slice('--only='.length).split(',').map((s) => s.trim()));
    } else if (arg.startsWith('--limit=')) {
      limit = Number(arg.slice('--limit='.length));
    }
  }
  return { force, only, limit };
}

async function getStyleReferenceUrl(): Promise<string> {
  if (styleReferenceUrl) return styleReferenceUrl;
  if (!fs.existsSync(STYLE_REFERENCE)) {
    throw new Error(`Style reference missing: ${STYLE_REFERENCE}`);
  }
  const bytes = fs.readFileSync(STYLE_REFERENCE);
  styleReferenceUrl = await fal.storage.upload(new Blob([bytes], { type: 'image/png' }));
  console.log(`Style reference uploaded: ${styleReferenceUrl}`);
  return styleReferenceUrl;
}

function buildPrompt(pose: PoseMeta): string {
  const propLine = pose.prop !== 'none' ? `Include ${pose.prop}.` : '';
  const interactionLine =
    pose.interaction !== 'none' ? `Garment interaction: ${pose.interaction}.` : '';

  return [
    'Keep the exact same monochrome charcoal pencil fashion illustration sketch style, linework quality, and editorial fashion figure drawing aesthetic.',
    'Change only the body pose and composition.',
    `New pose: ${pose.name}. ${pose.description}`,
    `Body state: ${pose.bodyState}. Preferred framing: ${pose.preferredFraming}.`,
    `Energy: ${pose.energy}. Expression: ${pose.expression}. Movement: ${pose.movement}.`,
    `Camera: ${pose.cameraRelationship}. Geometry: ${pose.bodyGeometry.join(', ')}.`,
    interactionLine,
    propLine,
    'Single female fashion model in tailored blazer and wide-leg trousers unless pose requires otherwise.',
    'Pure transparent background, no color, no text, no labels, no watermark, no UI, no photo realism.',
  ]
    .filter(Boolean)
    .join(' ');
}

function extractUrl(data: Record<string, unknown> | undefined): string | null {
  const candidates: unknown[] = [
    (data?.images as Array<{ url: string }> | undefined)?.[0]?.url,
    (data?.image as { url?: string } | undefined)?.url,
    data?.image_url,
    data?.url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function generatePose(pose: PoseMeta, slug: string): Promise<void> {
  const referenceUrl = await getStyleReferenceUrl();
  const prompt = buildPrompt(pose);
  const seed = 5000 + POSES.indexOf(pose);

  console.log(`\n▶ Generating ${pose.name} (${slug})…`);

  const kontext = await fal.subscribe('fal-ai/flux-pro/kontext', {
    input: {
      prompt,
      image_url: referenceUrl,
      guidance_scale: 3.5,
      output_format: 'png',
      seed,
    },
    logs: false,
  });

  const kontextUrl = extractUrl(kontext.data as Record<string, unknown>);
  if (!kontextUrl) throw new Error('Kontext returned no image URL');

  const cutout = await fal.subscribe('fal-ai/birefnet', {
    input: {
      image_url: kontextUrl,
      model: 'General Use (Light)',
      output_format: 'png',
      operating_resolution: '2048x2048',
      refine_foreground: true,
    },
    logs: false,
  });

  const pngUrl = extractUrl(cutout.data as Record<string, unknown>);
  if (!pngUrl) throw new Error('BirefNet returned no image URL');

  const buffer = await download(pngUrl);
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.png`), buffer);
  console.log(`✓ Saved ${slug}.png (${buffer.length} bytes)`);
}

async function main(): Promise<void> {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY is required');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { force, only, limit } = parseArgs();

  let queue = POSES.map((pose) => ({ pose, slug: poseNameToSlug(pose.name) }));

  if (only) {
    queue = queue.filter(({ slug }) => only.has(slug));
  }

  queue = queue.filter(({ slug }) => {
    const exists = fs.existsSync(path.join(OUT_DIR, `${slug}.png`));
    return force.has(slug) || !exists;
  });

  if (limit != null) {
    queue = queue.slice(0, limit);
  }

  console.log(`Generating ${queue.length} pose illustration(s) with Kontext style reference…`);

  const failures: string[] = [];
  for (const { pose, slug } of queue) {
    try {
      await generatePose(pose, slug);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`✗ Failed ${slug}: ${msg}`);
      failures.push(`${pose.name} (${slug}): ${msg}`);
    }
  }

  if (failures.length > 0) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exitCode = 1;
  } else {
    console.log('\nAll requested illustrations generated.');
  }
}

main();
