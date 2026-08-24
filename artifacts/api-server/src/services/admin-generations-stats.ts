import { summarizeUsage } from "./transaction-master/summarize-api.js";
import {
  mapTransactionMasterUsageToAdminGenerationsSummary,
  type AdminGenerationsSummary,
} from "./admin-generations-mapping.js";

export type { AdminGenerationsSummary } from "./admin-generations-mapping.js";
export { mapTransactionMasterUsageToAdminGenerationsSummary } from "./admin-generations-mapping.js";

/**
 * Prior Admin Generations included all users' completed usage txs.
 * Keep that scope for numerical parity with the pre-migration report.
 */
const GENERATIONS_TM_FILTER = { excludeAdmins: false as const };

export async function loadAdminGenerationsSummary(
  from: Date,
  to: Date,
): Promise<AdminGenerationsSummary> {
  const usage = await summarizeUsage({
    from,
    to,
    ...GENERATIONS_TM_FILTER,
  });
  return mapTransactionMasterUsageToAdminGenerationsSummary(usage);
}
