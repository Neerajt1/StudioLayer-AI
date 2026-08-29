import type { BillingCycleLedgerStats } from "@workspace/studio-credit-engine";
import {
  creditCostPerImageAtResolution,
  fromCreditMinorUnits,
  normalizeOutputResolution,
  toCreditMinorUnits,
} from "@workspace/studio-credit-engine";

/**
 * The per-image prices in force before the 1.5 / 3 economics. Used only for
 * rows that have no ledger charge to read, so an unreconciled render is never
 * presented at today's price. Historical data, not current pricing.
 */
const LEGACY_PER_IMAGE_CREDIT_PRICES = {
  "2K": 1,
  "4K": 2,
} as const;

/**
 * Every per-image generation price StudioLayer has charged, by resolution.
 * 1 and 2 were the original 2K and 4K prices; 1.5 and 3 are current. Extend
 * these lists if per-image pricing changes again — historical statements
 * depend on old prices remaining recognisable.
 */
const PER_IMAGE_CREDIT_PRICES_BY_RESOLUTION = {
  "2K": [1, 1.5],
  "4K": [2, 3],
} as const;

const ALL_PER_IMAGE_CREDIT_PRICES_MINOR_UNITS = new Set(
  [
    ...PER_IMAGE_CREDIT_PRICES_BY_RESOLUTION["2K"],
    ...PER_IMAGE_CREDIT_PRICES_BY_RESOLUTION["4K"],
  ].map(toCreditMinorUnits),
);

/**
 * Prices the session could plausibly have been charged per image.
 *
 * Narrowed by the recorded output resolution when any surviving render has
 * one, which removes most inference ambiguity. Sessions with no surviving
 * render, or rows predating resolution tracking, allow every historical price.
 */
function allowedPerImagePricesMinorUnits(
  roots: readonly SessionRootSlot[],
): ReadonlySet<number> {
  for (const slot of roots) {
    if (slot.render?.outputResolution) {
      const resolution = normalizeOutputResolution(
        slot.render.outputResolution,
      );
      return new Set(
        PER_IMAGE_CREDIT_PRICES_BY_RESOLUTION[resolution].map(
          toCreditMinorUnits,
        ),
      );
    }
  }
  return ALL_PER_IMAGE_CREDIT_PRICES_MINOR_UNITS;
}
import type {
  Render,
  RenderDeletionEvent,
  StudioCreditTransaction,
  User,
} from "@workspace/db";
import {
  deriveSessionActivityStatus,
  refinementRendersInSession,
  rendersForSession,
  resolveSessionIdForRender,
  resolveSessionIdForTransaction,
  type SessionActivityStatus,
} from "./billable-output.js";
import {
  formatMonthKey,
  isGenerationReasonCode,
  isRefinementReasonCode,
  isUsageReasonCode,
  refinementActionLabel,
} from "./labels.js";

export type ActivityType = "Generation" | "Refinement" | "Remove Background";
export type ActivityResult = "Completed" | "Failed" | "Unknown";

export interface CreativeActivityRow {
  activityId: string;
  dateTime: Date;
  generationSessionId: string;
  transactionId: string | null;
  activityType: ActivityType;
  generationType: string;
  batchAction: string;
  outputSequence: number;
  outputsRequested: number;
  outputLabel: string;
  renderId: number;
  parentRenderId: number | null;
  result: ActivityResult;
  billableImage: boolean;
  creditsUsed: number;
  sessionStatus: SessionActivityStatus;
  /** True when the render row no longer exists and activity is preserved from a deletion event. */
  imageDeleted?: boolean;
  /** True when a deleted render's terminal outcome cannot be established from existing data. */
  outcomeUnresolved?: boolean;
}

export interface UnmappedHistoricalTransaction {
  transactionId: string;
  transactionDbId: number;
  date: Date;
  amount: number;
  reasonCode: string;
  renderId: number | null;
  reason: string;
}

export interface MasterCreativeActivityResult {
  rows: CreativeActivityRow[];
  unmappedTransactions: UnmappedHistoricalTransaction[];
}

export interface CreativeActivityContext {
  user: Pick<User, "subscriptionTier">;
  cycleStart: Date;
  transactions: StudioCreditTransaction[];
  renders: Render[];
  deletionEvents: RenderDeletionEvent[];
}

