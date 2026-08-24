import {
  formatInteger,
  formatUsd,
  sanitizeProviderErrorMessage,
  type AdminProviderUsageRow,
} from "./admin-provider-usage-status.js";
import { providerFetch, readProviderJson } from "./admin-provider-usage-fetch.js";

function missingEnvRow(
  key: AdminProviderUsageRow["key"],
  label: string,
  envHint: string,
): AdminProviderUsageRow {
  return {
    key,
    label,
    status: "not_configured",
    information: "Not configured",
    detail: envHint,
  };
}

function authFailureDetail(status: number, message: string): string {
  if (status === 401 || status === 403) {
    return "Authentication failed";
  }
  return sanitizeProviderErrorMessage(message);
}

export async function probeOpenRouterUsage(): Promise<AdminProviderUsageRow> {
  const apiKey = process.env["OPENROUTER_API_KEY"]?.trim();
  if (!apiKey) {
    return missingEnvRow(
      "openrouter",
      "OpenRouter",
      "OPENROUTER_API_KEY is not configured",
    );
  }

  try {
    const response = await providerFetch("https://openrouter.ai/api/v1/key", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const parsed = await readProviderJson<{ data?: Record<string, unknown> }>(
      response,
    );
    if (!parsed.ok) {
      return {
        key: "openrouter",
        label: "OpenRouter",
        status: "down",
        information: "Unable to retrieve credit information",
        detail: authFailureDetail(parsed.status, parsed.message),
      };
    }

    const data = parsed.data.data ?? {};
    const limitRemaining =
      typeof data.limit_remaining === "number" ? data.limit_remaining : null;
    const usageMonthly =
      typeof data.usage_monthly === "number" ? data.usage_monthly : null;
    const usage =
      typeof data.usage === "number" ? data.usage : null;
    const limit = typeof data.limit === "number" ? data.limit : null;

    const parts: string[] = [];
    if (limitRemaining != null) {
      parts.push(`${formatUsd(limitRemaining)} remaining`);
    } else if (limit == null) {
      parts.push("No key spending limit set");
    }
    if (usageMonthly != null) {
      parts.push(`${formatUsd(usageMonthly)} used this month`);
    } else if (usage != null) {
      parts.push(`${formatUsd(usage)} used (all time)`);
    }

    let status: AdminProviderUsageRow["status"] = "healthy";
    if (limitRemaining != null && limitRemaining <= 0) {
      status = "attention";
    }

    return {
      key: "openrouter",
      label: "OpenRouter",
      status,
      information: parts.join(" · ") || "Credit information retrieved",
      detail:
        status === "attention"
          ? "Key credit limit exhausted"
          : null,
    };
  } catch (error) {
    return {
      key: "openrouter",
      label: "OpenRouter",
      status: "down",
      information: "Unable to retrieve credit information",
      detail: sanitizeProviderErrorMessage(error),
    };
  }
}

type FalBillingResponse = {
  credits?: {
    current_balance?: number;
    currency?: string;
  };
};

export async function probeFalUsage(): Promise<AdminProviderUsageRow> {
  const apiKey = process.env["FAL_KEY"]?.trim();
  if (!apiKey) {
    return missingEnvRow("fal", "fal", "FAL_KEY is not configured");
  }

  try {
    const response = await providerFetch(
      "https://api.fal.ai/v1/account/billing?expand=credits",
      {
        method: "GET",
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      },
    );
    const parsed = await readProviderJson<FalBillingResponse>(response);
    if (!parsed.ok) {
      if (parsed.status === 404 || parsed.status === 501) {
        return {
          key: "fal",
          label: "fal",
          status: "not_available",
          information: "Billing API not available for this account",
          detail: sanitizeProviderErrorMessage(parsed.message),
        };
      }
      return {
        key: "fal",
        label: "fal",
        status: "down",
        information: "Unable to retrieve account billing",
        detail: authFailureDetail(parsed.status, parsed.message),
      };
    }

    const balance = parsed.data.credits?.current_balance;
    const currency = parsed.data.credits?.currency ?? "USD";
    if (typeof balance !== "number") {
      return {
        key: "fal",
        label: "fal",
        status: "not_available",
        information: "Credit balance not exposed for this account",
        detail: "Billing API responded without a credit balance",
      };
    }

    const status: AdminProviderUsageRow["status"] =
      balance <= 0 ? "attention" : "healthy";

    return {
      key: "fal",
      label: "fal",
      status,
      information: `${formatUsd(balance)} ${currency} credit balance`,
      detail: status === "attention" ? "Credit balance is zero" : null,
    };
  } catch (error) {
    return {
      key: "fal",
      label: "fal",
      status: "down",
      information: "Unable to retrieve account billing",
      detail: sanitizeProviderErrorMessage(error),
    };
  }
}

function currentUtcMonthUnixRange(): { start: number; end: number } {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
  const end = Math.floor(now.getTime() / 1000);
  return { start, end };
}

export async function probeOpenAiUsage(): Promise<AdminProviderUsageRow> {
  const apiKey = process.env["OPENAPI_API_KEY"]?.trim();
  if (!apiKey) {
    return missingEnvRow(
      "openai",
      "OpenAI",
      "OPENAPI_API_KEY is not configured",
    );
  }

  const authHeaders = {
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const { start, end } = currentUtcMonthUnixRange();
    const costsUrl = `https://api.openai.com/v1/organization/costs?start_time=${start}&end_time=${end}&limit=1`;
    const costsResponse = await providerFetch(costsUrl, {
      method: "GET",
      headers: authHeaders,
    });

    if (costsResponse.ok) {
      const costsJson = (await costsResponse.json()) as {
        data?: Array<{
          results?: Array<{
            amount?: { value?: number | string; currency?: string };
          }>;
        }>;
      };

      let totalCost = 0;
      let currency = "usd";
      for (const bucket of costsJson.data ?? []) {
        for (const result of bucket.results ?? []) {
          const rawValue = result.amount?.value;
          const value =
            typeof rawValue === "number"
              ? rawValue
              : typeof rawValue === "string"
                ? Number.parseFloat(rawValue)
                : Number.NaN;
          if (!Number.isNaN(value)) {
            totalCost += value;
          }
          if (result.amount?.currency) {
            currency = result.amount.currency;
          }
        }
      }

      if (totalCost > 0 || (costsJson.data?.length ?? 0) > 0) {
        return {
          key: "openai",
          label: "OpenAI",
          status: "healthy",
          information: `${formatUsd(totalCost)} ${currency.toUpperCase()} organization cost this month`,
          detail: null,
        };
      }
    } else if (
      costsResponse.status === 401 ||
      costsResponse.status === 403
    ) {
      // Fall through to a lighter-weight auth probe below.
    } else if (costsResponse.status === 404) {
      return {
        key: "openai",
        label: "OpenAI",
        status: "not_available",
        information: "Organization billing API not available",
        detail: "This API key cannot access organization cost reporting",
      };
    }

    const modelsResponse = await providerFetch(
      "https://api.openai.com/v1/models?limit=1",
      {
        method: "GET",
        headers: authHeaders,
      },
    );
    const modelsParsed = await readProviderJson(modelsResponse);
    if (!modelsParsed.ok) {
      return {
        key: "openai",
        label: "OpenAI",
        status: "down",
        information: "Unable to retrieve account information",
        detail: authFailureDetail(modelsParsed.status, modelsParsed.message),
      };
    }

    return {
      key: "openai",
      label: "OpenAI",
      status: "not_available",
      information: "API key authenticated",
      detail:
        "Organization cost reporting is not available for this API key",
    };
  } catch (error) {
    return {
      key: "openai",
      label: "OpenAI",
      status: "down",
      information: "Unable to retrieve account information",
      detail: sanitizeProviderErrorMessage(error),
    };
  }
}

type RailwayGraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

async function railwayGraphQl<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }
> {
  const response = await providerFetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const parsed = await readProviderJson<RailwayGraphQlResponse<T>>(response);
  if (!parsed.ok) {
    return {
      ok: false,
      status: parsed.status,
      message: parsed.message,
    };
  }

  if (parsed.data.errors?.length) {
    return {
      ok: false,
      status: 400,
      message: parsed.data.errors[0]?.message ?? "GraphQL query failed",
    };
  }

  if (!parsed.data.data) {
    return { ok: false, status: 502, message: "Empty GraphQL response" };
  }

  return { ok: true, data: parsed.data.data };
}

