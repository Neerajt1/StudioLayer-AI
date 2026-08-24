export type AdminHealthStatus =
  | "healthy"
  | "attention"
  | "down"
  | "not_monitored";

const STATUS_RANK: Record<AdminHealthStatus, number> = {
  not_monitored: 0,
  healthy: 1,
  attention: 2,
  down: 3,
};

/** Worst monitored component status; ignores not_monitored. */
export function aggregateOverallHealthStatus(
  statuses: readonly AdminHealthStatus[],
): AdminHealthStatus {
  const monitored = statuses.filter((status) => status !== "not_monitored");
  if (monitored.length === 0) return "not_monitored";

  return monitored.reduce<AdminHealthStatus>(
    (worst, status) =>
      STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst,
    "healthy",
  );
}

export function toAdminHealthLabel(status: AdminHealthStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Attention";
    case "down":
      return "Down";
    case "not_monitored":
      return "Not monitored yet";
  }
}
