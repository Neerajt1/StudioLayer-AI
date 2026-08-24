import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-base-url";

type PromotionLifecycleStatus = "scheduled" | "active" | "expired";

type AdminPromotion = {
  id: number;
  name: string;
  message: string;
  startAt: string;
  endAt: string;
  badgeLabel: string;
  bonusCredits: number | null;
  bonusCreditsExpiresAt: string | null;
  enabled: boolean;
  status: PromotionLifecycleStatus;
  createdAt: string;
  updatedAt: string;
};

type PromotionFormState = {
  name: string;
  message: string;
  startDate: string;
  endDate: string;
  badgeLabel: string;
  bonusCredits: string;
  bonusCreditsExpiryMode: "no-expiry" | "date";
  bonusCreditsExpiresAt: string;
  enabled: boolean;
};

const emptyForm: PromotionFormState = {
  name: "",
  message: "",
  startDate: "",
  endDate: "",
  badgeLabel: "",
  bonusCredits: "",
  bonusCreditsExpiryMode: "no-expiry",
  bonusCreditsExpiresAt: "",
  enabled: true,
};

function formatDate(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function toDateInputValue(dateIso: string): string {
  const d = new Date(dateIso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formFromPromotion(p: AdminPromotion): PromotionFormState {
  return {
    name: p.name,
    message: p.message,
    startDate: toDateInputValue(p.startAt),
    endDate: toDateInputValue(p.endAt),
    badgeLabel: p.badgeLabel,
    bonusCredits: p.bonusCredits != null ? String(p.bonusCredits) : "",
    bonusCreditsExpiryMode: p.bonusCreditsExpiresAt ? "date" : "no-expiry",
    bonusCreditsExpiresAt: p.bonusCreditsExpiresAt
      ? toDateInputValue(p.bonusCreditsExpiresAt)
      : "",
    enabled: p.enabled,
  };
}

function buildPayload(form: PromotionFormState): Record<string, unknown> {
  const bonusRaw = form.bonusCredits.trim();
  const bonusCredits = bonusRaw ? Number(bonusRaw) : null;

  let bonusCreditsExpiresAt: string | null = null;
  if (bonusCredits != null && form.bonusCreditsExpiryMode === "date") {
    bonusCreditsExpiresAt = form.bonusCreditsExpiresAt || null;
  }

  return {
    name: form.name.trim(),
    message: form.message.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    badgeLabel: form.badgeLabel.trim(),
    bonusCredits,
    bonusCreditsExpiresAt,
    enabled: form.enabled,
  };
}

function PromotionFormFields({
  form,
  setForm,
  idPrefix,
}: {
  form: PromotionFormState;
  setForm: Dispatch<SetStateAction<PromotionFormState>>;
  idPrefix: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground" htmlFor={`${idPrefix}-name`}>
            Promotion name
          </label>
          <Input
            id={`${idPrefix}-name`}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Diwali Special"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground" htmlFor={`${idPrefix}-badge`}>
            Pricing-page badge
          </label>
          <Input
            id={`${idPrefix}-badge`}
            value={form.badgeLabel}
            onChange={(e) => setForm((f) => ({ ...f, badgeLabel: e.target.value }))}
            placeholder="DIWALI OFFER"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-muted-foreground" htmlFor={`${idPrefix}-message`}>
          Short message
        </label>
        <Textarea
          id={`${idPrefix}-message`}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          placeholder="Get 20% extra value this festive season"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground" htmlFor={`${idPrefix}-start`}>
            Start date
          </label>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground" htmlFor={`${idPrefix}-end`}>
            End date
          </label>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </div>
      </div>

      <div className="border-t pt-4 space-y-3">
        <p className="text-sm text-muted-foreground">Optional promotional Studio Credits (stored only — not granted yet)</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground" htmlFor={`${idPrefix}-bonus`}>
              Bonus credits
            </label>
            <Input
              id={`${idPrefix}-bonus`}
              inputMode="numeric"
              value={form.bonusCredits}
              onChange={(e) => setForm((f) => ({ ...f, bonusCredits: e.target.value }))}
              placeholder="Leave empty for none"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.bonusCreditsExpiryMode === "no-expiry"}
                  onChange={() =>
                    setForm((f) => ({ ...f, bonusCreditsExpiryMode: "no-expiry" }))
                  }
                />
                No expiry
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.bonusCreditsExpiryMode === "date"}
                  onChange={() =>
                    setForm((f) => ({ ...f, bonusCreditsExpiryMode: "date" }))
                  }
                />
                Expiry date
              </label>
            </div>
            <Input
              type="date"
              value={form.bonusCreditsExpiresAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, bonusCreditsExpiresAt: e.target.value }))
              }
              disabled={form.bonusCreditsExpiryMode !== "date"}
            />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
        />
        Enabled
      </label>
    </div>
  );
}

