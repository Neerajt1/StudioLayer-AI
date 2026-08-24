import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  StudioCreditAllocationStatus,
  StudioCreditReasonCode,
} from "@workspace/studio-credit-engine";
import {
  classifyCommercialCreditHead,
  studioMembershipPlanFromTier,
} from "./credit-heads.js";
import {
  classifyExpirationProjectionStatus,
  projectCreditExpirationEvent,
} from "./project-expiration.js";
import { projectCreditGrantEvent } from "./project-grants.js";
import {
  projectCreditUsageEvent,
  projectFundedByEntry,
} from "./project-usage.js";
import { projectCommercialSubscriptionEvent } from "./project-subscriptions.js";
import {
  summarizeCreditExpirations,
  summarizeCreditGrants,
  summarizeCreditUsage,
} from "./summarize.js";

describe("classifyCommercialCreditHead", () => {
  it("classifies Basic from Razorpay studio_plan", () => {
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        studioPlan: "basic",
        allocationSourceReference: "rzp_payment:pay_basic",
      }),
      "studio_basic",
    );
  });

  it("classifies Pro from Razorpay studio_plan", () => {
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        studioPlan: "pro",
        allocationSourceReference: "rzp_payment:pay_pro",
      }),
      "studio_pro",
    );
  });

  it("classifies Top-Up, Studio Pass, and Promotional by reason code", () => {
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
      }),
      "top_up",
    );
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
      }),
      "studio_pass",
    );
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.ADJUSTMENT,
      }),
      "promotional",
    );
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION,
      }),
      "promotional",
    );
  });

  it("classifies legacy-seed membership via subscription tier mapping", () => {
    assert.equal(studioMembershipPlanFromTier("pro"), "basic");
    assert.equal(studioMembershipPlanFromTier("enterprise"), "pro");
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        allocationSourceReference: "legacy-seed:1:legacy-utc:2026-08",
        subscriptionTier: "pro",
      }),
      "studio_basic",
    );
  });

  it("returns unknown when membership Basic/Pro cannot be determined", () => {
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        allocationSourceReference: "unknown:ref",
        subscriptionTier: "pro",
      }),
      "unknown",
    );
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      }),
      "unknown",
    );
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.HERO_GENERATION,
      }),
      "unknown",
    );
  });

  it("does not invent Basic/Pro from credit quantity", () => {
    assert.equal(
      classifyCommercialCreditHead({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        allocationSourceReference: "rzp_payment:pay_orphan",
      }),
      "unknown",
    );
  });
});

describe("projectCreditGrantEvent", () => {
  it("projects a Basic membership grant", () => {
    const event = projectCreditGrantEvent({
      transactionId: "tx-1",
      status: "completed",
      amount: 120,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      customerId: 10,
      customerName: "A",
      customerEmail: "a@example.com",
      subscriptionTier: "pro",
      allocationId: 1,
      sourceReference: "rzp_payment:pay_basic",
      originalAmount: 120,
      remainingAmount: 100,
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      allocationStatus: "active",
      studioPlan: "basic",
    });

    assert.equal(event.eventKind, "credit_grant");
    assert.equal(event.commercialCreditHead, "studio_basic");
    assert.equal(event.studioPlan, "basic");
    assert.equal(event.amount, 120);
  });
});

describe("projectCreditUsageEvent / fundedBy", () => {
  it("exposes fundedBy commercial heads from allocation lots", () => {
    const fundedBy = [
      projectFundedByEntry({
        allocationId: 1,
        amount: 1,
        reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
        expiresAt: null,
        sourceReference: "rzp_payment:pay_topup",
        studioPlan: null,
        subscriptionTier: "pro",
      }),
      projectFundedByEntry({
        allocationId: 2,
        amount: 1,
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
        sourceReference: "rzp_payment:pay_basic",
        studioPlan: "basic",
        subscriptionTier: "pro",
      }),
    ];

    assert.equal(fundedBy[0]!.commercialCreditHead, "top_up");
    assert.equal(fundedBy[1]!.commercialCreditHead, "studio_basic");

    const usage = projectCreditUsageEvent({
      transactionId: "usage-1",
      status: "completed",
      amount: -2,
      reasonCode: StudioCreditReasonCode.HERO_GENERATION,
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      customerId: 10,
      customerName: "A",
      customerEmail: "a@example.com",
      renderId: 99,
      generationSessionId: "11111111-1111-1111-1111-111111111111",
      generationType: "hero",
      refinementType: null,
      renderStatus: "completed",
      fundedBy,
    });

    assert.equal(usage.eventKind, "credit_usage");
    assert.equal(usage.amount, 2);
    assert.equal(usage.fundedBy.length, 2);
    assert.equal(usage.renderId, 99);
    assert.equal(usage.renderStatus, "completed");
  });

  it("marks unresolvable funding lots as unknown", () => {
    const funded = projectFundedByEntry({
      allocationId: 3,
      amount: 4,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      sourceReference: "orphan:ref",
      studioPlan: null,
      subscriptionTier: "pro",
    });
    assert.equal(funded.commercialCreditHead, "unknown");
  });
});