export async function probeRailwayUsage(): Promise<AdminProviderUsageRow> {
  const token = process.env["RAILWAY_API_TOKEN"]?.trim();
  if (!token) {
    return missingEnvRow(
      "railway",
      "Railway",
      "RAILWAY_API_TOKEN is not configured",
    );
  }

  try {
    const workspaceId = process.env["RAILWAY_WORKSPACE_ID"]?.trim();

    let resolvedWorkspaceId = workspaceId ?? null;
    if (!resolvedWorkspaceId) {
      const meResult = await railwayGraphQl<{
        me?: {
          workspaces?: Array<{ id?: string; name?: string }>;
        };
      }>(
        token,
        `query {
          me {
            workspaces {
              id
              name
            }
          }
        }`,
      );
      if (!meResult.ok) {
        return {
          key: "railway",
          label: "Railway",
          status: "down",
          information: "Unable to retrieve account usage",
          detail: authFailureDetail(meResult.status, meResult.message),
        };
      }
      resolvedWorkspaceId = meResult.data.me?.workspaces?.[0]?.id ?? null;
    }

    if (!resolvedWorkspaceId) {
      return {
        key: "railway",
        label: "Railway",
        status: "not_available",
        information: "No Railway workspace found",
        detail: "Set RAILWAY_WORKSPACE_ID or ensure the token can list workspaces",
      };
    }

    const billingResult = await railwayGraphQl<{
      workspace?: {
        customer?: {
          subscriptions?: Array<{ nextInvoiceCurrentTotal?: number | null }>;
        };
      };
    }>(
      token,
      `query Billing($workspaceId: String!) {
        workspace(workspaceId: $workspaceId) {
          customer {
            subscriptions {
              nextInvoiceCurrentTotal
            }
          }
        }
      }`,
      { workspaceId: resolvedWorkspaceId },
    );

    if (!billingResult.ok) {
      return {
        key: "railway",
        label: "Railway",
        status: "down",
        information: "Unable to retrieve current account usage",
        detail: authFailureDetail(billingResult.status, billingResult.message),
      };
    }

    const total =
      billingResult.data.workspace?.customer?.subscriptions?.[0]
        ?.nextInvoiceCurrentTotal;

    if (typeof total !== "number") {
      return {
        key: "railway",
        label: "Railway",
        status: "not_available",
        information: "Billing usage not exposed for this workspace",
        detail: "Railway did not return a current billing-period total",
      };
    }

    return {
      key: "railway",
      label: "Railway",
      status: "healthy",
      information: `${formatUsd(total)} current billing-period estimate`,
      detail: null,
    };
  } catch (error) {
    return {
      key: "railway",
      label: "Railway",
      status: "down",
      information: "Unable to retrieve current account usage",
      detail: sanitizeProviderErrorMessage(error),
    };
  }
}