function PromotionRow({
  promotion,
  onEdit,
  onDisable,
  disableInFlight,
}: {
  promotion: AdminPromotion;
  onEdit: () => void;
  onDisable: () => void;
  disableInFlight: boolean;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-3 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium">{promotion.name}</div>
          <div className="text-sm text-muted-foreground mt-1">{promotion.message}</div>
          <div className="text-xs text-muted-foreground mt-2">
            {formatDate(promotion.startAt)} — {formatDate(promotion.endAt)}
          </div>
          <div className="text-xs mt-2">
            <span className="font-medium">{promotion.badgeLabel}</span>
            {promotion.bonusCredits != null ? (
              <span className="text-muted-foreground">
                {" "}
                • +{promotion.bonusCredits} bonus credits
                {promotion.bonusCreditsExpiresAt
                  ? ` (expires ${formatDate(promotion.bonusCreditsExpiresAt)})`
                  : " (no expiry)"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {promotion.status}
          </span>
          {!promotion.enabled ? (
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              disabled
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!promotion.enabled || disableInFlight}
          onClick={onDisable}
        >
          Disable
        </Button>
      </div>
    </div>
  );
}

export function AdminPromotions() {
  const { toast } = useToast();
  const [promotions, setPromotions] = useState<AdminPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [createForm, setCreateForm] = useState<PromotionFormState>(emptyForm);
  const [createInFlight, setCreateInFlight] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PromotionFormState>(emptyForm);
  const [editInFlight, setEditInFlight] = useState(false);
  const [disableInFlightId, setDisableInFlightId] = useState<number | null>(null);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/promotions"), {
        credentials: "include",
      });
      if (!res.ok) {
        toast({ title: "Failed to load promotions", description: `HTTP ${res.status}` });
        return;
      }
      setPromotions((await res.json()) as AdminPromotion[]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadPromotions();
  }, [loadPromotions]);

  const grouped = useMemo(() => {
    const active: AdminPromotion[] = [];
    const scheduled: AdminPromotion[] = [];
    const expired: AdminPromotion[] = [];
    for (const p of promotions) {
      if (p.status === "active") active.push(p);
      else if (p.status === "scheduled") scheduled.push(p);
      else expired.push(p);
    }
    return { active, scheduled, expired };
  }, [promotions]);

  async function handleCreate(): Promise<void> {
    setCreateInFlight(true);
    try {
      const res = await fetch(apiUrl("/api/admin/promotions"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(createForm)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Create failed",
          description: (err as { error?: string }).error ?? `HTTP ${res.status}`,
        });
        return;
      }
      toast({ title: "Promotion created" });
      setCreateForm(emptyForm);
      await loadPromotions();
    } finally {
      setCreateInFlight(false);
    }
  }

  async function handleUpdate(promotionId: number): Promise<void> {
    setEditInFlight(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/promotions/${promotionId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(editForm)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Update failed",
          description: (err as { error?: string }).error ?? `HTTP ${res.status}`,
        });
        return;
      }
      toast({ title: "Promotion updated" });
      setEditingId(null);
      await loadPromotions();
    } finally {
      setEditInFlight(false);
    }
  }

  async function handleDisable(promotionId: number): Promise<void> {
    setDisableInFlightId(promotionId);
    try {
      const res = await fetch(apiUrl(`/api/admin/promotions/${promotionId}/disable`), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        toast({ title: "Disable failed", description: `HTTP ${res.status}` });
        return;
      }
      toast({ title: "Promotion disabled" });
      await loadPromotions();
    } finally {
      setDisableInFlightId(null);
    }
  }

  function renderSection(title: string, items: AdminPromotion[]) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None</p>
        ) : (
          items.map((p) =>
            editingId === p.id ? (
              <div key={p.id} className="rounded-md border border-border p-4 space-y-4">
                <PromotionFormFields
                  form={editForm}
                  setForm={setEditForm}
                  idPrefix={`edit-${p.id}`}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingId(null)}
                    disabled={editInFlight}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleUpdate(p.id)}
                    disabled={editInFlight}
                  >
                    {editInFlight ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <PromotionRow
                key={p.id}
                promotion={p}
                onEdit={() => {
                  setEditingId(p.id);
                  setEditForm(formFromPromotion(p));
                }}
                onDisable={() => void handleDisable(p.id)}
                disableInFlight={disableInFlightId === p.id}
              />
            ),
          )
        )}
      </div>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="sl-admin-section-title">PROMOTIONS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-4 border-b pb-6">
          <p className="sl-page-subheading text-foreground">Create promotion</p>
          <PromotionFormFields
            form={createForm}
            setForm={setCreateForm}
            idPrefix="create"
          />
          <div className="flex justify-end">
            <Button onClick={() => void handleCreate()} disabled={createInFlight}>
              {createInFlight ? "Creating…" : "Create promotion"}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading promotions…</p>
        ) : (
          <div className="space-y-6">
            {renderSection("Active", grouped.active)}
            {renderSection("Scheduled", grouped.scheduled)}
            {renderSection("Expired", grouped.expired)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
