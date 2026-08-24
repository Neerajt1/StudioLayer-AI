import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-base-url";

type AdminProviderUsageStatus =
  | "healthy"
  | "attention"
  | "down"
  | "not_configured"
  | "not_available";

type AdminProviderUsageRow = {
  key: string;
  label: string;
  status: AdminProviderUsageStatus;
  information: string;
  detail: string | null;
};

type AdminProviderUsageResponse = {
  checkedAt: string;
  providers: AdminProviderUsageRow[];
};

function statusLabel(status: AdminProviderUsageStatus): string {
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

function isUnhealthyStatus(status: AdminProviderUsageStatus): boolean {
  return (
    status === "down" ||
    status === "attention" ||
    status === "not_configured" ||
    status === "not_available"
  );
}

function formatCheckedAt(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
}

export function AdminProviderUsage() {
  const [data, setData] = useState<AdminProviderUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/admin/provider-usage"), {
        credentials: "include",
      });
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      setData((await res.json()) as AdminProviderUsageResponse);
    } catch {
      setError("Failed to refresh provider usage");
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="sl-admin-section-title">
            AI & INFRASTRUCTURE
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1">
          <p className="sl-page-subheading text-foreground">
            Live provider information
          </p>
          {data ? (
            <p className="text-sm text-muted-foreground">
              Last checked {formatCheckedAt(data.checkedAt)} UTC
            </p>
          ) : null}
        </div>

        {loading && !data ? (
          <p className="text-sm text-muted-foreground">Refreshing providers…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : data ? (
          <div className="overflow-x-auto border border-border rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium px-3 py-2">Provider</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="text-left font-medium px-3 py-2">
                    Latest information
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((provider) => {
                  const showDetail = isUnhealthyStatus(provider.status);

                  return (
                    <tr key={provider.key} className="border-b border-border last:border-0">
                      <td className="px-3 py-3 align-top font-medium whitespace-nowrap">
                        {provider.label}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <div>{statusLabel(provider.status)}</div>
                        {showDetail && provider.detail ? (
                          <div className="text-muted-foreground mt-1 max-w-[240px]">
                            {provider.detail}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top text-muted-foreground">
                        {provider.information}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