function renderByIdMap(renders: readonly Render[]): Map<number, Render> {
  return new Map(renders.map((render) => [render.id, render]));
}

function isTerminalRenderStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}

function renderResult(render: Render): ActivityResult {
  return render.status === "completed" ? "Completed" : "Failed";
}

function generationTypeLabel(type: string): string {
  switch (type) {
    case "hero":
      return "Hero";
    case "campaign":
      return "Campaign";
    case "editorial":
      return "Editorial";
    default:
      return type;
  }
}

function findGenerationTransactionForSession(
  sessionId: string,
  ctx: CreativeActivityContext,
  renderById: ReadonlyMap<number, Render>,
): StudioCreditTransaction | undefined {
  return ctx.transactions.find(
    (tx) =>
      isGenerationReasonCode(tx.reasonCode) &&
      resolveSessionIdForTransaction(tx, renderById, ctx.deletionEvents) ===
        sessionId,
  );
}

function findRefinementTransactionForRender(
  renderId: number,
  transactions: readonly StudioCreditTransaction[],
): StudioCreditTransaction | undefined {
  return transactions.find(
    (tx) =>
      isRefinementReasonCode(tx.reasonCode) && tx.renderId === renderId,
  );
}

function resolveSessionIdForDeletionEvent(event: RenderDeletionEvent): string {
  return event.generationSessionId ?? `session-render-${event.renderId}`;
}

function isRootGenerationRenderId(
  renderId: number,
  renderById: ReadonlyMap<number, Render>,
  transactions: readonly StudioCreditTransaction[],
): boolean {
  const render = renderById.get(renderId);
  if (render) {
    return render.parentRenderId == null;
  }
  return findRefinementTransactionForRender(renderId, transactions) == null;
}

interface SessionRootSlot {
  renderId: number;
  render?: Render;
  deletionEvent?: RenderDeletionEvent;
}

interface SessionRefinementSlot {
  renderId: number;
  render?: Render;
  deletionEvent?: RenderDeletionEvent;
}

function collectSessionIds(ctx: CreativeActivityContext): Set<string> {
  const sessionIds = new Set<string>();

  for (const render of ctx.renders) {
    if (isTerminalRenderStatus(render.status)) {
      sessionIds.add(resolveSessionIdForRender(render));
    }
  }

  for (const event of ctx.deletionEvents) {
    sessionIds.add(resolveSessionIdForDeletionEvent(event));
  }

  return sessionIds;
}

function generationRootsForSession(
  sessionId: string,
  ctx: CreativeActivityContext,
  renderById: ReadonlyMap<number, Render>,
): SessionRootSlot[] {
  const slots = new Map<number, SessionRootSlot>();

  for (const render of rendersForSession(sessionId, ctx.renders)) {
    if (!isRootGenerationRender(render)) continue;
    if (!isTerminalRenderStatus(render.status)) continue;
    slots.set(render.id, { renderId: render.id, render });
  }

  for (const event of ctx.deletionEvents) {
    if (resolveSessionIdForDeletionEvent(event) !== sessionId) continue;
    if (slots.has(event.renderId)) continue;
    if (renderById.has(event.renderId)) continue;
    if (!isRootGenerationRenderId(event.renderId, renderById, ctx.transactions)) {
      continue;
    }
    slots.set(event.renderId, { renderId: event.renderId, deletionEvent: event });
  }

  return [...slots.values()].sort((left, right) => left.renderId - right.renderId);
}

function refinementsForSession(
  sessionId: string,
  ctx: CreativeActivityContext,
  renderById: ReadonlyMap<number, Render>,
): SessionRefinementSlot[] {
  const slots = new Map<number, SessionRefinementSlot>();

  for (const render of refinementRendersInSession(
    rendersForSession(sessionId, ctx.renders),
  )) {
    if (!isTerminalRenderStatus(render.status)) continue;
    slots.set(render.id, { renderId: render.id, render });
  }

  for (const event of ctx.deletionEvents) {
    if (resolveSessionIdForDeletionEvent(event) !== sessionId) continue;
    if (slots.has(event.renderId)) continue;
    if (renderById.has(event.renderId)) continue;
    if (!findRefinementTransactionForRender(event.renderId, ctx.transactions)) {
      continue;
    }
    slots.set(event.renderId, { renderId: event.renderId, deletionEvent: event });
  }

  return [...slots.values()].sort((left, right) => left.renderId - right.renderId);
}

