/** UTC start of calendar day (inclusive). */
export function parseAdminFromDate(input: unknown): Date {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("fromDate is required");
  }
  const trimmed = input.trim();
  const normalized =
    trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    throw new Error("fromDate is not a valid date");
  }
  return d;
}

/** UTC end of calendar day (inclusive through 23:59:59.999). */
export function parseAdminToDate(input: unknown): Date {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("toDate is required");
  }
  const trimmed = input.trim();
  if (trimmed.length === 10) {
    const start = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new Error("toDate is not a valid date");
    }
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new Error("toDate is not a valid date");
  }
  return d;
}

export function parseAdminGenerationsDateRange(query: {
  fromDate?: unknown;
  toDate?: unknown;
}): { fromDate: string; toDate: string; from: Date; to: Date } {
  const fromDate =
    typeof query.fromDate === "string" ? query.fromDate.trim() : "";
  const toDate = typeof query.toDate === "string" ? query.toDate.trim() : "";

  if (!fromDate || !toDate) {
    throw new Error("fromDate and toDate are required");
  }

  const from = parseAdminFromDate(fromDate);
  const to = parseAdminToDate(toDate);

  if (to.getTime() < from.getTime()) {
    throw new Error("toDate must be on or after fromDate");
  }

  return { fromDate, toDate, from, to };
}

export function adminGenerationsExportFilename(
  fromDate: string,
  toDate: string,
): string {
  return `StudioLayer Admin Generations - ${fromDate} to ${toDate}.xlsx`;
}
