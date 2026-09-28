import { describe, expect, it } from "vitest";
import { formatCost, formatMileage, formatServiceDate, nextService, sortNewestFirst } from "./service-history";
import type { ServiceEntry } from "./types";

// Intl uses non-breaking spaces (U+00A0 / U+202F) for grouping and the currency suffix.
const normalize = (value: string) => value.replace(/\s/g, " ");

function entry(overrides: Partial<ServiceEntry>): ServiceEntry {
  return {
    id: "e1",
    vehicle_id: "v1",
    mechanic_id: "m1",
    service_type: "Oil change",
    service_date: "2026-09-23",
    mileage: 85000,
    cost: 150,
    notes: null,
    next_due_mileage: null,
    next_due_date: null,
    created_at: "2026-09-23T10:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

describe("sortNewestFirst", () => {
  it("sorts by service_date desc, then created_at desc on the same day", () => {
    const older = entry({ id: "older", service_date: "2026-01-01" });
    const sameDayEarly = entry({ id: "early", created_at: "2026-09-23T08:00:00Z" });
    const sameDayLate = entry({ id: "late", created_at: "2026-09-23T12:00:00Z" });

    const sorted = sortNewestFirst([older, sameDayEarly, sameDayLate]);

    expect(sorted.map((e) => e.id)).toEqual(["late", "early", "older"]);
  });

  it("does not mutate the input", () => {
    const input = [entry({ id: "a", service_date: "2026-01-01" }), entry({ id: "b" })];

    sortNewestFirst(input);

    expect(input.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("formatServiceDate", () => {
  it("formats as pl-PL day, short month, year", () => {
    expect(formatServiceDate("2026-09-23")).toBe("23 wrz 2026");
  });

  it("keeps the day at a month and year boundary", () => {
    expect(formatServiceDate("2026-01-01")).toBe("1 sty 2026");
  });
});

describe("formatMileage", () => {
  it("groups thousands with pl-PL spacing", () => {
    expect(normalize(formatMileage(85000))).toBe("85 000 km");
  });

  it("does not group 4-digit numbers (correct Polish typography)", () => {
    expect(formatMileage(8500)).toBe("8500 km");
  });
});

describe("formatCost", () => {
  it("formats as PLN with a decimal comma", () => {
    expect(normalize(formatCost(150))).toBe("150,00 zł");
  });

  it("formats zero as a real cost", () => {
    expect(normalize(formatCost(0))).toBe("0,00 zł");
  });

  it("renders a dash for a missing cost", () => {
    expect(formatCost(null)).toBe("—");
  });
});

describe("nextService", () => {
  it("returns the newest entry's next-due fields", () => {
    const entries = [
      entry({ id: "old", service_date: "2025-09-23", next_due_mileage: 70000 }),
      entry({ id: "new", next_due_date: "2027-09-23", next_due_mileage: 100000 }),
    ];

    expect(nextService(entries)).toEqual({ date: "2027-09-23", mileage: 100000 });
  });

  it("returns only the fields that exist", () => {
    expect(nextService([entry({ next_due_mileage: 100000 })])).toEqual({ date: null, mileage: 100000 });
  });

  it("returns null when the newest entry has neither field, even if an older entry has one", () => {
    const entries = [
      entry({ id: "old", service_date: "2025-09-23", next_due_date: "2026-09-23", next_due_mileage: 70000 }),
      entry({ id: "new" }),
    ];

    expect(nextService(entries)).toBeNull();
  });

  it("returns null for no entries", () => {
    expect(nextService([])).toBeNull();
  });
});
