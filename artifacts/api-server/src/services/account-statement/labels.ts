import {
  STUDIO_CREDIT_USAGE_REASON_CODES,
  StudioCreditReasonCode,
  billingCycleStartUtc,
  type StudioCreditReasonCodeValue,
} from "@workspace/studio-credit-engine";

const GENERATION_REASON_CODES: readonly StudioCreditReasonCodeValue[] = [
  StudioCreditReasonCode.HERO_GENERATION,
  StudioCreditReasonCode.CAMPAIGN_GENERATION,
  StudioCreditReasonCode.EDITORIAL_GENERATION,
];

const REFINEMENT_REASON_CODES: readonly StudioCreditReasonCodeValue[] = [
  StudioCreditReasonCode.REFINE,
  StudioCreditReasonCode.REGENERATE,
];

export function membershipPlanLabel(tier: string): string {
  if (tier === "free") return "Complimentary Studio";
  if (tier === "pro") return "Studio Basic";
  if (tier === "enterprise") return "Studio Pro";
  return tier;
}

export function billingCycleLabel(tier: string, now: Date): string {
  if (tier === "free") return "Complimentary (Lifetime)";
  return formatStatementDate(billingCycleStartUtc(now));
}

/** User-facing calendar date — DD MMM YYYY (e.g. 07 Aug 2026). UTC-normalised. */
export function formatStatementDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatMonthDisplay(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return formatStatementDate(date);
}

export function statementFilename(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `Studio Account Statement - ${year}-${month}.xlsx`;
}

export function transactionTypeLabel(
  reasonCode: string,
): string {
  switch (reasonCode) {
    case StudioCreditReasonCode.MEMBERSHIP_ALLOCATION:
      return "Membership Credits";
    case StudioCreditReasonCode.TOP_UP_ALLOCATION:
      return "Purchased Credits";
    case StudioCreditReasonCode.STUDIO_PASS_ALLOCATION:
      return "Purchased Credits";
    case StudioCreditReasonCode.ADJUSTMENT:
      return "Promotional Credits";
    case StudioCreditReasonCode.REFUND:
      return "Complimentary Credits";
    case StudioCreditReasonCode.HERO_GENERATION:
    case StudioCreditReasonCode.CAMPAIGN_GENERATION:
    case StudioCreditReasonCode.EDITORIAL_GENERATION:
      return "Image Generation";
    case StudioCreditReasonCode.REFINE:
    case StudioCreditReasonCode.REGENERATE:
      return "Image Refinement";
    case StudioCreditReasonCode.TRANSPARENT_DOWNLOAD:
      return "Transparent Download";
    default:
      return reasonCode;
  }
}

export function transactionDescription(
  reasonCode: string,
  renderId: number | null,
): string {
  const type = transactionTypeLabel(reasonCode);
  if (renderId != null) {
    return `${type} — Render #${renderId}`;
  }
  return type;
}

export function generationTypeLabel(reasonCode: string): string {
  switch (reasonCode) {
    case StudioCreditReasonCode.HERO_GENERATION:
      return "Hero";
    case StudioCreditReasonCode.CAMPAIGN_GENERATION:
      return "Campaign";
    case StudioCreditReasonCode.EDITORIAL_GENERATION:
      return "Editorial";
    case StudioCreditReasonCode.REFINE:
      return "Refinement";
    case StudioCreditReasonCode.REGENERATE:
      return "Regeneration";
    case StudioCreditReasonCode.TRANSPARENT_DOWNLOAD:
      return "Transparent Download";
    default:
      return reasonCode;
  }
}

export function generationTypeFromRenderType(type: string): string {
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

export function isUsageReasonCode(reasonCode: string): boolean {
  return (STUDIO_CREDIT_USAGE_REASON_CODES as readonly string[]).includes(
    reasonCode,
  );
}

export function isGenerationReasonCode(reasonCode: string): boolean {
  return (GENERATION_REASON_CODES as readonly string[]).includes(reasonCode);
}

export function isRefinementReasonCode(reasonCode: string): boolean {
  return (REFINEMENT_REASON_CODES as readonly string[]).includes(reasonCode);
}

export function isPromotionalReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === StudioCreditReasonCode.ADJUSTMENT ||
    reasonCode === StudioCreditReasonCode.REFUND
  );
}

export function isPurchasedReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === StudioCreditReasonCode.TOP_UP_ALLOCATION ||
    reasonCode === StudioCreditReasonCode.STUDIO_PASS_ALLOCATION
  );
}

export function isMembershipAllocationReasonCode(reasonCode: string): boolean {
  return reasonCode === StudioCreditReasonCode.MEMBERSHIP_ALLOCATION;
}
