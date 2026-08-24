import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-base-url";

type AdminHealthStatus =
  | "healthy"
  | "attention"
  | "down"
  | "not_monitored";

type AdminSystemHealthResponse = {
  checkedAt: string;
  overallStatus: AdminHealthStatus;
  components: Array<{
    key: string;
    label: string;
    status: AdminHealthStatus;
    detail: string;
  }>;
};

function statusLabel(status: AdminHealthStatus): string {
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

function isUnhealthyStatus(status: AdminHealthStatus): boolean {
  return status === "down" || status === "attention";
}

function worstUnhealthyDetail(
  components: AdminSystemHealthResponse["components"],
): string | null {
  const unhealthy = components.filter((component) =>
    isUnhealthyStatus(component.status),
  );
  if (unhealthy.length === 0) return null;

  const statusRank: Record<AdminHealthStatus, number> = {
    not_monitored: 0,
    healthy: 1,
    attention: 2,
    down: 3,
  };

  unhealthy.sort(
    (a, b) => statusRank[b.status] - statusRank[a.status],
  );
  return unhealthy[0]?.detail ?? null;
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

export function AdminSystemHealth() {
  const [data, setData] = useState<AdminSystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/admin/system-health"), {
        credentials: "include",
      });
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      setData((await res.json()) as AdminSystemHealthResponse);
    } catch {
      setError("Failed to load system health");
    } finally {
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
          <CardTitle className="sl-admin-section-title">SYSTEM HEALTH</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && !data ? (
          <p className="text-sm text-muted-foreground">Checking system health…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : data ? (
          <>
            <div className="space-y-2">
              <p className="sl-page-subheading text-foreground">Overall StudioLayer status</p>
              <p className="text-2xl font-semibold">{statusLabel(data.overallStatus)}</p>
              {isUnhealthyStatus(data.overallStatus) ? (
                <p className="text-sm text-muted-foreground">
                  {worstUnhealthyDetail(data.components)}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Last checked {formatCheckedAt(data.checkedAt)} UTC
              </p>
            </div>

            <div className="space-y-3 border-t pt-6">
              {data.components.map((component) => {
                const unhealthy = isUnhealthyStatus(component.status);

                return (
                  <div
                    key={component.key}
                    className="rounded-md border border-border px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{component.label}</div>
                        {!unhealthy && component.detail ? (
                          <div className="text-sm text-muted-foreground mt-1">
                            {component.detail}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium whitespace-nowrap">
                          {statusLabel(component.status)}
                        </div>
                        {unhealthy && component.detail ? (
                          <div className="text-sm text-muted-foreground mt-1 max-w-[240px] ml-auto">
                            {component.detail}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
