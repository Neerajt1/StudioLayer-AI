import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-base-url";

type AdminCustomerSearchResult = {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  subscriptionTier: string;
  createdAt: string;
};

type AdminCustomerHistoryRow = {
  transactionId: string;
  createdAt: string;
  reasonCode: string;
  amount: number;
  status: string;
  renderId: number | null;
  allocationSourceReference: string | null;
  allocationExpiresAt: string | null;
};

type AdminCustomerDetails = {
  account: {
    id: number;
    name: string;
    email: string;
    isAdmin: boolean;
    subscriptionTier: string;
    createdAt: string;
  };
  studioCredits: {
    current: number;
  };
  history: AdminCustomerHistoryRow[];
};

function formatDate(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

function parseAdminGrantNote(sourceReference: string | null): string | null {
  if (!sourceReference?.startsWith("admin-grant:")) return null;
  const parts = sourceReference.split(":");
  // admin-grant:<adminId>:<targetUserId>:<encodedReason>:<iso>:<uuid>
  const encoded = parts[3];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

export function AdminCustomersStudioCredits() {
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchInFlight, setSearchInFlight] = useState(false);
  const [results, setResults] = useState<AdminCustomerSearchResult[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [detailsInFlight, setDetailsInFlight] = useState(false);
  const [details, setDetails] = useState<AdminCustomerDetails | null>(null);

  const [creditsInput, setCreditsInput] = useState("10");
  const [expiryMode, setExpiryMode] = useState<"no-expiry" | "date">("no-expiry");
  const [expiryDate, setExpiryDate] = useState("");
  const [reason, setReason] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [grantInFlight, setGrantInFlight] = useState(false);
  const [grantSnapshot, setGrantSnapshot] = useState<{
    credits: number;
    expiresAt: string | null;
    reason: string;
  } | null>(null);

  async function searchCustomers(): Promise<void> {
    const q = searchQuery.trim();
    if (!q) return;

    setSearchInFlight(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/customers?search=${encodeURIComponent(q)}`), {
        method: "GET",
        credentials: "include",
      });

      if (res.status === 401 || res.status === 403) {
        toast({ title: "Not authorized", description: "Admin access required." });
        return;
      }

      if (!res.ok) {
        toast({ title: "Search failed", description: `HTTP ${res.status}` });
        return;
      }

      const json = (await res.json()) as AdminCustomerSearchResult[];
      setResults(json);
      const firstId = json[0]?.id ?? null;
      setSelectedUserId(firstId);
      setDetails(null);
      if (firstId != null) {
        await loadDetails(firstId);
      }
    } finally {
      setSearchInFlight(false);
    }
  }

  async function loadDetails(userId: number): Promise<void> {
    setDetailsInFlight(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/customers/${userId}`), {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        toast({ title: "Failed to load customer", description: `HTTP ${res.status}` });
        return;
      }
      const json = (await res.json()) as AdminCustomerDetails;
      setDetails(json);
    } finally {
      setDetailsInFlight(false);
    }
  }

  function openGrantConfirmation(): void {
    if (selectedUserId == null) return;

    const credits = Number(creditsInput);
    if (!Number.isInteger(credits) || credits <= 0) {
      toast({ title: "Invalid credits", description: "Credits must be a positive integer." });
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      toast({ title: "Reason required", description: "Please enter a reason/note." });
      return;
    }

    let expiresAt: string | null = null;
    if (expiryMode === "date") {
      if (!expiryDate) {
        toast({ title: "Expiry date required", description: "Choose a date or select No expiry." });
        return;
      }
      // Keep it simple: send YYYY-MM-DD (server interprets as UTC midnight).
      expiresAt = expiryDate;
    }

    setGrantSnapshot({ credits, expiresAt, reason: trimmedReason });
    setConfirmOpen(true);
  }

  async function confirmGrant(): Promise<void> {
    if (selectedUserId == null || !grantSnapshot) return;
    setGrantInFlight(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/customers/${selectedUserId}/studio-credits/grant`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credits: grantSnapshot.credits,
          expiresAt: grantSnapshot.expiresAt,
          reason: grantSnapshot.reason,
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        toast({ title: "Grant failed", description: `HTTP ${res.status}${msg ? `: ${msg}` : ""}` });
        return;
      }

      toast({ title: "Studio Credits granted", description: "Balance and history refreshed." });
      setConfirmOpen(false);
      setGrantSnapshot(null);
      setReason("");

      // Refresh customer details after grant.
      await loadDetails(selectedUserId);
    } finally {
      setGrantInFlight(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="sl-admin-section-title">CUSTOMERS & STUDIO CREDITS</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="sl-page-subheading text-foreground">Search</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm text-muted-foreground" htmlFor="admin-customer-search">
                Email, name, or user ID
              </label>
              <Input
                id="admin-customer-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. neeraj@domain.com or 123"
                className="mt-2"
              />
            </div>
            <Button
              onClick={() => void searchCustomers()}
              disabled={searchInFlight || searchQuery.trim().length === 0}
              className="h-9"
            >
              {searchInFlight ? "Searching…" : "Search"}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <p className="sl-page-subheading text-foreground">Results</p>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results yet.</p>
          ) : (
            <div className="space-y-2">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-left rounded-md border border-border px-3 py-2 hover:bg-accent/20 transition-colors"
                  onClick={() => {
                    setSelectedUserId(r.id);
                    void loadDetails(r.id);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-sm text-muted-foreground truncate">{r.email}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ID {r.id} • {r.subscriptionTier} {r.isAdmin ? "• admin" : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="sl-page-subheading text-foreground">Customer Details</p>
          {detailsInFlight ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : details == null ? (
            <p className="text-sm text-muted-foreground">Select a customer to view details.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Name</div>
                  <div className="font-medium">{details.account.name}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Email</div>
                  <div className="font-medium">{details.account.email}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Subscription</div>
                  <div className="font-medium">{details.account.subscriptionTier}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Account Created</div>
                  <div className="font-medium">{formatDate(details.account.createdAt)}</div>
                </div>
                <div className="space-y-1 col-span-2">
                  <div className="text-sm text-muted-foreground">Current Studio Credits</div>
                  <div className="text-2xl font-semibold">{details.studioCredits.current}</div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="sl-page-subheading text-foreground">Credit History (Ledger)</p>
                <div className="space-y-2">
                  {details.history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No ledger rows found.</p>
                  ) : (
                    details.history.slice(0, 20).map((row) => {
                      const note = parseAdminGrantNote(row.allocationSourceReference);
                      const absCredits = Math.abs(row.amount);
                      const isAdd = row.amount > 0;
                      return (
                        <div
                          key={row.transactionId}
                          className="rounded-md border border-border px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {row.reasonCode}
                                {note ? ` • ${note}` : ""}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatDate(row.createdAt)} • status {row.status}
                              </div>
                              {row.renderId != null ? (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Render #{row.renderId}
                                </div>
                              ) : null}
                            </div>
                            <div className={`text-sm font-semibold whitespace-nowrap ${isAdd ? "text-foreground" : "text-muted-foreground"}`}>
                              {isAdd ? "+" : "-"}
                              {absCredits}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="sl-page-subheading text-foreground">Grant Studio Credits</p>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-1">
                    <label className="text-sm text-muted-foreground" htmlFor="grant-credits">
                      Credits
                    </label>
                    <Input
                      id="grant-credits"
                      inputMode="numeric"
                      value={creditsInput}
                      onChange={(e) => setCreditsInput(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          checked={expiryMode === "no-expiry"}
                          onChange={() => setExpiryMode("no-expiry")}
                        />
                        No expiry
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          checked={expiryMode === "date"}
                          onChange={() => setExpiryMode("date")}
                        />
                        Expiry date
                      </label>
                    </div>

                    <Input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      disabled={expiryMode !== "date"}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground" htmlFor="grant-reason">
                    Reason / note
                  </label>
                  <Textarea
                    id="grant-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Short admin reason (shown in ledger source reference)"
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-end gap-3">
                  <Button
                    onClick={() => openGrantConfirmation()}
                    disabled={grantInFlight || selectedUserId == null}
                  >
                    Grant Studio Credits
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Credit Grant</AlertDialogTitle>
              <AlertDialogDescription>
                This will create a new `admin_grant_allocation` credit lot for the selected customer.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Credits:</span>{" "}
                <span className="font-medium">{grantSnapshot?.credits ?? 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Expiry:</span>{" "}
                <span className="font-medium">
                  {grantSnapshot?.expiresAt ? formatDate(grantSnapshot.expiresAt) : "No expiry"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Reason:</span>{" "}
                <span className="font-medium break-words">{grantSnapshot?.reason ?? ""}</span>
              </div>
            </div>

            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel disabled={grantInFlight}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void confirmGrant()}
                disabled={grantInFlight}
              >
                {grantInFlight ? "Granting…" : "Confirm & Grant"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

