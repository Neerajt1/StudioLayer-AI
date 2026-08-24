import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-base-url";

type StudioCreditsSummary = {
  creditsAdded: number;
  membershipCreditsGranted: number;
  promotionalCreditsGranted: number;
  creditsConsumed: number;
};

type StudioCreditsCurrentPosition = {
  totalCreditsRemaining: number;
  customersWithPositiveBalance: number;
};

type CreditExpirationDateSummary = {
  date: string;
  creditsExpiring: number;
  customersAffected: number;
};

type CreditExpirationOverview = {
  dateRange: {
    fromDate: string;
    toDate: string;
  };
  totalCreditsExpiring: number;
  customersAffected: number;
  byDate: CreditExpirationDateSummary[];
};

type AdminStudioCreditsOverview = {
  dateRange: {
    fromDate: string;
    toDate: string;
  };
  summary: StudioCreditsSummary;
  currentPosition: StudioCreditsCurrentPosition;
  expiration: CreditExpirationOverview;
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

function defaultExpirationFromDate(): string {
  return defaultToDate();
}

function defaultExpirationToDate(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30),
  );
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
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

export function AdminStudioCredits() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [appliedFromDate, setAppliedFromDate] = useState(defaultFromDate);
  const [appliedToDate, setAppliedToDate] = useState(defaultToDate);
  const [expirationFromDate, setExpirationFromDate] = useState(
    defaultExpirationFromDate,
  );
  const [expirationToDate, setExpirationToDate] = useState(defaultExpirationToDate);
  const [appliedExpirationFromDate, setAppliedExpirationFromDate] = useState(
    defaultExpirationFromDate,
  );
  const [appliedExpirationToDate, setAppliedExpirationToDate] = useState(
    defaultExpirationToDate,
  );
  const [data, setData] = useState<AdminStudioCreditsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(
    async (
      from: string,
      to: string,
      expFrom: string,
      expTo: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          fromDate: from,
          toDate: to,
          expirationFromDate: expFrom,
          expirationToDate: expTo,
        });
        const res = await fetch(apiUrl(`/api/admin/studio-credits?${params}`), {
          credentials: "include",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(body?.error ?? `Failed to load (${res.status})`);
          return;
        }
        setData((await res.json()) as AdminStudioCreditsOverview);
      } catch {
        setError("Failed to load Studio Credits overview");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(
      appliedFromDate,
      appliedToDate,
      appliedExpirationFromDate,
      appliedExpirationToDate,
    );
  }, [
    load,
    appliedFromDate,
    appliedToDate,
    appliedExpirationFromDate,
    appliedExpirationToDate,
  ]);

  const handlePeriodApply = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
  };

  const handleExpirationApply = () => {
    setAppliedExpirationFromDate(expirationFromDate);
    setAppliedExpirationToDate(expirationToDate);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const params = new URLSearchParams({
        fromDate: appliedFromDate,
        toDate: appliedToDate,
        expirationFromDate: appliedExpirationFromDate,
        expirationToDate: appliedExpirationToDate,
      });
      const res = await fetch(
        apiUrl(`/api/admin/studio-credits/export?${params}`),
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const filename =
        parseContentDispositionFilename(res.headers.get("Content-Disposition")) ??
        `StudioLayer Admin Studio Credits - ${appliedFromDate} to ${appliedToDate}.xlsx`;
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
        <CardTitle className="sl-admin-section-title">STUDIO CREDITS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="studio-credits-from-date" className="text-sm text-muted-foreground">
              From
            </label>
            <Input
              id="studio-credits-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="studio-credits-to-date" className="text-sm text-muted-foreground">
              To
            </label>
            <Input
              id="studio-credits-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <Button type="button" variant="outline" onClick={handlePeriodApply} disabled={loading}>
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

        {loading && !data ? (
          <p className="text-sm text-muted-foreground">Loading Studio Credits…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : data ? (
          <>
            <div className="space-y-3">
              <p className="sl-page-subheading text-foreground">Period summary</p>
              <p className="text-sm text-muted-foreground">
                {data.dateRange.fromDate} to {data.dateRange.toDate} (UTC)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Credits added</div>
                  <div className="text-2xl font-semibold">
                    {data.summary.creditsAdded}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Promotional / bonus credits
                  </div>
                  <div className="text-2xl font-semibold">
                    {data.summary.promotionalCreditsGranted}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Credits consumed</div>
                  <div className="text-2xl font-semibold">
                    {data.summary.creditsConsumed}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Current outstanding
                  </div>
                  <div className="text-2xl font-semibold">
                    {data.currentPosition.totalCreditsRemaining}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Current balance
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t pt-6">
              <p className="sl-page-subheading text-foreground">
                Current credit position
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-xl">
                <div>
                  <div className="text-sm text-muted-foreground">
                    Total credits remaining
                  </div>
                  <div className="text-xl font-semibold">
                    {data.currentPosition.totalCreditsRemaining}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Customers with balance
                  </div>
                  <div className="text-xl font-semibold">
                    {data.currentPosition.customersWithPositiveBalance}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-6">
              <p className="sl-page-subheading text-foreground">Credit expiration</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="studio-credits-expiration-from-date"
                    className="text-sm text-muted-foreground"
                  >
                    Expiration from
                  </label>
                  <Input
                    id="studio-credits-expiration-from-date"
                    type="date"
                    value={expirationFromDate}
                    onChange={(e) => setExpirationFromDate(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="studio-credits-expiration-to-date"
                    className="text-sm text-muted-foreground"
                  >
                    Expiration to
                  </label>
                  <Input
                    id="studio-credits-expiration-to-date"
                    type="date"
                    value={expirationToDate}
                    onChange={(e) => setExpirationToDate(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExpirationApply}
                  disabled={loading}
                >
                  Apply
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                {data.expiration.dateRange.fromDate} to{" "}
                {data.expiration.dateRange.toDate} (UTC)
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-xl">
                <div>
                  <div className="text-sm text-muted-foreground">
                    Unused credits expiring during selected period
                  </div>
                  <div className="text-xl font-semibold">
                    {data.expiration.totalCreditsExpiring}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Customers affected
                  </div>
                  <div className="text-xl font-semibold">
                    {data.expiration.customersAffected}
                  </div>
                </div>
              </div>

              {data.expiration.byDate.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No unused credits expire during this period.
                </p>
              ) : (
                <div className="overflow-x-auto border border-border rounded-md max-w-2xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left font-medium px-3 py-2">Date</th>
                        <th className="text-left font-medium px-3 py-2">
                          Credits expiring
                        </th>
                        <th className="text-left font-medium px-3 py-2">
                          Customers affected
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expiration.byDate.map((row) => (
                        <tr key={row.date} className="border-b border-border last:border-0">
                          <td className="px-3 py-3 align-top">
                            {formatDisplayDate(row.date)}
                          </td>
                          <td className="px-3 py-3 align-top">{row.creditsExpiring}</td>
                          <td className="px-3 py-3 align-top">
                            {row.customersAffected}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}

        {downloadError ? (
          <p className="text-sm text-muted-foreground">{downloadError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