describe("projectCreditExpirationEvent", () => {
  it("maps active remaining lots to scheduled", () => {
    assert.equal(
      classifyExpirationProjectionStatus(StudioCreditAllocationStatus.ACTIVE),
      "scheduled",
    );
    const event = projectCreditExpirationEvent({
      allocationId: 1,
      expiresAt: new Date("2026-08-20T12:00:00.000Z"),
      remainingAmount: 25,
      status: StudioCreditAllocationStatus.ACTIVE,
      reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
      sourceReference: "pass:1",
      customerId: 10,
      customerName: "A",
      customerEmail: "a@example.com",
      subscriptionTier: "free",
      studioPlan: null,
    });
    assert.ok(event);
    assert.equal(event!.expirationStatus, "scheduled");
    assert.equal(event!.commercialCreditHead, "studio_pass");
    assert.equal(event!.creditsUnused, 25);
  });

  it("maps expired remaining lots to expired_unused", () => {
    assert.equal(
      classifyExpirationProjectionStatus(StudioCreditAllocationStatus.EXPIRED),
      "expired_unused",
    );
    const event = projectCreditExpirationEvent({
      allocationId: 2,
      expiresAt: new Date("2026-08-13T00:00:00.000Z"),
      remainingAmount: 12,
      status: StudioCreditAllocationStatus.EXPIRED,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      sourceReference: "rzp_payment:pay_pro",
      customerId: 11,
      customerName: "B",
      customerEmail: "b@example.com",
      subscriptionTier: "enterprise",
      studioPlan: "pro",
    });
    assert.ok(event);
    assert.equal(event!.expirationStatus, "expired_unused");
    assert.equal(event!.commercialCreditHead, "studio_pro");
  });

  it("skips exhausted or zero-remaining lots", () => {
    assert.equal(
      projectCreditExpirationEvent({
        allocationId: 3,
        expiresAt: new Date("2026-08-13T00:00:00.000Z"),
        remainingAmount: 0,
        status: StudioCreditAllocationStatus.EXPIRED,
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
        sourceReference: "pass:3",
        customerId: 12,
        customerName: "C",
        customerEmail: "c@example.com",
        subscriptionTier: "free",
        studioPlan: null,
      }),
      null,
    );
  });
});

describe("projectCommercialSubscriptionEvent", () => {
  it("exposes studioPlan without remapping", () => {
    const event = projectCommercialSubscriptionEvent({
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      customerId: 10,
      customerName: "A",
      customerEmail: "a@example.com",
      razorpaySubscriptionId: "sub_1",
      razorpayPlanId: "plan_basic",
      studioPlan: "basic",
      studioTier: "pro",
      status: "active",
      currentStart: new Date("2026-08-01T00:00:00.000Z"),
      currentEnd: new Date("2026-09-01T00:00:00.000Z"),
      latestPaymentId: "pay_1",
      latestInvoiceId: null,
    });
    assert.equal(event.eventKind, "commercial_subscription");
    assert.equal(event.studioPlan, "basic");
    assert.equal(event.studioTier, "pro");
  });
});

