import { describe, expect, it } from "vitest";
import { parseNewClient, parseNewServiceEntry } from "./validation";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const validClient = {
  name: "Jan Kowalski",
  email: "jan@example.com",
  make: "Toyota",
  model: "Corolla",
  registrationNumber: "WA 12345",
};

const today = new Date(2026, 8, 23);

const validEntry = {
  serviceType: "Oil change",
  serviceDate: "2026-09-20",
  mileage: "120000",
  cost: "350.50",
  notes: "",
  nextDueMileage: "135000",
  nextDueDate: "2027-09-20",
};

describe("parseNewClient", () => {
  it("accepts a valid client", () => {
    expect(parseNewClient(form(validClient))).toEqual({ ok: true, data: validClient });
  });

  it("rejects a missing field", () => {
    expect(parseNewClient(form({ ...validClient, model: "   " }))).toEqual({ ok: false, error: "Model is required" });
  });

  it("rejects an invalid email", () => {
    expect(parseNewClient(form({ ...validClient, email: "jan@example" }))).toEqual({
      ok: false,
      error: "Enter a valid email address",
    });
  });

  it("trims and lowercases the email and uppercases the registration number", () => {
    const result = parseNewClient(
      form({ ...validClient, email: "  Jan@Example.COM ", registrationNumber: " wa 12345 " }),
    );
    expect(result).toEqual({
      ok: true,
      data: { ...validClient, email: "jan@example.com", registrationNumber: "WA 12345" },
    });
  });
});

describe("parseNewServiceEntry", () => {
  it("accepts a valid entry, turning empty notes into undefined", () => {
    expect(parseNewServiceEntry(form(validEntry), today)).toEqual({
      ok: true,
      data: {
        serviceType: "Oil change",
        serviceDate: "2026-09-20",
        mileage: 120000,
        cost: 350.5,
        notes: undefined,
        nextDueMileage: 135000,
        nextDueDate: "2027-09-20",
      },
    });
  });

  it("rejects a missing service type", () => {
    expect(parseNewServiceEntry(form({ ...validEntry, serviceType: "" }), today)).toEqual({
      ok: false,
      error: "Service type is required",
    });
  });

  it("rejects an invalid service date", () => {
    const result = parseNewServiceEntry(form({ ...validEntry, serviceDate: "2026-02-30" }), today);
    expect(result.ok).toBe(false);
  });

  it("rejects a service date in the future", () => {
    expect(parseNewServiceEntry(form({ ...validEntry, serviceDate: "2026-09-24" }), today)).toEqual({
      ok: false,
      error: "Service date cannot be in the future",
    });
  });

  it("accepts a service date equal to today", () => {
    const result = parseNewServiceEntry(form({ ...validEntry, serviceDate: "2026-09-23" }), today);
    expect(result.ok).toBe(true);
  });

  it("rejects negative mileage", () => {
    expect(parseNewServiceEntry(form({ ...validEntry, mileage: "-1" }), today)).toEqual({
      ok: false,
      error: "Mileage cannot be negative",
    });
  });

  it("rejects non-integer mileage", () => {
    const result = parseNewServiceEntry(form({ ...validEntry, mileage: "1200.5" }), today);
    expect(result.ok).toBe(false);
  });

  it("rejects negative cost", () => {
    expect(parseNewServiceEntry(form({ ...validEntry, cost: "-10" }), today)).toEqual({
      ok: false,
      error: "Cost cannot be negative",
    });
  });

  it("rejects cost with more than 2 decimals", () => {
    const result = parseNewServiceEntry(form({ ...validEntry, cost: "10.999" }), today);
    expect(result.ok).toBe(false);
  });

  it("rejects an entry with neither next-due field", () => {
    expect(parseNewServiceEntry(form({ ...validEntry, nextDueMileage: "", nextDueDate: "" }), today)).toEqual({
      ok: false,
      error: "Provide a next due mileage or a next due date",
    });
  });

  it("accepts an entry with only one next-due field", () => {
    const result = parseNewServiceEntry(form({ ...validEntry, nextDueDate: "" }), today);
    expect(result).toMatchObject({ ok: true, data: { nextDueMileage: 135000, nextDueDate: undefined } });
  });

  it("rejects a next due mileage not greater than the current mileage", () => {
    expect(parseNewServiceEntry(form({ ...validEntry, nextDueMileage: "120000" }), today)).toEqual({
      ok: false,
      error: "Next due mileage must be greater than the current mileage",
    });
  });

  it("rejects a next due date not after the service date", () => {
    expect(parseNewServiceEntry(form({ ...validEntry, nextDueDate: "2026-09-20" }), today)).toEqual({
      ok: false,
      error: "Next due date must be after the service date",
    });
  });

  it("keeps non-empty notes", () => {
    const result = parseNewServiceEntry(form({ ...validEntry, notes: "  Replaced filter  " }), today);
    expect(result).toMatchObject({ ok: true, data: { notes: "Replaced filter" } });
  });
});
