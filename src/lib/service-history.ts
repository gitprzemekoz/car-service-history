import type { ServiceEntry } from "@/lib/types";

// Dates are "YYYY-MM-DD" with no time; formatting in UTC keeps the day stable across runtimes.
const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const numberFormat = new Intl.NumberFormat("pl-PL");
const costFormat = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

export interface NextService {
  date: string | null;
  mileage: number | null;
}

// Newest first: service_date desc, then created_at desc for entries on the same day.
export function sortNewestFirst(entries: ServiceEntry[]): ServiceEntry[] {
  return [...entries].sort(
    (a, b) => b.service_date.localeCompare(a.service_date) || b.created_at.localeCompare(a.created_at),
  );
}

export function formatServiceDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return dateFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatMileage(mileage: number): string {
  return `${numberFormat.format(mileage)} km`;
}

export function formatCost(cost: number | null): string {
  return cost === null ? "—" : costFormat.format(cost);
}

// Only the newest entry counts: an older entry's next-due fields are superseded by later service.
export function nextService(entries: ServiceEntry[]): NextService | null {
  if (entries.length === 0) {
    return null;
  }
  const newest = sortNewestFirst(entries)[0];
  if (newest.next_due_date === null && newest.next_due_mileage === null) {
    return null;
  }
  return { date: newest.next_due_date, mileage: newest.next_due_mileage };
}
