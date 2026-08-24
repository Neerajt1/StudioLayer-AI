import type { AdminProviderUsageSnapshot } from "./admin-provider-usage-status.js";
import { PROVIDER_PROBE_ORDER } from "./admin-provider-usage-probes.js";

/** Fresh live provider queries — no caching or persistence. */
export async function refreshAdminProviderUsage(): Promise<AdminProviderUsageSnapshot> {
  const results = await Promise.all(
    PROVIDER_PROBE_ORDER.map((probe) => probe()),
  );

  return {
    checkedAt: new Date(),
    providers: results,
  };
}
