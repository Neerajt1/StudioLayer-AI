import {
  parseAdminFromDate,
  parseAdminToDate,
} from "./admin-generations-date-range.js";

export function utcDateInputValue(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addUtcCalendarDays(dateInput: string, days: number): string {
  const start = parseAdminFromDate(dateInput);
  const next = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return utcDateInputValue(next);
}

export function utcStartOfToday(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function parseAdminExpirationDateRange(
  query: { expirationFromDate?: unknown; expirationToDate?: unknown },
  now = new Date(),
): { expirationFromDate: string; expirationToDate: string; from: Date; to: Date } {
  const expirationFromDate =
    typeof query.expirationFromDate === "string"
      ? query.expirationFromDate.trim()
      : "";
  const expirationToDate =
    typeof query.expirationToDate === "string"
      ? query.expirationToDate.trim()
      : "";

  if (!expirationFromDate || !expirationToDate) {
    throw new Error("expirationFromDate and expirationToDate are required");
  }

  const from = parseAdminFromDate(expirationFromDate);
  const to = parseAdminToDate(expirationToDate);

  if (to.getTime() < from.getTime()) {
    throw new Error("expirationToDate must be on or after expirationFromDate");
  }

  const todayStart = utcStartOfToday(now);
  if (from.getTime() >= todayStart.getTime()) {
    const maxTo = parseAdminToDate(addUtcCalendarDays(expirationFromDate, 30));
    if (to.getTime() > maxTo.getTime()) {
      throw new Error("Expiration range cannot exceed 30 days");
    }
  }

  return { expirationFromDate, expirationToDate, from, to };
}

export function defaultExpirationFromDate(now = new Date()): string {
  return utcDateInputValue(now);
}

export function defaultExpirationToDate(now = new Date()): string {
  return addUtcCalendarDays(utcDateInputValue(now), 30);
}
