export type AdminProviderUsageStatus =
  | "healthy"
  | "attention"
  | "down"
  | "not_configured"
  | "not_available";

export interface AdminProviderUsageRow {
  key:
    | "openrouter"
    | "fal"
    | "openai"
    | "railway"
    | "neon"
    | "cloudflare"
    | "github";
  label: string;
  status: AdminProviderUsageStatus;
  /** Provider-specific summary for the information column. */
  information: string;
  /** Human-readable failure or access explanation shown under status. */
  detail: string | null;
}

export interface AdminProviderUsageSnapshot {
  checkedAt: Date;
  providers: AdminProviderUsageRow[];
}

export function toAdminProviderUsageStatusLabel(
  status: AdminProviderUsageStatus,
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "attention":
      return "Attention";
    case "down":
      return "Down";
    case "not_configured":
      return "Not configured";
    case "not_available":
      return "Not available";
  }
}

/** Strip anything that could leak secrets from provider error text. */
export function sanitizeProviderErrorMessage(input: unknown): string {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : "Provider request failed";

  return raw
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, "Bearer [redacted]")
    .replace(/Key\s+[A-Za-z0-9._\-+/=:]+/gi, "Key [redacted]")
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gi, "sk-or-v1-[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/gi, "sk-[redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9]+/gi, "gh[redacted]")
    .replace(/[A-Za-z0-9+/]{32,}={0,2}/g, "[redacted]")
    .slice(0, 240);
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}