function isRootGenerationRender(render: Render): boolean {
  return render.parentRenderId == null;
}

function activityResultForRefinementTransaction(
  tx: StudioCreditTransaction | undefined,
): ActivityResult {
  if (tx == null) {
    return "Failed";
  }
  return tx.amount < 0 ? "Completed" : "Failed";
}

interface RootSlotOutcome {
  result: ActivityResult;
  creditsUsed: number;
  outcomeUnresolved?: boolean;
}

function isKnownCompletedResult(result: ActivityResult): boolean {
  return result === "Completed";
}

function isKnownFailedResult(result: ActivityResult): boolean {
  return result === "Failed";
}

/**
 * Credits per completed generation image in this session.
 *
 * THE LEDGER IS THE SOURCE OF TRUTH. The batch charge is the only record of
 * what the customer actually paid, so the per-image price is recovered from it
 * rather than from today's prices — a batch charged 1 credit per image must
 * keep reporting 1 credit forever, even though a 2K image now costs 1.5.
 *
 * `renders.studio_credits_used` is deliberately NOT consulted. That column
 * holds the BATCH total repeated on every row in the batch, so reading it as a
 * per-image price would overstate every multi-image generation by the batch
 * size. See the column comment in migration 019.
 *
 * Recovering the price means choosing a divisor, and the divisor is the number
 * of images the charge covered. That is not simply the surviving completed
 * count: a completed image may since have been deleted, and the charge still
 * covers it. So the primary divisor is every root that could have completed —
 * survivors plus deleted slots — and the surviving count is tried only as a
 * fallback.
 *
 * The candidate prices are constrained to those StudioLayer has actually
 * charged at the recorded resolution. This is what makes the inference
 * defensible rather than a guess: a 2-credit charge on a 4K session resolves to
 * one image at 2, not two images at 1, because 1 has never been a 4K price.
 *
 * Arithmetic is in minor units so fractional prices stay exact: 600 units over
 * four images is exactly 150, where 6 / 4 in credits would not survive an
 * integer divisibility test.
 */
function resolveCreditsPerCompletedImage(
  roots: readonly SessionRootSlot[],
  txCredits: number,
  knownCompleted: number,
): number {
  const txMinorUnits = toCreditMinorUnits(txCredits);

  if (txMinorUnits > 0) {
    const allowed = allowedPerImagePricesMinorUnits(roots);
    const deletedCount = roots.filter((slot) => slot.render == null).length;

    for (const divisor of [knownCompleted + deletedCount, knownCompleted]) {
      if (divisor <= 0) continue;
      if (txMinorUnits % divisor !== 0) continue;
      const perImage = txMinorUnits / divisor;
      if (allowed.has(perImage)) {
        return fromCreditMinorUnits(perImage);
      }
    }
  }

  // No charge to read. This row cannot be reconciled against the ledger, and
  // the statement must not assert TODAY's price as though it had been charged:
  // that would silently reprice every unreconciled historical render whenever
  // generation pricing changes. Fall back to the legacy schedule instead and
  // let the reconciliation mismatch surface the row.
  for (const slot of roots) {
    if (slot.render?.outputResolution) {
      const resolution = normalizeOutputResolution(slot.render.outputResolution);
      return LEGACY_PER_IMAGE_CREDIT_PRICES[resolution];
    }
  }

  return LEGACY_PER_IMAGE_CREDIT_PRICES["2K"];
}

/**
 * Reconstructs per-root generation outcomes for a session.
 *
 * Surviving renders use terminal render status. Deleted roots are inferred only
 * from the generation ledger charge and surviving session evidence — never from
 * deletion-event originalCreditsConsumed (batch-level in production).
 */
