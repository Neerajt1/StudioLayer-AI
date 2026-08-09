/** Fixed slot rectangle — percentages of the master contact-sheet canvas. */
export interface ContactSheetSlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Page-local slot rectangle from Layout.pdf (810×810 pt pages). */
export interface ContactSheetPageSlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Explicit master-map entry: one immutable slot → one pose at one coordinate. */
export interface MasterContactSheetSlot {
  /** 1-based immutable slot ID (01–75). */
  slotId: number;
  /** 0-based pose index into the 75-pose display catalog. */
  poseIndex: number;
  /** 1-based PDF page metadata (no visual effect). */
  templateId: number;
  /** 0-based slot index within the PDF page. */
  slotIndex: number;
  /** Absolute position on the continuous master canvas (%). */
  rect: ContactSheetSlotRect;
}

/** @deprecated Use MasterContactSheetSlot */
export interface ContactSheetPoseSlot {
  poseIndex: number;
  templateIndex: number;
  slotIndex: number;
  rect: ContactSheetSlotRect;
}