describe("summarize helpers", () => {
  it("totals five commercial heads and keeps unknown separate", () => {
    const summary = summarizeCreditGrants([
      {
        eventKind: "credit_grant",
        occurredAt: new Date(),
        transactionId: "1",
        status: "completed",
        amount: 120,
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        customerId: 1,
        customerName: "A",
        customerEmail: "a@example.com",
        allocationId: 1,
        sourceReference: "rzp_payment:1",
        originalAmount: 120,
        remainingAmount: 120,
        startsAt: new Date(),
        expiresAt: new Date(),
        allocationStatus: "active",
        commercialCreditHead: "studio_basic",
        studioPlan: "basic",
      },
      {
        eventKind: "credit_grant",
        occurredAt: new Date(),
        transactionId: "2",
        status: "completed",
        amount: 240,
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        customerId: 2,
        customerName: "B",
        customerEmail: "b@example.com",
        allocationId: 2,
        sourceReference: "rzp_payment:2",
        originalAmount: 240,
        remainingAmount: 240,
        startsAt: new Date(),
        expiresAt: new Date(),
        allocationStatus: "active",
        commercialCreditHead: "studio_pro",
        studioPlan: "pro",
      },
      {
        eventKind: "credit_grant",
        occurredAt: new Date(),
        transactionId: "3",
        status: "completed",
        amount: 35,
        reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
        customerId: 1,
        customerName: "A",
        customerEmail: "a@example.com",
        allocationId: 3,
        sourceReference: "rzp_payment:3",
        originalAmount: 35,
        remainingAmount: 35,
        startsAt: new Date(),
        expiresAt: null,
        allocationStatus: "active",
        commercialCreditHead: "top_up",
        studioPlan: null,
      },
      {
        eventKind: "credit_grant",
        occurredAt: new Date(),
        transactionId: "4",
        status: "completed",
        amount: 40,
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
        customerId: 3,
        customerName: "C",
        customerEmail: "c@example.com",
        allocationId: 4,
        sourceReference: "rzp_payment:4",
        originalAmount: 40,
        remainingAmount: 40,
        startsAt: new Date(),
        expiresAt: new Date(),
        allocationStatus: "active",
        commercialCreditHead: "studio_pass",
        studioPlan: null,
      },
      {
        eventKind: "credit_grant",
        occurredAt: new Date(),
        transactionId: "5",
        status: "completed",
        amount: 10,
        reasonCode: StudioCreditReasonCode.ADJUSTMENT,
        customerId: 1,
        customerName: "A",
        customerEmail: "a@example.com",
        allocationId: null,
        sourceReference: null,
        originalAmount: null,
        remainingAmount: null,
        startsAt: null,
        expiresAt: null,
        allocationStatus: null,
        commercialCreditHead: "promotional",
        studioPlan: null,
      },
      {
        eventKind: "credit_grant",
        occurredAt: new Date(),
        transactionId: "6",
        status: "completed",
        amount: 50,
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        customerId: 4,
        customerName: "D",
        customerEmail: "d@example.com",
        allocationId: 6,
        sourceReference: "orphan",
        originalAmount: 50,
        remainingAmount: 50,
        startsAt: new Date(),
        expiresAt: new Date(),
        allocationStatus: "active",
        commercialCreditHead: "unknown",
        studioPlan: null,
      },
    ]);

    assert.equal(summary.studioBasicCredits, 120);
    assert.equal(summary.studioProCredits, 240);
    assert.equal(summary.topUpCredits, 35);
    assert.equal(summary.studioPassCredits, 40);
    assert.equal(summary.promotionalCredits, 10);
    assert.equal(summary.totalCreditsAdded, 445);
    assert.equal(summary.unknownCredits, 50);
  });

  it("does not double-count usage fundedBy amounts across heads", () => {
    const summary = summarizeCreditUsage([
      projectCreditUsageEvent({
        transactionId: "u1",
        status: "completed",
        amount: -2,
        reasonCode: StudioCreditReasonCode.HERO_GENERATION,
        createdAt: new Date(),
        customerId: 1,
        customerName: "A",
        customerEmail: "a@example.com",
        renderId: 1,
        generationSessionId: null,
        generationType: "hero",
        refinementType: null,
        renderStatus: "completed",
        fundedBy: [
          projectFundedByEntry({
            allocationId: 1,
            amount: 1,
            reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
            expiresAt: null,
            sourceReference: "t",
            studioPlan: null,
            subscriptionTier: "pro",
          }),
          projectFundedByEntry({
            allocationId: 2,
            amount: 1,
            reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
            expiresAt: new Date(),
            sourceReference: "m",
            studioPlan: "basic",
            subscriptionTier: "pro",
          }),
        ],
      }),
    ]);

    assert.equal(summary.creditsConsumed, 2);
    assert.equal(summary.generationCredits, 2);
    assert.equal(summary.totalGenerations, 1);
    assert.equal(summary.imagesCreated, 1);
    assert.equal(summary.fundedByHead.topUpCredits, 1);
    assert.equal(summary.fundedByHead.studioBasicCredits, 1);
    assert.equal(
      summary.fundedByHead.topUpCredits +
        summary.fundedByHead.studioBasicCredits,
      summary.creditsConsumed,
    );
  });

  it("matches former Admin Generations metrics for generations/images/edits/credits", () => {
    const summary = summarizeCreditUsage([
      projectCreditUsageEvent({
        transactionId: "1",
        status: "completed",
        amount: -1,
        reasonCode: StudioCreditReasonCode.HERO_GENERATION,
        createdAt: new Date(),
        customerId: 1,
        customerName: "A",
        customerEmail: "a@example.com",
        renderId: null,
        generationSessionId: null,
        generationType: null,
        refinementType: null,
        renderStatus: null,
        fundedBy: [],
      }),
      projectCreditUsageEvent({
        transactionId: "2",
        status: "completed",
        amount: -2,
        reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
        createdAt: new Date(),
        customerId: 1,
        customerName: "A",
        customerEmail: "a@example.com",
        renderId: null,
        generationSessionId: null,
        generationType: null,
        refinementType: null,
        renderStatus: null,
        fundedBy: [],
      }),
      projectCreditUsageEvent({
        transactionId: "3",
        status: "completed",
        amount: -1,
        reasonCode: StudioCreditReasonCode.REFINE,
        createdAt: new Date(),
        customerId: 1,
        customerName: "A",
        customerEmail: "a@example.com",
        renderId: null,
        generationSessionId: null,
        generationType: null,
        refinementType: null,
        renderStatus: null,
        fundedBy: [],
      }),
      projectCreditUsageEvent({
        transactionId: "4",
        status: "completed",
        amount: -1,
        reasonCode: StudioCreditReasonCode.REGENERATE,
        createdAt: new Date(),
        customerId: 1,
        customerName: "A",
        customerEmail: "a@example.com",
        renderId: null,
        generationSessionId: null,
        generationType: null,
        refinementType: null,
        renderStatus: null,
        fundedBy: [],
      }),
    ]);

    assert.equal(summary.totalGenerations, 2);
    assert.equal(summary.imagesCreated, 3);
    assert.equal(summary.editsMade, 2);
    assert.equal(summary.creditsConsumed, 5);
  });

  it("groups expiration by UTC date without inventing zero rows", () => {
    const summary = summarizeCreditExpirations([
      projectCreditExpirationEvent({
        allocationId: 1,
        expiresAt: new Date("2026-08-19T15:00:00.000Z"),
        remainingAmount: 25,
        status: StudioCreditAllocationStatus.ACTIVE,
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
        sourceReference: "p1",
        customerId: 10,
        customerName: "A",
        customerEmail: "a@example.com",
        subscriptionTier: "free",
        studioPlan: null,
      })!,
      projectCreditExpirationEvent({
        allocationId: 2,
        expiresAt: new Date("2026-08-20T01:00:00.000Z"),
        remainingAmount: 12,
        status: StudioCreditAllocationStatus.EXPIRED,
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
        sourceReference: "p2",
        customerId: 11,
        customerName: "B",
        customerEmail: "b@example.com",
        subscriptionTier: "free",
        studioPlan: null,
      })!,
    ]);

    assert.equal(summary.totalCreditsExpiring, 37);
    assert.equal(summary.scheduledCredits, 25);
    assert.equal(summary.expiredUnusedCredits, 12);
    assert.deepEqual(summary.byDate, [
      { date: "2026-08-19", creditsExpiring: 25, customersAffected: 1 },
      { date: "2026-08-20", creditsExpiring: 12, customersAffected: 1 },
    ]);
  });
});
