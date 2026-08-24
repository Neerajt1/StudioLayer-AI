import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import { mapTransactionMasterUsageToAdminGenerationsSummary } from "./admin-generations-mapping.js";
import { projectCreditUsageEvent } from "./transaction-master/project-usage.js";
import { summarizeCreditUsage } from "./transaction-master/summarize.js";

describe("Admin Generations ← Transaction Master", () => {
  it("maps summarizeUsage to the four Admin Generations metrics", () => {
    const usage = summarizeCreditUsage([
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

    const mapped = mapTransactionMasterUsageToAdminGenerationsSummary(usage);
    assert.equal(mapped.totalGenerations, 2);
    assert.equal(mapped.imagesCreated, 3);
    assert.equal(mapped.editsMade, 2);
    assert.equal(mapped.studioCreditsUsed, 5);
  });

  it("old vs new equivalence on the prior Admin Generations fixture", () => {
    // Prior deriveLedgerUsageMetrics expected values for this fixture.
    const expected = {
      totalGenerations: 2,
      imagesCreated: 3,
      editsMade: 2,
      studioCreditsUsed: 5,
    };

    const usage = summarizeCreditUsage([
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

    assert.deepEqual(
      mapTransactionMasterUsageToAdminGenerationsSummary(usage),
      expected,
    );
  });
});