function resolveSessionRootOutcomes(
  roots: readonly SessionRootSlot[],
  generationTx: StudioCreditTransaction | undefined,
): Map<number, RootSlotOutcome> {
  const outcomes = new Map<number, RootSlotOutcome>();
  const sorted = [...roots].sort((left, right) => left.renderId - right.renderId);

  const hasChargeTx = generationTx != null && generationTx.amount < 0;
  const txCredits = hasChargeTx ? Math.abs(generationTx!.amount) : 0;
  const zeroChargeBatch = generationTx != null && generationTx.amount >= 0;

  let knownCompleted = 0;
  for (const slot of sorted) {
    if (slot.render?.status === "completed") {
      knownCompleted += 1;
    }
  }

  const creditsPerImage = resolveCreditsPerCompletedImage(
    sorted,
    txCredits,
    knownCompleted,
  );

  if (hasChargeTx) {
    const deletedCount = sorted.filter((slot) => slot.render == null).length;
    const remainingCompletedQuota =
      (txCredits - knownCompleted * creditsPerImage) / creditsPerImage;
    const constraintViolated =
      !Number.isInteger(remainingCompletedQuota)
      || remainingCompletedQuota < 0
      || remainingCompletedQuota > deletedCount;

    let quota = constraintViolated ? 0 : remainingCompletedQuota;

    for (const slot of sorted) {
      if (slot.render) {
        outcomes.set(slot.renderId, {
          result:
            slot.render.status === "completed" ? "Completed" : "Failed",
          creditsUsed: 0,
        });
        continue;
      }

      if (constraintViolated) {
        outcomes.set(slot.renderId, {
          result: "Unknown",
          creditsUsed: 0,
          outcomeUnresolved: true,
        });
        continue;
      }

      if (quota > 0) {
        outcomes.set(slot.renderId, {
          result: "Completed",
          creditsUsed: 0,
        });
        quota -= 1;
      } else {
        outcomes.set(slot.renderId, {
          result: "Failed",
          creditsUsed: 0,
        });
      }
    }
  } else if (zeroChargeBatch) {
    for (const slot of sorted) {
      if (slot.render) {
        outcomes.set(slot.renderId, {
          result:
            slot.render.status === "completed" ? "Completed" : "Failed",
          creditsUsed: 0,
        });
      } else {
        outcomes.set(slot.renderId, {
          result: "Failed",
          creditsUsed: 0,
        });
      }
    }
  } else {
    for (const slot of sorted) {
      if (slot.render) {
        outcomes.set(slot.renderId, {
          result:
            slot.render.status === "completed" ? "Completed" : "Failed",
          creditsUsed: 0,
        });
      } else {
        outcomes.set(slot.renderId, {
          result: "Unknown",
          creditsUsed: 0,
          outcomeUnresolved: true,
        });
      }
    }
  }

  if (sorted.length === 1) {
    const slot = sorted[0]!;
    const outcome = outcomes.get(slot.renderId)!;
    if (isKnownCompletedResult(outcome.result)) {
      outcome.creditsUsed = hasChargeTx ? txCredits : creditsPerImage;
    }
    return outcomes;
  }

  if (hasChargeTx) {
    let creditsAssigned = 0;
    for (const slot of sorted) {
      const outcome = outcomes.get(slot.renderId)!;
      if (isKnownCompletedResult(outcome.result)) {
        const assign =
          creditsAssigned + creditsPerImage <= txCredits ? creditsPerImage : 0;
        outcome.creditsUsed = assign;
        creditsAssigned += assign;
      }
    }
    return outcomes;
  }

  if (!generationTx) {
    for (const slot of sorted) {
      const outcome = outcomes.get(slot.renderId)!;
      if (isKnownCompletedResult(outcome.result)) {
        outcome.creditsUsed = creditsPerImage;
      }
    }
  }

  return outcomes;
}

function rootOutcomeCountsFromResolved(
  roots: readonly SessionRootSlot[],
  outcomes: ReadonlyMap<number, RootSlotOutcome>,
): { requested: number; completed: number; failed: number } {
  let completed = 0;
  let failed = 0;

  for (const slot of roots) {
    const result = outcomes.get(slot.renderId)?.result ?? "Unknown";
    if (isKnownCompletedResult(result)) {
      completed += 1;
    } else {
      failed += 1;
    }
  }

  return {
    requested: roots.length,
    completed,
    failed,
  };
}

function generationBillableOutcome(
  slot: SessionRootSlot,
  outcomes: ReadonlyMap<number, RootSlotOutcome>,
): RootSlotOutcome {
  return (
    outcomes.get(slot.renderId) ?? {
      result: "Unknown",
      creditsUsed: 0,
      outcomeUnresolved: true,
    }
  );
}

