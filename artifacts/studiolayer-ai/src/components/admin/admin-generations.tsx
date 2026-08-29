import { formatCreditAmount } from '@workspace/studio-credit-engine';
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-base-url";

type UsageMetrics = {
  totalGenerations: number;
  imagesCreated: number;
  editsMade: number;
  studioCreditsUsed: number;
};

type AdminGenerationsOverview = {
  dateRange: {
    fromDate: string;
    toDate: string;
  };
  summary: UsageMetrics;
};

function defaultFromDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function defaultToDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }
  const plainMatch = header.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() ?? null;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MetricsGrid({ metrics }: { metrics: UsageMetrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <div className="text-sm text-muted-foreground">Generations</div>
        <div className="text-2xl font-semibold">{metrics.totalGenerations}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Images created</div>
        <div className="text-2xl font-semibold">{metrics.imagesCreated}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Edits made</div>
        <div className="text-2xl font-semibold">{metrics.editsMade}</div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Studio Credits consumed</div>
        <div className="text-2xl font-semibold">{formatCreditAmount(metrics.studioCreditsUsed)}</div>
      </div>
    </div>
  );
}

export function AdminGenerations() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [appliedFromDate, setAppliedFromDate] = useState(defaultFromDate);
  const [appliedToDate, setAppliedToDate] = useState(defaultToDate);
  const [data, setData] = useState<AdminGenerationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ fromDate: from, toDate: to });
      const res = await fetch(apiUrl(`/api/admin/generations?${params}`), {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Failed to load (${res.status})`);
        return;
      }
      setData((await res.json()) as AdminGenerationsOverview);
    } catch {
      setError("Failed to load generations summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(appliedFromDate, appliedToDate);
  }, [load, appliedFromDate, appliedToDate]);

  const handleApply = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const params = new URLSearchParams({
        fromDate: appliedFromDate,
        toDate: appliedToDate,
      });
      const res = await fetch(
        apiUrl(`/api/admin/generations/export?${params}`),
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const filename =
        parseContentDispositionFilename(res.headers.get("Content-Disposition")) ??
        `StudioLayer Admin Generations - ${appliedFromDate} to ${appliedToDate}.xlsx`;
      downloadBlob(blob, filename);
    } catch (downloadErr) {
      setDownloadError(
        downloadErr instanceof Error
          ? downloadErr.message
          : "Failed to download Excel report",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="sl-admin-section-title">GENERATIONS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="generations-from-date" className="text-sm text-muted-foreground">
              From
            </label>
            <Input
              id="generations-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="generations-to-date" className="text-sm text-muted-foreground">
              To
            </label>
            <Input
              id="generations-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <Button type="button" variant="outline" onClick={handleApply} disabled={loading}>
            Apply
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDownload()}
            disabled={loading || downloading}
          >
            {downloading ? "Preparing…" : "Download Excel"}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading summary…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : data ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {data.dateRange.fromDate} to {data.dateRange.toDate} (UTC)
            </p>
            <MetricsGrid metrics={data.summary} />
          </div>
        ) : null}

        {downloadError ? (
          <p className="text-sm text-muted-foreground">{downloadError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
