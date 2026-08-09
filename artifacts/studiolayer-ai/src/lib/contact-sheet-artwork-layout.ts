import artworkData from '@/data/contact-sheet-artwork-slots.json';
import type { ContactSheetSlotRect } from '@/lib/contact-sheet-layout-types';

export interface ArtworkTemplateSlot {
  slotId: number;
  poseIndex: number;
  templateId: number;
  slotIndex: number;
  rect: ContactSheetSlotRect;
}

export interface ArtworkTemplate {
  templateId: number;
  artworkUrl: string;
  slots: ArtworkTemplateSlot[];
}

/** Slot counts per supplied artwork template (derived from PNG alpha at build time). */
export const ARTWORK_SLOTS_PER_TEMPLATE: readonly number[] = [9, 9, 9, 9, 9, 10, 10, 10];

export const ARTWORK_TEMPLATE_URLS: readonly string[] = [
  '/contact-sheet-artwork/T1.png',
  '/contact-sheet-artwork/T2.png',
  '/contact-sheet-artwork/T3.png',
  '/contact-sheet-artwork/T4.png',
  '/contact-sheet-artwork/T5.png',
  '/contact-sheet-artwork/T6.png',
  '/contact-sheet-artwork/T7.png',
  '/contact-sheet-artwork/T8.png',
];

/** 75 pose slots mapped to transparent regions in the supplied artwork PNGs. */
export const MASTER_ARTWORK_CONTACT_SHEET_SLOTS: readonly ArtworkTemplateSlot[] =
  artworkData.master;

export function getArtworkContactSheetTemplates(): ArtworkTemplate[] {
  const templates: ArtworkTemplate[] = ARTWORK_TEMPLATE_URLS.map((artworkUrl, index) => ({
    templateId: index + 1,
    artworkUrl,
    slots: [],
  }));

  for (const slot of MASTER_ARTWORK_CONTACT_SHEET_SLOTS) {
    templates[slot.templateId - 1]!.slots.push(slot);
  }

  return templates;
}

export function getMasterArtworkContactSheetSlots(): readonly ArtworkTemplateSlot[] {
  return MASTER_ARTWORK_CONTACT_SHEET_SLOTS;
}

export function validateArtworkContactSheetLayout(): {
  totalSlots: number;
  slotsPerTemplate: number[];
} {
  const slotsPerTemplate = ARTWORK_SLOTS_PER_TEMPLATE.map((expected, templateIndex) => {
    const actual = MASTER_ARTWORK_CONTACT_SHEET_SLOTS.filter(
      (slot) => slot.templateId === templateIndex + 1,
    ).length;
    if (actual !== expected) {
      throw new Error(
        `Artwork template ${templateIndex + 1} expected ${expected} slots, found ${actual}.`,
      );
    }
    return actual;
  });

  const totalSlots = MASTER_ARTWORK_CONTACT_SHEET_SLOTS.length;
  if (totalSlots !== 75) {
    throw new Error(`Artwork contact sheet expected 75 slots, found ${totalSlots}.`);
  }

  for (let index = 0; index < totalSlots; index++) {
    const slot = MASTER_ARTWORK_CONTACT_SHEET_SLOTS[index]!;
    if (slot.slotId !== index + 1) {
      throw new Error(
        `Artwork slot sequence break at index ${index}: slotId ${slot.slotId}, expected ${index + 1}.`,
      );
    }
  }

  const poseIndices = MASTER_ARTWORK_CONTACT_SHEET_SLOTS.map((slot) => slot.poseIndex);
  const uniquePoseIndices = new Set(poseIndices);
  if (uniquePoseIndices.size !== totalSlots) {
    throw new Error('Artwork contact sheet has duplicate pose assignments.');
  }
  for (let poseIndex = 0; poseIndex < totalSlots; poseIndex++) {
    if (!uniquePoseIndices.has(poseIndex)) {
      throw new Error(`Artwork contact sheet missing pose assignment for poseIndex ${poseIndex}.`);
    }
  }

  return { totalSlots, slotsPerTemplate };
}

if (import.meta.env.DEV) {
  validateArtworkContactSheetLayout();
}