function buildGenerationRow(
  slot: SessionRootSlot,
  sessionId: string,
  index: number,
  outputsRequested: number,
  sessionStatus: SessionActivityStatus,
  generationTx: StudioCreditTransaction | undefined,
  rootOutcomes: ReadonlyMap<number, RootSlotOutcome>,
): CreativeActivityRow {
  const render = slot.render;
  const event = slot.deletionEvent;
  const outcome = generationBillableOutcome(slot, rootOutcomes);
  const dateTime = generationActivityDate(generationTx, event, render);

  return {
    activityId: `render-${slot.renderId}`,
    dateTime,
    generationSessionId: sessionId,
    transactionId: generationTx?.transactionId ?? null,
    activityType: "Generation",
    generationType: render?.generationType ?? event!.generationType,
    batchAction: generationTypeLabel(
      render?.generationType ?? event!.generationType,
    ),
    outputSequence: index + 1,
    outputsRequested,
    outputLabel:
      outputsRequested > 0
        ? `${index + 1}/${outputsRequested}`
        : `${index + 1}/1`,
    renderId: slot.renderId,
    parentRenderId: null,
    result: outcome.result,
    billableImage: isKnownCompletedResult(outcome.result) && outcome.creditsUsed > 0,
    creditsUsed: outcome.creditsUsed,
    sessionStatus,
    ...(render == null ? { imageDeleted: true as const } : {}),
    ...(outcome.outcomeUnresolved ? { outcomeUnresolved: true as const } : {}),
  };
}
function generationActivityDate(
  generationTx: StudioCreditTransaction | undefined,
  event: RenderDeletionEvent | undefined,
  render: Render | undefined,
): Date {
  return render?.createdAt ?? generationTx?.createdAt ?? event?.deletedAt ?? new Date(0);
}

function refinementActivityDate(
  refinementTx: StudioCreditTransaction | undefined,
  event: RenderDeletionEvent | undefined,
  render: Render | undefined,
): Date {
  return render?.createdAt ?? refinementTx?.createdAt ?? event?.deletedAt ?? new Date(0);
}

function isRefinementActivityType(activityType: ActivityType): boolean {
  return activityType === "Refinement" || activityType === "Remove Background";
}

function buildRefinementRow(
  slot: SessionRefinementSlot,
  sessionId: string,
  sessionStatus: SessionActivityStatus,
  transactions: readonly StudioCreditTransaction[],
): CreativeActivityRow {
  const render = slot.render;
  const event = slot.deletionEvent;
  const refinementTx = findRefinementTransactionForRender(
    slot.renderId,
    transactions,
  );
  let result: ActivityResult;
  let outcomeUnresolved = false;

  if (render) {
    result = renderResult(render);
  } else if (refinementTx) {
    result = activityResultForRefinementTransaction(refinementTx);
  } else {
    result = "Unknown";
    outcomeUnresolved = true;
  }

  const dateTime = refinementActivityDate(refinementTx, event, render);
  const generationType =
    render?.generationType ?? event?.generationType ?? "editorial";
  const creditsUsed = result === "Completed" ? 1 : 0;
  const actionLabel = refinementActionLabel(render?.refinementType);
  const activityType: ActivityType =
    render?.refinementType === "remove_background"
      ? "Remove Background"
      : "Refinement";

  return {
    activityId: `render-${slot.renderId}`,
    dateTime,
    generationSessionId: sessionId,
    transactionId: refinementTx?.transactionId ?? null,
    activityType,
    generationType,
    batchAction: actionLabel,
    outputSequence: 1,
    outputsRequested: 1,
    outputLabel: "1/1",
    renderId: slot.renderId,
    parentRenderId: render?.parentRenderId ?? null,
    result,
    billableImage: creditsUsed === 1,
    creditsUsed,
    sessionStatus,
    ...(render == null ? { imageDeleted: true as const } : {}),
    ...(outcomeUnresolved ? { outcomeUnresolved: true as const } : {}),
  };
}