function neonMonthRangeIso(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const to = now.toISOString();
  return { from, to };
}

export async function probeNeonUsage(): Promise<AdminProviderUsageRow> {
  const apiKey = process.env["NEON_API_KEY"]?.trim();
  if (!apiKey) {
    return missingEnvRow(
      "neon",
      "Neon",
      "NEON_API_KEY is not configured",
    );
  }

  try {
    let orgId = process.env["NEON_ORG_ID"]?.trim() ?? null;
    if (!orgId) {
      const meResponse = await providerFetch(
        "https://console.neon.tech/api/v2/users/me",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        },
      );
      const meParsed = await readProviderJson<{
        organizations?: Array<{ id?: string }>;
        org_id?: string;
      }>(meResponse);
      if (!meParsed.ok) {
        return {
          key: "neon",
          label: "Neon",
          status: "down",
          information: "Unable to retrieve consumption",
          detail: authFailureDetail(meParsed.status, meParsed.message),
        };
      }
      orgId =
        meParsed.data.org_id ??
        meParsed.data.organizations?.[0]?.id ??
        null;
    }

    if (!orgId) {
      return {
        key: "neon",
        label: "Neon",
        status: "not_available",
        information: "No Neon organization found",
        detail: "Set NEON_ORG_ID or ensure the API key can list organizations",
      };
    }

    const { from, to } = neonMonthRangeIso();
    const projectId = process.env["NEON_PROJECT_ID"]?.trim();
    const params = new URLSearchParams({
      from,
      to,
      granularity: "monthly",
      org_id: orgId,
      metrics: "compute_unit_seconds,root_branch_bytes_month",
      limit: "1",
    });
    if (projectId) {
      params.set("project_ids", projectId);
    }

    const response = await providerFetch(
      `https://console.neon.tech/api/v2/consumption_history/v2/projects?${params}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    );
    const parsed = await readProviderJson<{
      projects?: Array<{
        periods?: Array<{
          consumption?: Array<{
            metrics?: Array<{ metric_name?: string; value?: number }>;
            compute_unit_seconds?: number;
            root_branch_bytes_month?: number;
          }>;
        }>;
      }>;
    }>(response);

    if (!parsed.ok) {
      if (parsed.status === 403 || parsed.status === 404) {
        return {
          key: "neon",
          label: "Neon",
          status: "not_available",
          information: "Consumption API not available for this account",
          detail: sanitizeProviderErrorMessage(parsed.message),
        };
      }
      return {
        key: "neon",
        label: "Neon",
        status: "down",
        information: "Unable to retrieve consumption",
        detail: authFailureDetail(parsed.status, parsed.message),
      };
    }

    let computeSeconds = 0;
    let storageBytes = 0;
    for (const project of parsed.data.projects ?? []) {
      for (const period of project.periods ?? []) {
        for (const entry of period.consumption ?? []) {
          if (Array.isArray(entry.metrics) && entry.metrics.length > 0) {
            computeSeconds +=
              entry.metrics.find((m) => m.metric_name === "compute_unit_seconds")
                ?.value ?? 0;
            storageBytes +=
              entry.metrics.find(
                (m) => m.metric_name === "root_branch_bytes_month",
              )?.value ?? 0;
          } else {
            computeSeconds += entry.compute_unit_seconds ?? 0;
            storageBytes += entry.root_branch_bytes_month ?? 0;
          }
        }
      }
    }
    const computeHours = computeSeconds / 3600;
    const storageGb = storageBytes / (1024 ** 3);

    return {
      key: "neon",
      label: "Neon",
      status: "healthy",
      information: `Compute ${computeHours.toFixed(2)} CU-hours · Storage ${storageGb.toFixed(2)} GB-month (current period)`,
      detail: null,
    };
  } catch (error) {
    return {
      key: "neon",
      label: "Neon",
      status: "down",
      information: "Unable to retrieve consumption",
      detail: sanitizeProviderErrorMessage(error),
    };
  }
}

export async function probeCloudflareUsage(): Promise<AdminProviderUsageRow> {
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"]?.trim();
  const accountId = process.env["R2_ACCOUNT_ID"]?.trim();

  if (!apiToken) {
    const r2Configured = Boolean(
      process.env["R2_BUCKET"]?.trim() &&
        process.env["R2_ACCESS_KEY_ID"]?.trim() &&
        process.env["R2_SECRET_ACCESS_KEY"]?.trim(),
    );
    return {
      key: "cloudflare",
      label: "Cloudflare",
      status: "not_configured",
      information: "Not configured",
      detail: r2Configured
        ? "CLOUDFLARE_API_TOKEN is not configured (R2 credentials alone do not expose billing usage)"
        : "CLOUDFLARE_API_TOKEN is not configured",
    };
  }

  if (!accountId) {
    return {
      key: "cloudflare",
      label: "Cloudflare",
      status: "not_configured",
      information: "Not configured",
      detail: "R2_ACCOUNT_ID is required as the Cloudflare account ID",
    };
  }

  try {
    const response = await providerFetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const parsed = await readProviderJson<{
      result?: { name?: string; type?: string };
    }>(response);

    if (!parsed.ok) {
      if (parsed.status === 403) {
        return {
          key: "cloudflare",
          label: "Cloudflare",
          status: "not_available",
          information: "Account API access not permitted",
          detail:
            "This token cannot read Cloudflare account information; billable usage endpoints may be restricted on your plan",
        };
      }
      return {
        key: "cloudflare",
        label: "Cloudflare",
        status: "down",
        information: "Unable to retrieve account information",
        detail: authFailureDetail(parsed.status, parsed.message),
      };
    }

    const accountName = parsed.data.result?.name ?? "Cloudflare account";
    return {
      key: "cloudflare",
      label: "Cloudflare",
      status: "healthy",
      information: `${accountName} authenticated — billable usage APIs may require additional token permissions`,
      detail: null,
    };
  } catch (error) {
    return {
      key: "cloudflare",
      label: "Cloudflare",
      status: "down",
      information: "Unable to retrieve account information",
      detail: sanitizeProviderErrorMessage(error),
    };
  }
}

function formatGitHubReset(resetUnix: number): string {
  const reset = new Date(resetUnix * 1000);
  return reset.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export async function probeGitHubUsage(): Promise<AdminProviderUsageRow> {
  const token = process.env["GITHUB_TOKEN"]?.trim();
  if (!token) {
    return missingEnvRow(
      "github",
      "GitHub",
      "GITHUB_TOKEN is not configured",
    );
  }

  try {
    const response = await providerFetch("https://api.github.com/rate_limit", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "StudioLayer-Admin",
      },
    });
    const parsed = await readProviderJson<{
      resources?: {
        core?: { limit?: number; remaining?: number; reset?: number };
      };
    }>(response);

    if (!parsed.ok) {
      return {
        key: "github",
        label: "GitHub",
        status: "down",
        information: "Unable to retrieve API rate limit",
        detail: authFailureDetail(parsed.status, parsed.message),
      };
    }

    const core = parsed.data.resources?.core;
    if (
      core == null ||
      typeof core.limit !== "number" ||
      typeof core.remaining !== "number"
    ) {
      return {
        key: "github",
        label: "GitHub",
        status: "not_available",
        information: "Rate-limit information not returned",
        detail: "GitHub did not include core rate-limit data",
      };
    }

    const status: AdminProviderUsageRow["status"] =
      core.remaining <= 0 ? "attention" : "healthy";

    const resetSuffix =
      typeof core.reset === "number"
        ? ` · resets ${formatGitHubReset(core.reset)} UTC`
        : "";

    return {
      key: "github",
      label: "GitHub",
      status,
      information: `${formatInteger(core.remaining)} / ${formatInteger(core.limit)} API requests remaining${resetSuffix}`,
      detail: status === "attention" ? "Core API rate limit exhausted" : null,
    };
  } catch (error) {
    return {
      key: "github",
      label: "GitHub",
      status: "down",
      information: "Unable to retrieve API rate limit",
      detail: sanitizeProviderErrorMessage(error),
    };
  }
}

export const PROVIDER_PROBE_ORDER = [
  probeOpenRouterUsage,
  probeFalUsage,
  probeOpenAiUsage,
  probeRailwayUsage,
  probeNeonUsage,
  probeCloudflareUsage,
  probeGitHubUsage,
] as const;
