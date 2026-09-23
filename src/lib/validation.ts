import type { NewClientInput, NewServiceEntryInput } from "@/lib/types";

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** HTML `name` attributes expected by `parseNewClient`. */
export const CLIENT_FIELDS = {
  name: "name",
  email: "email",
  make: "make",
  model: "model",
  registrationNumber: "registrationNumber",
} as const;

/** HTML `name` attributes expected by `parseNewServiceEntry`. */
export const SERVICE_ENTRY_FIELDS = {
  serviceType: "serviceType",
  serviceDate: "serviceDate",
  mileage: "mileage",
  cost: "cost",
  notes: "notes",
  nextDueMileage: "nextDueMileage",
  nextDueDate: "nextDueDate",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_PATTERN = /^-?\d+$/;
const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Formats `date` as YYYY-MM-DD using its local calendar date. */
function toLocalIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseNewClient(form: FormData): ParseResult<NewClientInput> {
  const name = field(form, CLIENT_FIELDS.name);
  const email = field(form, CLIENT_FIELDS.email);
  const make = field(form, CLIENT_FIELDS.make);
  const model = field(form, CLIENT_FIELDS.model);
  const registrationNumber = field(form, CLIENT_FIELDS.registrationNumber);

  if (!name) return { ok: false, error: "Name is required" };
  if (!email) return { ok: false, error: "Email is required" };
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "Enter a valid email address" };
  if (!make) return { ok: false, error: "Make is required" };
  if (!model) return { ok: false, error: "Model is required" };
  if (!registrationNumber) return { ok: false, error: "Registration number is required" };

  return {
    ok: true,
    data: {
      name,
      email: email.toLowerCase(),
      make,
      model,
      registrationNumber: registrationNumber.toUpperCase(),
    },
  };
}

/**
 * `today` is compared by its local calendar date (YYYY-MM-DD in the runtime's time zone);
 * a service date equal to today is accepted.
 */
export function parseNewServiceEntry(form: FormData, today: Date): ParseResult<NewServiceEntryInput> {
  const serviceType = field(form, SERVICE_ENTRY_FIELDS.serviceType);
  const serviceDate = field(form, SERVICE_ENTRY_FIELDS.serviceDate);
  const mileageRaw = field(form, SERVICE_ENTRY_FIELDS.mileage);
  const costRaw = field(form, SERVICE_ENTRY_FIELDS.cost);
  const notesRaw = field(form, SERVICE_ENTRY_FIELDS.notes);
  const nextDueMileageRaw = field(form, SERVICE_ENTRY_FIELDS.nextDueMileage);
  const nextDueDateRaw = field(form, SERVICE_ENTRY_FIELDS.nextDueDate);

  if (!serviceType) return { ok: false, error: "Service type is required" };

  if (!serviceDate) return { ok: false, error: "Service date is required" };
  if (!isValidDate(serviceDate)) return { ok: false, error: "Service date must be a valid date (YYYY-MM-DD)" };
  if (serviceDate > toLocalIsoDate(today)) return { ok: false, error: "Service date cannot be in the future" };

  if (!mileageRaw) return { ok: false, error: "Mileage is required" };
  if (!INTEGER_PATTERN.test(mileageRaw)) return { ok: false, error: "Mileage must be a whole number" };
  const mileage = Number(mileageRaw);
  if (mileage < 0) return { ok: false, error: "Mileage cannot be negative" };

  if (!costRaw) return { ok: false, error: "Cost is required" };
  if (!MONEY_PATTERN.test(costRaw)) return { ok: false, error: "Cost must be a number with at most 2 decimals" };
  const cost = Number(costRaw);
  if (cost < 0) return { ok: false, error: "Cost cannot be negative" };

  if (!nextDueMileageRaw && !nextDueDateRaw) {
    return { ok: false, error: "Provide a next due mileage or a next due date" };
  }

  let nextDueMileage: number | undefined;
  if (nextDueMileageRaw) {
    if (!INTEGER_PATTERN.test(nextDueMileageRaw)) {
      return { ok: false, error: "Next due mileage must be a whole number" };
    }
    nextDueMileage = Number(nextDueMileageRaw);
    if (nextDueMileage <= mileage) {
      return { ok: false, error: "Next due mileage must be greater than the current mileage" };
    }
  }

  let nextDueDate: string | undefined;
  if (nextDueDateRaw) {
    if (!isValidDate(nextDueDateRaw)) {
      return { ok: false, error: "Next due date must be a valid date (YYYY-MM-DD)" };
    }
    if (nextDueDateRaw <= serviceDate) {
      return { ok: false, error: "Next due date must be after the service date" };
    }
    nextDueDate = nextDueDateRaw;
  }

  return {
    ok: true,
    data: {
      serviceType,
      serviceDate,
      mileage,
      cost,
      notes: notesRaw || undefined,
      nextDueMileage,
      nextDueDate,
    },
  };
}