export function buildMasterCreativeActivity(
  ctx: CreativeActivityContext,
): MasterCreativeActivityResult {
  const renderById = renderByIdMap(ctx.renders);
  const rows: CreativeActivityRow[] = [];
  const mappedTransactionIds = new Set<number>();
  const coveredRenderIds = new Set<number>();

  for (const sessionId of collectSessionIds(ctx)) {
    const roots = generationRootsForSession(sessionId, ctx, renderById);
    const refinements = refinementsForSession(sessionId, ctx, renderById);
    const generationTx = findGenerationTransactionForSession(
      sessionId,
      ctx,
      renderById,
    );

    if (generationTx) {
      mappedTransactionIds.add(generationTx.id);
    }

    const rootOutcomeMap = resolveSessionRootOutcomes(roots, generationTx);
    const rootOutcomes = rootOutcomeCountsFromResolved(roots, rootOutcomeMap);
    const sessionStatus = deriveSessionActivityStatus(rootOutcomes);
    const outputsRequested = roots.length;

    roots.forEach((slot, index) => {
      rows.push(
        buildGenerationRow(
          slot,
          sessionId,
          index,
          outputsRequested,
          sessionStatus,
          generationTx,
          rootOutcomeMap,
        ),
      );
      coveredRenderIds.add(slot.renderId);
    });

    for (const slot of refinements) {
      const refinementTx = findRefinementTransactionForRender(
        slot.renderId,
        ctx.transactions,
      );
      if (refinementTx) {
        mappedTransactionIds.add(refinementTx.id);
      }

      rows.push(
        buildRefinementRow(slot, sessionId, sessionStatus, ctx.transactions),
      );
      coveredRenderIds.add(slot.renderId);
    }
  }

  const unmappedTransactions: UnmappedHistoricalTransaction[] = [];
  for (const tx of ctx.transactions) {
    if (!isUsageReasonCode(tx.reasonCode)) continue;
    if (mappedTransactionIds.has(tx.id)) continue;

    const sessionId = resolveSessionIdForTransaction(
      tx,
      renderById,
      ctx.deletionEvents,
    );
    const sessionRoots = generationRootsForSession(sessionId, ctx, renderById);
    const sessionRefinements = refinementsForSession(sessionId, ctx, renderById);

    let reason: string;
    if (isGenerationReasonCode(tx.reasonCode)) {
      if (sessionRoots.length === 0) {
        reason =
          "No surviving terminal renders for this generation transaction";
      } else if (
        sessionRoots.every(
          (slot) =>
            !isKnownCompletedResult(
              generationBillableOutcome(
                slot,
                resolveSessionRootOutcomes(sessionRoots, tx),
              ).result,
            ),
        )
      ) {
        reason =
          "Generation transaction with no completed root renders to map credits to";
      } else {
        reason =
          "Generation transaction could not be linked to an existing session activity row";
      }
    } else if (isRefinementReasonCode(tx.reasonCode)) {
      if (
        tx.renderId != null &&
        !renderById.has(tx.renderId) &&
        !coveredRenderIds.has(tx.renderId)
      ) {
        reason =
          "Refinement transaction references a render that no longer exists";
      } else if (sessionRefinements.length === 0) {
        reason =
          "Refinement transaction could not be mapped to a terminal refinement render";
      } else {
        reason =
          "Refinement transaction could not be mapped to a terminal refinement render";
      }
    } else {
      reason = "Usage transaction not mapped to creative activity";
    }

    unmappedTransactions.push({
      transactionId: tx.transactionId,
      transactionDbId: tx.id,
      date: tx.createdAt,
      amount: Math.abs(tx.amount),
      reasonCode: tx.reasonCode,
      renderId: tx.renderId,
      reason,
    });
  }

  rows.sort(
    (left, right) =>
      left.dateTime.getTime() - right.dateTime.getTime() ||
      left.generationSessionId.localeCompare(right.generationSessionId) ||
      (left.activityType === "Generation" ? 0 : 1) -
        (right.activityType === "Generation" ? 0 : 1) ||
      left.outputSequence - right.outputSequence ||
      left.renderId - right.renderId,
  );

  return { rows, unmappedTransactions };
}

export function sumMasterCreditsUsed(
  rows: readonly CreativeActivityRow[],
): number {
  return rows.reduce((sum, row) => sum + row.creditsUsed, 0);
}

export function countMasterImagesGenerated(
  rows: readonly CreativeActivityRow[],
): number {
  return rows.filter(
    (row) =>
      row.activityType === "Generation" && row.result === "Completed",
  ).length;
}

export function countMasterRefinements(
  rows: readonly CreativeActivityRow[],
): number {
  return rows.filter(
    (row) =>
      isRefinementActivityType(row.activityType) && row.result === "Completed",
  ).length;
}

export function countMasterImagesFailed(
  rows: readonly CreativeActivityRow[],
): number {
  return rows.filter(
    (row) => row.activityType === "Generation" && row.result === "Failed",
  ).length;
}

