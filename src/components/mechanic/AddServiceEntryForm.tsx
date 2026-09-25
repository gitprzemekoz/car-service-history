import React, { useState } from "react";
import { Calendar, CalendarClock, Gauge, Plus, Wallet, Wrench } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { SERVICE_ENTRY_FIELDS } from "@/lib/validation";

type Field = keyof typeof SERVICE_ENTRY_FIELDS;

interface Props {
  clientId: string;
  /** YYYY-MM-DD computed on the server, so it matches the date the API validates against. */
  defaultServiceDate: string;
  serverError?: string | null;
}

export default function AddServiceEntryForm({ clientId, defaultServiceDate, serverError }: Props) {
  const [values, setValues] = useState<Record<Field, string>>({
    serviceType: "",
    serviceDate: defaultServiceDate,
    mileage: "",
    cost: "",
    notes: "",
    nextDueMileage: "",
    nextDueDate: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  // Required-field checks only; the full rules live in parseNewServiceEntry on the server.
  function validate() {
    const next: typeof errors = {};

    if (!values.serviceType.trim()) next.serviceType = "Service type is required";
    if (!values.serviceDate.trim()) next.serviceDate = "Service date is required";
    if (!values.mileage.trim()) next.mileage = "Mileage is required";
    if (!values.cost.trim()) next.cost = "Cost is required";
    if (!values.nextDueMileage.trim() && !values.nextDueDate.trim()) {
      next.nextDueMileage = "Provide a next due mileage or a next due date";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function update(field: Field, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    // Either next-due field satisfies the "at least one" rule reported on nextDueMileage.
    if (field === "nextDueDate" && errors.nextDueMileage) {
      setErrors((prev) => ({ ...prev, nextDueMileage: undefined }));
    }
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form
      method="POST"
      action={`/api/clients/${encodeURIComponent(clientId)}/entries`}
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id={SERVICE_ENTRY_FIELDS.serviceType}
        label="Service type"
        value={values.serviceType}
        onChange={(v) => {
          update("serviceType", v);
        }}
        placeholder="Oil change"
        error={errors.serviceType}
        icon={<Wrench className="size-4" />}
      />

      <FormField
        id={SERVICE_ENTRY_FIELDS.serviceDate}
        type="date"
        label="Service date"
        value={values.serviceDate}
        onChange={(v) => {
          update("serviceDate", v);
        }}
        error={errors.serviceDate}
        icon={<Calendar className="size-4" />}
      />

      <FormField
        id={SERVICE_ENTRY_FIELDS.mileage}
        type="number"
        label="Mileage (km)"
        value={values.mileage}
        onChange={(v) => {
          update("mileage", v);
        }}
        placeholder="85000"
        error={errors.mileage}
        icon={<Gauge className="size-4" />}
      />

      <FormField
        id={SERVICE_ENTRY_FIELDS.cost}
        type="number"
        label="Cost"
        value={values.cost}
        onChange={(v) => {
          update("cost", v);
        }}
        placeholder="150.00"
        error={errors.cost}
        icon={<Wallet className="size-4" />}
      />

      <div>
        <label htmlFor={SERVICE_ENTRY_FIELDS.notes} className="text-foreground mb-1 block text-sm">
          Notes (optional)
        </label>
        <textarea
          id={SERVICE_ENTRY_FIELDS.notes}
          name={SERVICE_ENTRY_FIELDS.notes}
          rows={3}
          value={values.notes}
          onChange={(e) => {
            update("notes", e.target.value);
          }}
          className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-lg border px-3 py-2 transition-colors focus:ring-2 focus:outline-none"
        />
      </div>

      <FormField
        id={SERVICE_ENTRY_FIELDS.nextDueMileage}
        type="number"
        label="Next due mileage (km)"
        value={values.nextDueMileage}
        onChange={(v) => {
          update("nextDueMileage", v);
        }}
        placeholder="100000"
        error={errors.nextDueMileage}
        icon={<Gauge className="size-4" />}
      />

      <FormField
        id={SERVICE_ENTRY_FIELDS.nextDueDate}
        type="date"
        label="Next due date"
        value={values.nextDueDate}
        onChange={(v) => {
          update("nextDueDate", v);
        }}
        error={errors.nextDueDate}
        icon={<CalendarClock className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Adding entry..." icon={<Plus className="size-4" />}>
        Add service entry
      </SubmitButton>
    </form>
  );
}
