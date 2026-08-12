/**
 * Canonical 75-pose system generator — Pose Master worksheet authoritative.
 *
 * Authority: StudioLayer_75_Pose_Master_Specification_v3_VISUALLY_VERIFIED.xlsx
 *            → worksheet "Pose Master" only (exported to pose-master-v3-source.json)
 *
 * Pose ID is the primary identity. No similarity matching, greedy bridging,
 * or cross-pose inference.
 *
 * Run: pnpm --filter @workspace/studiolayer-ai exec tsx scripts/generate-canonical-pose-system.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import masterSource from '../src/data/pose-master-v3-source.json';
import editorialLayout from '../src/data/pose-editorial-layout-v3.json';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'src/data');
const API_INTEL_DIR = path.resolve(ROOT, '../api-server/src/intelligence');
const PUBLIC_POSES = path.join(ROOT, 'public/pose-references');

interface PoseMasterRecord {
  'Pose ID': string;
  'Pose Name': string;
  Gender: string;
  'Current Excel Description': string | null;
  'Definition Status': string | null;
  'Body State': string;
  'Support / Surface': string | null;
  'Intrinsic Object': string | null;
  'Torso Position': string | null;
  'Torso Orientation': string | null;
  'Head Position': string | null;
  'Head Orientation': string | null;
  'Gaze Direction': string | null;
  'Left Arm — Position': string | null;
  'Left Elbow — Position': string | null;
  'Left Hand — Position / Contact': string | null;
  'Right Arm — Position': string | null;
  'Right Elbow — Position': string | null;
  'Right Hand — Position / Contact': string | null;
  'Left Leg — Position': string | null;
  'Left Knee — Position': string | null;
  'Left Foot — Position / Contact': string | null;
  'Right Leg — Position': string | null;
  'Right Knee — Position': string | null;
  'Right Foot — Position / Contact': string | null;
  'Weight Distribution / Body Support': string | null;
  'Critical Pose Anchors': string | null;
  'Flexible Details': string | null;
  'Forbidden Variants': string | null;
  'Mirror / Left-Right Rule': string | null;
  'Garment Interaction': string | null;
  'Camera / Framing Notes': string | null;
  'Prompt-Ready Pose Definition': string;
}

type BodyState =
  | 'standing'
  | 'walking'
  | 'seated'
  | 'perched'
  | 'leaning'
  | 'kneeling'
  | 'crouching'
  | 'floor_seated'
  | 'reclining'
  | 'transitional';

type PoseProp = 'none' | 'stool' | 'chair' | 'wall' | 'step';

function poseNum(id: string): number {
  return Number(id.replace(/^Pose/i, ''));
}

function text(value: string | null | undefined): string {
  return (value ?? '').toString().trim();
}

function mapBodyState(raw: string): BodyState {
  const s = raw.toLowerCase();
  if (s.includes('floor reclining') || s.includes('reclined') || s.includes('reclining')) {
    return 'reclining';
  }
  if (s.includes('floor seated') || s.includes('floor')) return 'floor_seated';
  if (s.includes('kneel')) return 'kneeling';
  if (s.includes('crouch')) return 'crouching';
  if (s.includes('half-seated') || s.includes('perch')) return 'perched';
  if (s.includes('lean')) return 'leaning';
  if (s.includes('walk') || s.includes('leap') || s.includes('suspend')) return 'walking';
  if (s.includes('seated') || s.includes('sit')) return 'seated';
  if (s.includes('pause') || s.includes('transitional')) return 'transitional';
  return 'standing';
}

function mapProp(intrinsic: string | null | undefined): PoseProp {
  const v = text(intrinsic).toLowerCase();
  if (v === 'stool') return 'stool';
  if (v === 'chair') return 'chair';
  if (v === 'wall') return 'wall';
  if (v === 'block' || v === 'step') return 'step';
  return 'none';
}

function mapGenderPool(gender: string): 'female' | 'male' {
  return gender.toLowerCase() === 'male' ? 'male' : 'female';
}

function mapOrientation(raw: string | null | undefined): 'front' | 'three_quarter' | 'profile' | 'rear' {
  const s = text(raw).toLowerCase();
  if (s.includes('rear') || s.includes('back')) return 'rear';
  if (s.includes('profile') || s.includes('side')) return 'profile';
  if (s.includes('three-quarter') || s.includes('three quarter')) return 'three_quarter';
  return 'front';
}

function mapFraming(notes: string | null | undefined): 'full_body' | 'three_quarter_body' | 'portrait' {
  const s = text(notes).toLowerCase();
  if (s.includes('portrait') || s.includes('chest') || s.includes('close') || s.includes('detail')) {
    return 'portrait';
  }
  if (s.includes('three-quarter body') || s.includes('knee')) return 'three_quarter_body';
  return 'full_body';
}

function mapPoseFamily(bodyState: BodyState, orientation: string, intrinsic: string): string {
  const prop = mapProp(intrinsic);
  if (bodyState === 'walking') return 'walking_motion';
  if (bodyState === 'seated' || bodyState === 'floor_seated' || bodyState === 'perched') {
    return prop !== 'none' ? 'prop_interaction' : 'seated';
  }
  if (bodyState === 'leaning') return 'leaning_environmental';
  if (bodyState === 'kneeling' || bodyState === 'crouching' || bodyState === 'reclining') {
    return 'body_level_variation';
  }
  if (orientation === 'rear') return 'rear_back_presentation';
  if (orientation === 'profile') return 'profile_presentation';
  if (orientation === 'three_quarter') return 'three_quarter_s_twist';
  return 'catalog_front_presentation';
}

function mapCategory(bodyState: BodyState, framing: string): string {
  if (framing === 'portrait') return 'Portrait';
  if (bodyState === 'seated' || bodyState === 'floor_seated' || bodyState === 'perched') return 'Seated';
  if (bodyState === 'walking' || bodyState === 'transitional') return 'Movement';
  if (bodyState === 'leaning' || bodyState === 'kneeling' || bodyState === 'reclining') return 'Editorial';
  return 'Core Full-Body Fashion';
}

function buildDetailedDescription(record: PoseMasterRecord): string {
  const intrinsic = text(record['Intrinsic Object']);
  const intrinsicLine =
    intrinsic && intrinsic.toLowerCase() !== 'none'
      ? `INTRINSIC OBJECT (required for this pose only): ${intrinsic}`
      : 'INTRINSIC OBJECT: None — do not invent chairs, stools, bags, furniture, or lifestyle props.';

  const sections = [
    `PROMPT-READY DEFINITION:\n${text(record['Prompt-Ready Pose Definition'])}`,
    `BODY STATE: ${text(record['Body State'])}`,
    `SUPPORT / SURFACE: ${text(record['Support / Surface'])}`,
    intrinsicLine,
    `TORSO: ${text(record['Torso Position'])}; orientation ${text(record['Torso Orientation'])}`,
    `HEAD: ${text(record['Head Position'])}; orientation ${text(record['Head Orientation'])}`,
    `GAZE: ${text(record['Gaze Direction'])}`,
    `LEFT ARM: ${text(record['Left Arm — Position'])}; elbow ${text(record['Left Elbow — Position'])}; hand ${text(record['Left Hand — Position / Contact'])}`,
    `RIGHT ARM: ${text(record['Right Arm — Position'])}; elbow ${text(record['Right Elbow — Position'])}; hand ${text(record['Right Hand — Position / Contact'])}`,
    `LEFT LEG: ${text(record['Left Leg — Position'])}; knee ${text(record['Left Knee — Position'])}; foot ${text(record['Left Foot — Position / Contact'])}`,
    `RIGHT LEG: ${text(record['Right Leg — Position'])}; knee ${text(record['Right Knee — Position'])}; foot ${text(record['Right Foot — Position / Contact'])}`,
    `WEIGHT / SUPPORT: ${text(record['Weight Distribution / Body Support'])}`,
    `CRITICAL POSE ANCHORS: ${text(record['Critical Pose Anchors'])}`,
    `FLEXIBLE DETAILS: ${text(record['Flexible Details'])}`,
    `FORBIDDEN VARIANTS: ${text(record['Forbidden Variants'])}`,
    `MIRRORING RULE: ${text(record['Mirror / Left-Right Rule'])}`,
    `GARMENT INTERACTION: ${text(record['Garment Interaction'])}`,
    `CAMERA / FRAMING: ${text(record['Camera / Framing Notes'])}`,
    'STUDIO DELIVERY: Pure white seamless studio background. Include only the Intrinsic Object listed above when it is not None. Do not invent handbags, furniture, decorative objects, or lifestyle scenery beyond that intrinsic object.',
  ];

  return sections.filter((s) => !s.endsWith(': ') && !s.includes(': ;')).join('\n');
}

function expectedFilename(poseId: string, pngs: string[]): string {
  const exact = pngs.find((f) => f.replace(/\.png$/i, '') === poseId);
  if (exact) return exact;
  const lower = poseId.toLowerCase();
  return pngs.find((f) => f.replace(/\.png$/i, '').toLowerCase() === lower) ?? `${poseId}.png`;
}

function buildCatalogSpec(record: PoseMasterRecord, filename: string) {
  const bodyState = mapBodyState(record['Body State']);
  const prop = mapProp(record['Intrinsic Object']);
  const preferredFraming = mapFraming(record['Camera / Framing Notes']);
  const isPortrait = preferredFraming === 'portrait';
  const orientation = mapOrientation(record['Torso Orientation']);
  const genderPool = mapGenderPool(record.Gender);
  const poseFamily = mapPoseFamily(bodyState, orientation, text(record['Intrinsic Object']));
  const description = buildDetailedDescription(record);

  return {
    poseId: record['Pose ID'],
    name: record['Pose Name'],
    description,
    shortDescription: text(record['Current Excel Description']) || text(record['Prompt-Ready Pose Definition']),
    promptReadyDefinition: text(record['Prompt-Ready Pose Definition']),
    category: mapCategory(bodyState, preferredFraming),
    bodyState,
    bodyGeometry: [
      bodyState,
      orientation,
      prop !== 'none' ? prop : 'no_support_prop',
    ],
    cameraRelationship: isPortrait ? 'portrait editorial framing' : 'full-body editorial framing',
    preferredFraming,
    energy: bodyState === 'walking' ? 'dynamic' : 'elegant',
    expression: 'neutral',
    movement: bodyState === 'walking' ? 'dynamic' : 'static',
    interaction: prop === 'none' ? text(record['Garment Interaction']) || 'none' : prop,
    prop,
    editorialIntensity: isPortrait ? 3 : 2,
    coveragePurpose: isPortrait ? ['portrait'] : ['front', 'three_quarter'],
    genderPool,
    collections: ['hero', 'campaign', 'editorial'],
    garmentCategories: 'all',
    garmentTags: ['editorial', 'commercial'],
    avoidForTags: [] as string[],
    poseFamily,
    selectionClass: 'contextual',
    exposure: { heroEligible: true, campaignEligible: true, editorialEligible: true },
    stance:
      bodyState === 'seated' || bodyState === 'floor_seated' || bodyState === 'perched' || bodyState === 'reclining'
        ? 'sitting'
        : bodyState === 'walking'
          ? 'movement'
          : 'standing',
    cameraAngle: isPortrait ? 'front' : orientation === 'front' ? 'front' : orientation === 'rear' ? 'rear' : orientation === 'profile' ? 'profile' : 'three_quarter',
    bodyOrientation: orientation,
    fabricMovement: bodyState === 'walking' ? 'moderate' : 'none',
    accessoriesAllowed: true,
    requiresPockets:
      text(record['Left Hand — Position / Contact']).toLowerCase().includes('pocket')
      || text(record['Right Hand — Position / Contact']).toLowerCase().includes('pocket')
      || text(record['Prompt-Ready Pose Definition']).toLowerCase().includes('pocket'),
    heroPriority: 5,
    suitabilityScore: 8,
    poseReferenceImage: null,
    active: true,
    gender: record.Gender,
    filename,
    visualPath: `/pose-references/${filename}`,
    mirroringRule: text(record['Mirror / Left-Right Rule']),
    forbiddenVariants: text(record['Forbidden Variants']),
    criticalPoseAnchors: text(record['Critical Pose Anchors']),
    intrinsicObject: text(record['Intrinsic Object']) || 'None',
    supportSurface: text(record['Support / Surface']),
    definitionStatus: text(record['Definition Status']),
    poseMaster: {
      bodyState: text(record['Body State']),
      supportSurface: text(record['Support / Surface']),
      intrinsicObject: text(record['Intrinsic Object']) || 'None',
      torsoPosition: text(record['Torso Position']),
      torsoOrientation: text(record['Torso Orientation']),
      headPosition: text(record['Head Position']),
      headOrientation: text(record['Head Orientation']),
      gaze: text(record['Gaze Direction']),
      leftArm: text(record['Left Arm — Position']),
      leftElbow: text(record['Left Elbow — Position']),
      leftHand: text(record['Left Hand — Position / Contact']),
      rightArm: text(record['Right Arm — Position']),
      rightElbow: text(record['Right Elbow — Position']),
      rightHand: text(record['Right Hand — Position / Contact']),
      leftLeg: text(record['Left Leg — Position']),
      leftKnee: text(record['Left Knee — Position']),
      leftFoot: text(record['Left Foot — Position / Contact']),
      rightLeg: text(record['Right Leg — Position']),
      rightKnee: text(record['Right Knee — Position']),
      rightFoot: text(record['Right Foot — Position / Contact']),
      weightDistribution: text(record['Weight Distribution / Body Support']),
      criticalPoseAnchors: text(record['Critical Pose Anchors']),
      flexibleDetails: text(record['Flexible Details']),
      forbiddenVariants: text(record['Forbidden Variants']),
      mirroringRule: text(record['Mirror / Left-Right Rule']),
      garmentInteraction: text(record['Garment Interaction']),
      cameraFraming: text(record['Camera / Framing Notes']),
      promptReadyDefinition: text(record['Prompt-Ready Pose Definition']),
    },
  };
}

function buildBoardLayout() {
  const placementsByPoseId: Record<string, object> = {};
  const v3 = editorialLayout.placements as Record<
    string,
    {
      poseId: string;
      left: number;
      top: number;
      width: number;
      height: number;
      zIndex: number;
      anchor?: { objectPosition?: string; transformOrigin?: string };
    }
  >;
  for (const placement of Object.values(v3)) {
    if (!placement?.poseId) continue;
    placementsByPoseId[placement.poseId] = {
      left: placement.left,
      top: placement.top,
      width: placement.width,
      height: placement.height,
      zIndex: placement.zIndex,
      objectPosition: placement.anchor?.objectPosition ?? 'center bottom',
      transformOrigin: placement.anchor?.transformOrigin ?? 'center bottom',
    };
  }
  return {
    version: 'CANONICAL-POSE-MASTER-V3',
    generatedAt: new Date().toISOString(),
    boardAspectRatio: editorialLayout.canvasAspectRatio,
    placements: placementsByPoseId,
  };
}

function main(): void {
  const records = (masterSource.records as PoseMasterRecord[])
    .slice()
    .sort((a, b) => poseNum(a['Pose ID']) - poseNum(b['Pose ID']));

  const pngs = fs.existsSync(PUBLIC_POSES)
    ? fs.readdirSync(PUBLIC_POSES).filter((f) => f.toLowerCase().endsWith('.png'))
    : [];

  if (records.length !== 75) {
    throw new Error(`Expected 75 Pose Master records, got ${records.length}`);
  }

  for (let i = 0; i < 75; i++) {
    const expected = `Pose${i + 1}`;
    const actual = records[i]!['Pose ID'];
    if (actual !== expected) {
      throw new Error(`Pose Master order/identity mismatch at index ${i}: expected ${expected}, got ${actual}`);
    }
    if (!text(records[i]!['Prompt-Ready Pose Definition'])) {
      throw new Error(`${expected} missing Prompt-Ready Pose Definition`);
    }
  }

  const specs = records.map((record) => {
    const filename = expectedFilename(record['Pose ID'], pngs);
    return buildCatalogSpec(record, filename);
  });

  const registry = {
    version: 'CANONICAL-POSE-MASTER-V3',
    generatedAt: new Date().toISOString(),
    source: masterSource.source,
    authoritativeWorksheet: 'Pose Master',
    authoritativeExcelPath:
      'Pose Master/StudioLayer_75_Pose_Master_Specification_v3_VISUALLY_VERIFIED.xlsx',
    totalPoses: 75,
    poses: specs,
  };

  const poseIdToName = Object.fromEntries(specs.map((s) => [s.poseId, s.name]));
  // First-write-wins for duplicate names (Pose8 / Pose42) — Pose ID remains primary key.
  const nameToPoseId: Record<string, string> = {};
  for (const s of specs) {
    if (!nameToPoseId[s.name]) nameToPoseId[s.name] = s.poseId;
  }
  const nameToFilename = Object.fromEntries(specs.map((s) => [s.name, s.filename]));
  const referenceImages = Object.fromEntries(
    specs.flatMap((s) => [
      [s.poseId, s.visualPath],
      [s.name, s.visualPath],
    ]),
  );
  const libraryNames = specs.map((s) => s.name);

  const bridge = {
    version: 'CANONICAL-POSE-MASTER-V3',
    generatedAt: new Date().toISOString(),
    note: '1:1 Pose Master Pose ID → canonical pose name. No similarity matching.',
    poseIdToCatalogName: poseIdToName,
    catalogNameToPoseId: nameToPoseId,
    catalogNameToFilename: nameToFilename,
  };

  const illustrationManifest = {
    version: 'CANONICAL-POSE-MASTER-V3',
    generatedAt: new Date().toISOString(),
    sourceExcel: masterSource.source,
    authoritativeWorksheet: 'Pose Master',
    totalPoses: 75,
    poses: specs.map((s) => ({
      poseId: s.poseId,
      filename: s.filename,
      poseName: s.name,
      gender: s.gender,
      description: s.shortDescription,
      catalogPoseName: s.name,
      observedGender: s.gender,
      primaryFamily: s.category,
      visualArchetype: s.bodyGeometry[0] ?? null,
      secondaryTags: [s.bodyState, s.prop].filter((t) => t && t !== 'none'),
      framing: s.preferredFraming,
      visualNotes: null,
      metadataImageConflicts: null,
      genderConflict: null,
    })),
  };

  const boardLayout = buildBoardLayout();

  fs.writeFileSync(path.join(DATA_DIR, 'pose-canonical-registry.json'), JSON.stringify(registry, null, 2));
  fs.writeFileSync(path.join(API_INTEL_DIR, 'pose-canonical-registry.json'), JSON.stringify(registry, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'pose-catalog-bridge.json'), JSON.stringify(bridge, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'pose-library-names.json'), JSON.stringify(libraryNames, null, 2));
  fs.writeFileSync(
    path.join(DATA_DIR, 'pose-reference-manifest.json'),
    JSON.stringify({ version: 'CANONICAL-POSE-MASTER-V3', generatedAt: new Date().toISOString(), images: referenceImages }, null, 2),
  );
  fs.writeFileSync(path.join(DATA_DIR, 'pose-illustration-manifest.json'), JSON.stringify(illustrationManifest, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'pose-canonical-board-layout.json'), JSON.stringify(boardLayout, null, 2));

  // Keep a compact identity table for tooling — Pose Master is still the authority.
  fs.writeFileSync(
    path.join(DATA_DIR, 'pose-excel-source.json'),
    JSON.stringify(
      {
        source: masterSource.source,
        authoritativeWorksheet: 'Pose Master',
        authoritativePath:
          'Pose Master/StudioLayer_75_Pose_Master_Specification_v3_VISUALLY_VERIFIED.xlsx',
        reconciledAt: new Date().toISOString(),
        records: records.map((r) => ({
          poseNo: r['Pose ID'],
          poseName: r['Pose Name'],
          gender: r.Gender,
          description: text(r['Prompt-Ready Pose Definition']),
        })),
      },
      null,
      2,
    ),
  );

  const pose29 = specs.find((s) => s.poseId === 'Pose29');
  console.log('Canonical poses:', specs.length);
  console.log('Pose29 name:', pose29?.name);
  console.log('Pose29 bodyState:', pose29?.bodyState, 'prop:', pose29?.prop);
  console.log('Pose29 description starts with:', pose29?.description.slice(0, 120));
  console.log('Board placements:', Object.keys(boardLayout.placements).length);
  console.log('Female / Male:', specs.filter((s) => s.genderPool === 'female').length, '/', specs.filter((s) => s.genderPool === 'male').length);
}

main();