export function sumLedgerUsageCredits(
  ctx: CreativeActivityContext,
): number {
  return ctx.transactions
    .filter((tx) => isUsageReasonCode(tx.reasonCode) && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

export function sumLedgerGenerationCredits(
  ctx: CreativeActivityContext,
): number {
  return ctx.transactions
    .filter((tx) => isGenerationReasonCode(tx.reasonCode) && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

export function sumLedgerRefinementCredits(
  ctx: CreativeActivityContext,
): number {
  return ctx.transactions
    .filter((tx) => isRefinementReasonCode(tx.reasonCode) && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

export interface CreativeActivityReconciliation {
  masterCreditsUsed: number;
  ledgerCreditsUsed: number;
  masterImagesGenerated: number;
  ledgerGenerationCredits: number;
  masterRefinements: number;
  ledgerRefinementCredits: number;
  creditsReconcile: boolean;
  imagesGeneratedReconcile: boolean;
  refinementsReconcile: boolean;
  unresolvedHistoricalRows: number;
  unmappedTransactions: UnmappedHistoricalTransaction[];
}

export function reconcileMasterWithLedger(
  ctx: CreativeActivityContext,
  master: MasterCreativeActivityResult,
): CreativeActivityReconciliation {
  const masterCreditsUsed = sumMasterCreditsUsed(master.rows);
  const ledgerCreditsUsed = sumLedgerUsageCredits(ctx);
  const masterImagesGenerated = countMasterImagesGenerated(master.rows);
  const ledgerGenerationCredits = sumLedgerGenerationCredits(ctx);
  const masterRefinements = countMasterRefinements(master.rows);
  const ledgerRefinementCredits = sumLedgerRefinementCredits(ctx);
  const unresolvedHistoricalRows = master.rows.filter(
    (row) => row.outcomeUnresolved === true,
  ).length;

  return {
    masterCreditsUsed,
    ledgerCreditsUsed,
    masterImagesGenerated,
    ledgerGenerationCredits,
    masterRefinements,
    ledgerRefinementCredits,
    creditsReconcile: masterCreditsUsed === ledgerCreditsUsed,
    imagesGeneratedReconcile:
      masterImagesGenerated === ledgerGenerationCredits,
    refinementsReconcile: masterRefinements === ledgerRefinementCredits,
    unresolvedHistoricalRows,
    unmappedTransactions: master.unmappedTransactions,
  };
}

export function filterMasterRowsForCycle(
  ctx: CreativeActivityContext,
  rows: readonly CreativeActivityRow[],
): CreativeActivityRow[] {
  const isLifetime = ctx.user.subscriptionTier === "free";
  if (isLifetime) return [...rows];
  return rows.filter((row) => row.dateTime >= ctx.cycleStart);
}

/** Billing-cycle activity totals — derived from master rows only. */
export function deriveBillingCycleActivityStats(
  cycleRows: readonly CreativeActivityRow[],
): BillingCycleLedgerStats {
  const imagesCreated = countMasterImagesGenerated(cycleRows);
  const refinementTotal = countMasterRefinements(cycleRows);

  return {
    studioCreditsUsed: sumMasterCreditsUsed(cycleRows),
    imagesCreated,
    averageRefinementsPerImage:
      imagesCreated === 0
        ? 0
        : Math.round((refinementTotal / imagesCreated) * 10) / 10,
  };
}

export function aggregateMasterByMonth(
  rows: readonly CreativeActivityRow[],
): Map<
  string,
  { imagesGenerated: number; refinements: number; creditsUsed: number }
> {
  const map = new Map<
    string,
    { imagesGenerated: number; refinements: number; creditsUsed: number }
  >();

  for (const row of rows) {
    const monthKey = formatMonthKey(row.dateTime);
    const entry = map.get(monthKey) ?? {
      imagesGenerated: 0,
      refinements: 0,
      creditsUsed: 0,
    };

    if (row.activityType === "Generation" && row.result === "Completed") {
      entry.imagesGenerated += 1;
    }
    if (isRefinementActivityType(row.activityType) && row.result === "Completed") {
      entry.refinements += 1;
    }
    entry.creditsUsed += row.creditsUsed;
    map.set(monthKey, entry);
  }

  return map;
}
