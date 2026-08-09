import layoutTemplates from '@/data/contact-sheet-layout-templates.json';
import type {
  ContactSheetPageSlotRect,
  ContactSheetSlotRect,
  MasterContactSheetSlot,
} from '@/lib/contact-sheet-layout-types';

/** Eight fixed page coordinate sets extracted from Layout.pdf (810×810 pt). */
export const CONTACT_SHEET_PAGE_TEMPLATES: readonly ContactSheetPageSlotRect[][] =
  layoutTemplates;

/** Layout.pdf slot counts — pages 1–5: 9 each; pages 6–8: 10 each (75 total). */
export const CONTACT_SHEET_SLOTS_PER_TEMPLATE: readonly number[] = [
  9, 9, 9, 9, 9, 10, 10, 10,
];

/** PDF artboard pages stacked into one continuous canvas (810 × 6480 pt). */
export const CONTACT_SHEET_PAGE_COUNT = CONTACT_SHEET_PAGE_TEMPLATES.length;

export const CONTACT_SHEET_POSE_COUNT = 75;

/** Map a page-local PDF rectangle to the continuous master canvas (%). */
export function flattenPageRectToCanvas(
  templateIndex: number,
  pageRect: ContactSheetPageSlotRect,
): ContactSheetSlotRect {
  return {
    left: pageRect.left,
    top: (templateIndex * 100 + pageRect.top) / CONTACT_SHEET_PAGE_COUNT,
    width: pageRect.width,
    height: pageRect.height / CONTACT_SHEET_PAGE_COUNT,
  };
}

/** Authoritative flattened slot → pose map for the continuous contact sheet. */
export const MASTER_CONTACT_SHEET_SLOTS: readonly MasterContactSheetSlot[] = (() => {
  const slots: MasterContactSheetSlot[] = [];
  let slotId = 1;
  let poseIndex = 0;

  for (
    let templateIndex = 0;
    templateIndex < CONTACT_SHEET_PAGE_TEMPLATES.length;
    templateIndex++
  ) {
    const pageTemplate = CONTACT_SHEET_PAGE_TEMPLATES[templateIndex]!;
    const slotCount = CONTACT_SHEET_SLOTS_PER_TEMPLATE[templateIndex] ?? pageTemplate.length;

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
      if (poseIndex >= CONTACT_SHEET_POSE_COUNT) {
        return slots;
      }

      const pageRect = pageTemplate[slotIndex]!;
      slots.push({
        slotId,
        poseIndex,
        templateId: templateIndex + 1,
        slotIndex,
        rect: flattenPageRectToCanvas(templateIndex, pageRect),
      });

      slotId++;
      poseIndex++;
    }
  }

  return slots;
})();

/** Canvas aspect ratio width:height (810 pt wide × 6480 pt tall). */
export const CONTACT_SHEET_CANVAS_ASPECT_RATIO = `1 / ${CONTACT_SHEET_PAGE_COUNT}`;

export function getMasterContactSheetSlots(): readonly MasterContactSheetSlot[] {
  return MASTER_CONTACT_SHEET_SLOTS;
}

export function getMasterContactSheetSlotForPose(
  poseIndex: number,
): MasterContactSheetSlot | null {
  return (
    MASTER_CONTACT_SHEET_SLOTS.find((slot) => slot.poseIndex === poseIndex) ?? null
  );
}

export function getMasterContactSheetSlotById(
  slotId: number,
): MasterContactSheetSlot | null {
  return MASTER_CONTACT_SHEET_SLOTS.find((slot) => slot.slotId === slotId) ?? null;
}

/** Slots grouped by PDF page — metadata only, not for visual section rendering. */
export function getContactSheetSlotsByTemplate(): MasterContactSheetSlot[][] {
  const groups: MasterContactSheetSlot[][] = CONTACT_SHEET_PAGE_TEMPLATES.map(() => []);

  for (const slot of MASTER_CONTACT_SHEET_SLOTS) {
    groups[slot.templateId - 1]!.push(slot);
  }

  return groups;
}

export interface ContactSheetLayoutValidation {
  totalSlots: number;
  slotsPerTemplate: number[];
  slotIds: number[];
  poseIndices: number[];
}

export function validateContactSheetLayout(): ContactSheetLayoutValidation {
  const slotsPerTemplate = CONTACT_SHEET_SLOTS_PER_TEMPLATE.map((expected, templateIndex) => {
    const actual = MASTER_CONTACT_SHEET_SLOTS.filter(
      (slot) => slot.templateId === templateIndex + 1,
    ).length;
    if (actual !== expected) {
      throw new Error(
        `Contact sheet template ${templateIndex + 1} expected ${expected} slots, found ${actual}.`,
      );
    }
    return actual;
  });

  const totalSlots = MASTER_CONTACT_SHEET_SLOTS.length;
  if (totalSlots !== CONTACT_SHEET_POSE_COUNT) {
    throw new Error(
      `Contact sheet expected ${CONTACT_SHEET_POSE_COUNT} slots, found ${totalSlots}.`,
    );
  }

  const slotIds = MASTER_CONTACT_SHEET_SLOTS.map((slot) => slot.slotId);
  const poseIndices = MASTER_CONTACT_SHEET_SLOTS.map((slot) => slot.poseIndex);

  for (let index = 0; index < totalSlots; index++) {
    const slot = MASTER_CONTACT_SHEET_SLOTS[index]!;
    const expectedSlotId = index + 1;
    const expectedPoseIndex = index;

    if (slot.slotId !== expectedSlotId) {
      throw new Error(
        `Slot sequence break: index ${index} has slotId ${slot.slotId}, expected ${expectedSlotId}.`,
      );
    }

    if (slot.poseIndex !== expectedPoseIndex) {
      throw new Error(
        `Pose mapping break: slot ${slot.slotId} maps to poseIndex ${slot.poseIndex}, expected ${expectedPoseIndex}.`,
      );
    }
  }

  const uniqueSlotIds = new Set(slotIds);
  if (uniqueSlotIds.size !== totalSlots) {
    throw new Error('Duplicate contact sheet slot IDs detected.');
  }

  const uniquePoseIndices = new Set(poseIndices);
  if (uniquePoseIndices.size !== totalSlots) {
    throw new Error('Duplicate contact sheet pose mappings detected.');
  }

  const coordinateKeys = new Set<string>();
  for (const slot of MASTER_CONTACT_SHEET_SLOTS) {
    const { left, top, width, height } = slot.rect;
    const key = `${left}|${top}|${width}|${height}|${slot.templateId}|${slot.slotIndex}`;
    if (coordinateKeys.has(key)) {
      throw new Error(`Duplicate slot coordinates detected for slot ${slot.slotId}.`);
    }
    coordinateKeys.add(key);
  }

  return {
    totalSlots,
    slotsPerTemplate,
    slotIds,
    poseIndices,
  };
}

if (import.meta.env.DEV) {
  validateContactSheetLayout();
}
